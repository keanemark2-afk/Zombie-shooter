import { Vector3, type Camera } from 'three';
import type { ZoneGroup } from '../combat/damage';
import type { GunEvent, WeaponDef } from '../combat/weapons';
import { settings } from '../config/settings';
import { tuning } from '../config/tuning';
import type { ZombieVoice } from '../enemies/zombie';
import type { Surface } from '../world/props';

// Every sound in the game is synthesised here with the Web Audio API, so there
// are no sound files at all (and nothing borrowed from anyone else).

type FilterKind = 'lowpass' | 'highpass' | 'bandpass';

interface NoiseOpts {
  filter: FilterKind;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  attack?: number;
  delay?: number;
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  gain: number;
  attack?: number;
  delay?: number;
}

/**
 * Real recordings (CC0, see CREDITS.md). Each name lists its variations; one is
 * picked at random every time so repeated shots don't sound identical.
 */
const SAMPLES: Record<string, string[]> = {
  pistol: ['pistol-1', 'pistol-2'],
  pump: ['pump-1', 'pump-2'],
  drum: ['drum-1', 'drum-2'],
  revolver: ['revolver-1', 'revolver-2'],
  pumpRack: ['pump-rack'],
  shellIn: ['shell-in'],
};

const forward = new Vector3();
const up = new Vector3();

export class Sfx implements ZombieVoice {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private fxBus!: GainNode;
  private voiceBus!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private shaper!: WaveShaperNode;
  private readonly samples = new Map<string, AudioBuffer[]>();

  /** Browsers only allow sound after a click or key press; call this from one. */
  unlock(): void {
    if (!this.ctx) this.init();
    else if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  private init(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 6;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.fxBus = ctx.createGain();
    this.fxBus.connect(this.master);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);

    // Outdoor echo: a long, soft, decaying tail.
    const reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.02 ? 0.2 : 1);
      }
    }
    reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(reverb);
    reverb.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

    // Gentle distortion that gives zombie voices their rasp.
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    this.shaper.curve = curve;
    this.setVolumes();
    void this.loadSamples();
  }

  /** Fetches and decodes the recorded sounds in the background. */
  private async loadSamples(): Promise<void> {
    const ctx = this.ctx!;
    const base = import.meta.env.BASE_URL;
    await Promise.all(
      Object.entries(SAMPLES).map(async ([key, files]) => {
        const buffers: AudioBuffer[] = [];
        for (const f of files) {
          try {
            const res = await fetch(`${base}sounds/${f}.ogg`);
            if (!res.ok) continue;
            buffers.push(await ctx.decodeAudioData(await res.arrayBuffer()));
          } catch {
            // A sound that can't load falls back to the generated version.
          }
        }
        if (buffers.length) this.samples.set(key, buffers);
      }),
    );
  }

  /** How many recorded sounds are loaded (for tests). */
  get samplesLoaded(): number {
    return this.samples.size;
  }

  /**
   * Plays a recorded sound with a little random pitch and volume so repeats
   * vary. Returns false if it isn't loaded (the caller then uses the synth).
   */
  private playSample(
    key: string,
    o: { gain: number; pos?: Vector3 | null; echo?: number; lowBoost?: number; presence?: number; pitch?: number },
  ): boolean {
    const list = this.samples.get(key);
    if (!list || !this.ctx) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = (o.pitch ?? 1) * (0.97 + Math.random() * 0.06);
    let node: AudioNode = src;
    // Extra weight in the low end and bite in the mids: the heavy, punchy game-gun sound.
    if (o.lowBoost) {
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 160;
      low.gain.value = o.lowBoost;
      node.connect(low);
      node = low;
    }
    if (o.presence) {
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 2400;
      mid.Q.value = 0.8;
      mid.gain.value = o.presence;
      node.connect(mid);
      node = mid;
    }
    const g = ctx.createGain();
    g.gain.value = o.gain * (0.9 + Math.random() * 0.2);
    node.connect(g);
    g.connect(this.output(o.pos ?? null, this.fxBus, o.echo ?? 0.2));
    src.start();
    return true;
  }

  setVolumes(): void {
    if (!this.ctx) return;
    const a = tuning.audio;
    this.master.gain.value = a.masterVolume;
    this.fxBus.gain.value = a.effectsVolume;
    this.voiceBus.gain.value = a.voiceVolume * 0.9;
  }

  /** Places the listener's ears at the camera. */
  updateListener(camera: Camera): void {
    if (!this.ctx) return;
    this.setVolumes();
    const l = this.ctx.listener;
    camera.getWorldDirection(forward);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t);
      l.upY.setValueAtTime(up.y, t);
      l.upZ.setValueAtTime(up.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // ---------------------------------------------------------------------------
  // Building blocks

  /** Where a sound goes: optionally placed in 3D, plus some echo. */
  private output(pos: Vector3 | null, bus: GainNode, echo: number): AudioNode {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    let tail: AudioNode = input;
    if (pos) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.maxDistance = 90;
      panner.rolloffFactor = 1.1;
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
      input.connect(panner);
      tail = panner;
    }
    tail.connect(bus);
    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo;
      tail.connect(send);
      send.connect(this.reverbSend);
    }
    return input;
  }

  private envelope(dest: AudioNode, start: number, dur: number, gain: number, attack: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.005, dur));
    g.connect(dest);
    return g;
  }

  private burst(dest: AudioNode, dur: number, o: NoiseOpts): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.frequency.setValueAtTime(o.freq, start);
    if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(o.freqEnd, start + dur);
    filter.Q.value = o.q ?? 1;
    src.connect(filter);
    filter.connect(this.envelope(dest, start, dur, o.gain, o.attack ?? 0.002));
    src.start(start, Math.random() * 1.5);
    src.stop(start + dur + 0.05);
  }

  private tone(dest: AudioNode, dur: number, o: ToneOpts): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, start);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, start + dur);
    osc.connect(this.envelope(dest, start, dur, o.gain, o.attack ?? 0.002));
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** A rough vocal sound: buzzing voice through two "mouth shape" filters. */
  private voice(
    dest: AudioNode,
    dur: number,
    o: { f0: number; f0End: number; f1: [number, number]; f2: [number, number]; gain: number; attack: number; tremolo?: number; rasp?: number },
  ): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.f0, start);
    osc.frequency.linearRampToValueAtTime(o.f0End, start + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 4 + Math.random() * 3;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = o.f0 * 0.05;
    vib.connect(vibDepth);
    vibDepth.connect(osc.frequency);

    const drive = ctx.createGain();
    drive.gain.value = 0.6;
    osc.connect(drive);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.shaper.curve;
    drive.connect(shaper);

    const rasp = ctx.createBufferSource();
    rasp.buffer = this.noise;
    rasp.loop = true;
    const raspGain = ctx.createGain();
    raspGain.gain.value = o.rasp ?? 0.35;
    rasp.connect(raspGain);

    const sum = ctx.createGain();
    const env = this.envelope(dest, start, dur, o.gain, o.attack);
    for (const [band, q] of [[o.f1, 6], [o.f2, 8]] as const) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(band[0], start);
      f.frequency.linearRampToValueAtTime(band[1], start + dur);
      shaper.connect(f);
      raspGain.connect(f);
      f.connect(sum);
    }
    if (o.tremolo) {
      const trem = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.tremolo;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth);
      depth.connect(trem.gain);
      sum.connect(trem);
      trem.connect(env);
      lfo.start(start);
      lfo.stop(start + dur + 0.1);
    } else {
      sum.connect(env);
    }
    for (const node of [osc, vib, rasp]) {
      node.start(start);
      node.stop(start + dur + 0.1);
    }
  }

  // ---------------------------------------------------------------------------
  // The pistol

  /** The right bang for the gun in your hands. */
  shot(kind: WeaponDef['sound']): void {
    if (!this.ready) return;
    if (settings.gunshotSound === 'recorded' && this.recordedShot(kind)) return;
    if (kind === 'pistol') this.gunshot();
    else this.shotgunBlast(kind === 'shotgun');
  }

  /** A real recorded gunshot, made punchier with a low thump layered underneath. */
  private recordedShot(kind: WeaponDef['sound']): boolean {
    const key = kind === 'pistol' ? 'pistol' : kind === 'shotgun' ? 'pump' : 'drum';
    const shotgun = kind !== 'pistol';
    const played = this.playSample(key, { gain: shotgun ? 1.1 : 1.0, echo: shotgun ? 0.35 : 0.28, lowBoost: shotgun ? 5 : 4, presence: 2 });
    if (!played) return false;
    const out = this.output(null, this.fxBus, 0);
    this.tone(out, shotgun ? 0.2 : 0.12, { freq: shotgun ? 90 : 120, freqEnd: 38, gain: shotgun ? 0.55 : 0.4, attack: 0.001 });
    return true;
  }

  /** A deep, rolling shotgun boom. `heavy` = pump gun (bigger and longer). */
  shotgunBlast(heavy: boolean): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, heavy ? 0.75 : 0.6);
    const k = heavy ? 1 : 0.85;
    this.burst(out, 0.09, { filter: 'bandpass', freq: 1900, q: 0.6, gain: 1.0 * k, attack: 0.0005 });
    this.burst(out, heavy ? 0.5 : 0.36, { filter: 'lowpass', freq: 2400, freqEnd: 180, gain: 1.0 * k, attack: 0.001 });
    this.tone(out, heavy ? 0.32 : 0.24, { freq: 110, freqEnd: 32, gain: 1.0 * k, attack: 0.001 });
    this.tone(out, 0.12, { freq: 60, freqEnd: 30, gain: 0.8 * k, attack: 0.002 });
    // Rolling echo off the buildings and hills.
    this.burst(out, 0.5, { filter: 'lowpass', freq: 600, freqEnd: 200, gain: 0.18 * k, delay: 0.2, attack: 0.03 });
    this.burst(out, 0.6, { filter: 'lowpass', freq: 400, freqEnd: 150, gain: 0.08 * k, delay: 0.45, attack: 0.05 });
  }

  gunshot(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.55);
    this.burst(out, 0.07, { filter: 'bandpass', freq: 3200, q: 0.7, gain: 0.9, attack: 0.0005 });
    this.burst(out, 0.24, { filter: 'lowpass', freq: 1400, freqEnd: 260, gain: 0.9, attack: 0.001 });
    this.tone(out, 0.17, { freq: 160, freqEnd: 42, gain: 0.95, attack: 0.001 });
    this.burst(out, 0.015, { filter: 'highpass', freq: 5000, gain: 0.25, delay: 0.003 });
    // Slap-back echo off the buildings.
    this.burst(out, 0.35, { filter: 'lowpass', freq: 700, freqEnd: 300, gain: 0.12, delay: 0.17, attack: 0.02 });
  }

  dryFire(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.05);
    this.burst(out, 0.02, { filter: 'highpass', freq: 3000, gain: 0.35 });
    this.tone(out, 0.012, { type: 'square', freq: 1800, gain: 0.08 });
  }

  /** Mechanical sounds: magazines, pumps, shells and bolts. */
  gunEvent(e: GunEvent): void {
    if (!this.ready || e === 'eject') return;
    const out = this.output(null, this.fxBus, 0.08);
    switch (e) {
      case 'magOut':
        this.burst(out, 0.03, { filter: 'bandpass', freq: 2600, q: 3, gain: 0.35 });
        this.burst(out, 0.1, { filter: 'bandpass', freq: 900, q: 1.5, gain: 0.25, delay: 0.02 });
        break;
      case 'magIn':
        this.burst(out, 0.05, { filter: 'lowpass', freq: 1300, gain: 0.55 });
        this.burst(out, 0.02, { filter: 'bandpass', freq: 3200, q: 4, gain: 0.35, delay: 0.01 });
        break;
      case 'slide':
        this.burst(out, 0.04, { filter: 'bandpass', freq: 2400, q: 3, gain: 0.45 });
        this.burst(out, 0.05, { filter: 'bandpass', freq: 2000, q: 3, gain: 0.5, delay: 0.09 });
        this.tone(out, 0.06, { freq: 900, freqEnd: 600, gain: 0.08, delay: 0.09 });
        break;
      case 'pump':
        if (settings.gunshotSound === 'recorded' && this.playSample('pumpRack', { gain: 0.8, echo: 0.06 })) break;
        // Clack (back) ... clack (forward).
        this.burst(out, 0.07, { filter: 'bandpass', freq: 1300, q: 2, gain: 0.6 });
        this.burst(out, 0.02, { filter: 'highpass', freq: 3500, gain: 0.3, delay: 0.01 });
        this.burst(out, 0.08, { filter: 'bandpass', freq: 1700, q: 2, gain: 0.7, delay: 0.14 });
        this.burst(out, 0.04, { filter: 'lowpass', freq: 900, gain: 0.45, delay: 0.15 });
        break;
      case 'shellIn':
        if (settings.gunshotSound === 'recorded' && this.playSample('shellIn', { gain: 0.75, echo: 0.04 })) break;
        this.burst(out, 0.05, { filter: 'bandpass', freq: 1100, q: 1.5, gain: 0.35 });
        this.burst(out, 0.015, { filter: 'bandpass', freq: 3600, q: 4, gain: 0.35, delay: 0.045 });
        break;
      case 'drumOut':
        this.burst(out, 0.04, { filter: 'bandpass', freq: 2200, q: 3, gain: 0.45 });
        this.burst(out, 0.12, { filter: 'lowpass', freq: 700, gain: 0.45, delay: 0.03 });
        break;
      case 'drumIn':
        this.burst(out, 0.08, { filter: 'lowpass', freq: 900, gain: 0.7 });
        this.burst(out, 0.025, { filter: 'bandpass', freq: 2800, q: 4, gain: 0.45, delay: 0.02 });
        break;
      case 'bolt':
        this.burst(out, 0.05, { filter: 'bandpass', freq: 2000, q: 3, gain: 0.55 });
        this.burst(out, 0.06, { filter: 'bandpass', freq: 1600, q: 3, gain: 0.6, delay: 0.11 });
        break;
    }
  }

  shellLand(pos: Vector3, kind: 'brass' | 'hull' = 'brass'): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.05);
    if (kind === 'hull') {
      // Plastic shotgun hull: a hollow little thunk.
      this.burst(out, 0.05, { filter: 'bandpass', freq: 800, q: 2, gain: 0.12 });
      this.tone(out, 0.04, { freq: 1900, gain: 0.03, delay: 0.1 });
      return;
    }
    this.tone(out, 0.07, { freq: 4300 + Math.random() * 600, gain: 0.06 });
    this.tone(out, 0.06, { freq: 6100, gain: 0.04, delay: 0.09 + Math.random() * 0.05 });
  }

  // ---------------------------------------------------------------------------
  // Bullet impacts

  /** A different meaty sound for each body part. */
  impactFlesh(zone: ZoneGroup, pos: Vector3, killed: boolean): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.15);
    switch (zone) {
      case 'head':
        this.burst(out, 0.035, { filter: 'bandpass', freq: 2600, q: 1.5, gain: 0.85 });
        this.burst(out, 0.18, { filter: 'bandpass', freq: 1300, freqEnd: 330, q: 2, gain: 0.75 });
        this.tone(out, 0.07, { freq: 420, freqEnd: 120, gain: 0.45 });
        break;
      case 'torso':
        this.burst(out, 0.13, { filter: 'lowpass', freq: 380, gain: 0.95 });
        this.tone(out, 0.13, { freq: 115, freqEnd: 55, gain: 0.6 });
        this.burst(out, 0.08, { filter: 'bandpass', freq: 750, q: 2, gain: 0.3 });
        break;
      case 'arm':
      case 'leg':
        this.burst(out, 0.075, { filter: 'bandpass', freq: 1150, q: 1.2, gain: 0.7 });
        this.tone(out, 0.08, { freq: 190, freqEnd: 90, gain: 0.35 });
        break;
    }
    if (killed) this.burst(out, 0.3, { filter: 'bandpass', freq: 600, freqEnd: 200, q: 1.5, gain: 0.35, delay: 0.03 });
  }

  impactSurface(surface: Surface, pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.2);
    switch (surface) {
      case 'dirt':
        this.burst(out, 0.08, { filter: 'lowpass', freq: 700, gain: 0.5 });
        this.burst(out, 0.05, { filter: 'bandpass', freq: 2600, gain: 0.15 });
        break;
      case 'wood':
        this.burst(out, 0.06, { filter: 'bandpass', freq: 1700, q: 2, gain: 0.6 });
        this.tone(out, 0.07, { freq: 330, freqEnd: 180, gain: 0.35 });
        break;
      case 'stone':
      case 'plaster':
        this.burst(out, 0.045, { filter: 'highpass', freq: 2400, gain: 0.5 });
        this.burst(out, 0.06, { filter: 'lowpass', freq: 900, gain: 0.3 });
        if (Math.random() < 0.35) this.tone(out, 0.28, { freq: 2700, freqEnd: 1300, gain: 0.07, delay: 0.02 });
        break;
      case 'metal':
        this.tone(out, 0.4, { freq: 1500, gain: 0.25 });
        this.tone(out, 0.28, { freq: 2290, gain: 0.15 });
        this.burst(out, 0.02, { filter: 'highpass', freq: 4000, gain: 0.4 });
        break;
      case 'straw':
        this.burst(out, 0.09, { filter: 'bandpass', freq: 650, q: 0.7, gain: 0.4 });
        break;
      case 'glass':
        this.tone(out, 0.15, { freq: 3600, gain: 0.12 });
        this.burst(out, 0.1, { filter: 'highpass', freq: 3500, gain: 0.35 });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Player

  footstep(sprinting: boolean): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.03);
    const g = sprinting ? 0.32 : 0.22;
    this.burst(out, 0.07, { filter: 'lowpass', freq: 320 + Math.random() * 80, gain: g });
    this.burst(out, 0.04, { filter: 'bandpass', freq: 2800, gain: g * 0.25, delay: 0.01 });
  }

  playerHurt(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.1);
    this.burst(out, 0.15, { filter: 'lowpass', freq: 320, gain: 0.9 });
    this.tone(out, 0.15, { freq: 95, freqEnd: 50, gain: 0.7 });
    this.voice(out, 0.28, { f0: 125, f0End: 100, f1: [600, 500], f2: [1100, 950], gain: 0.5, attack: 0.02, rasp: 0.15 });
  }

  // ---------------------------------------------------------------------------
  // Zombie voices (placed in 3D)

  groan(pos: Vector3, pitch: number): void {
    if (!this.ready) return;
    const out = this.output(pos, this.voiceBus, 0.25);
    const dur = 1.1 + Math.random() * 0.9;
    this.voice(out, dur, { f0: 78 * pitch, f0End: 64 * pitch, f1: [430, 560], f2: [950, 780], gain: 0.55, attack: 0.3 });
  }

  grunt(pos: Vector3, pitch: number): void {
    if (!this.ready) return;
    const out = this.output(pos, this.voiceBus, 0.15);
    this.voice(out, 0.32, { f0: 115 * pitch, f0End: 85 * pitch, f1: [650, 450], f2: [1200, 900], gain: 0.7, attack: 0.015 });
  }

  roar(pos: Vector3, pitch: number): void {
    if (!this.ready) return;
    const out = this.output(pos, this.voiceBus, 0.25);
    this.voice(out, 0.8, { f0: 92 * pitch, f0End: 125 * pitch, f1: [550, 780], f2: [1050, 1250], gain: 0.75, attack: 0.08, rasp: 0.5 });
  }

  deathCry(pos: Vector3, pitch: number): void {
    if (!this.ready) return;
    const out = this.output(pos, this.voiceBus, 0.3);
    this.voice(out, 1.3, { f0: 105 * pitch, f0End: 48 * pitch, f1: [700, 350], f2: [1200, 700], gain: 0.7, attack: 0.02, tremolo: 13, rasp: 0.45 });
  }

  bodyFall(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.15);
    this.burst(out, 0.26, { filter: 'lowpass', freq: 260, gain: 0.75 });
    this.tone(out, 0.2, { freq: 75, freqEnd: 40, gain: 0.5 });
    this.burst(out, 0.15, { filter: 'bandpass', freq: 1500, gain: 0.1, delay: 0.04 });
  }

  swing(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.05);
    this.burst(out, 0.26, { filter: 'bandpass', freq: 450, freqEnd: 1600, q: 1.5, gain: 0.3, attack: 0.08 });
  }

  shuffle(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.02);
    this.burst(out, 0.13, { filter: 'lowpass', freq: 520, gain: 0.1, attack: 0.02 });
    this.burst(out, 0.08, { filter: 'bandpass', freq: 1800, gain: 0.035, delay: 0.03 });
  }
}
