import { Vector3, type Camera } from 'three';
import type { ZoneGroup } from '../combat/damage';
import type { GunEvent, WeaponDef } from '../combat/weapons';
import { settings } from '../config/settings';
import { tuning } from '../config/tuning';
import type { ZombieVoice } from '../enemies/zombie';
import type { Surface } from '../world/props';

// Sounds are synthesised here with the Web Audio API, plus a few real CC0
// recordings (gunshots, explosions, squelches; see CREDITS.md) layered with
// generated thumps so they hit hard.

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
  smg: ['smg-1', 'smg-2', 'smg-3'],
  rifle: ['rifle-1', 'rifle-2', 'rifle-3'],
  magnum: ['magnum-1', 'magnum-2'],
  swift: ['swift-1', 'swift-2'],
  explosion: ['explosion-1'],
  explosionSmall: ['explosion-2'],
  splat: ['splat-a-1', 'splat-a-2', 'splat-b-1', 'splat-b-2'],
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
    o: { gain: number; pos?: Vector3 | null; echo?: number; lowBoost?: number; presence?: number; pitch?: number; lowpass?: number },
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
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      node.connect(lp);
      node = lp;
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
    if (kind === 'rocket') {
      this.rocketLaunch();
      return;
    }
    if (settings.gunshotSound === 'recorded' && this.recordedShot(kind)) return;
    if (kind === 'pistol' || kind === 'smg' || kind === 'heavyPistol' || kind === 'swiftPistol') this.gunshot(kind === 'smg' || kind === 'swiftPistol' ? 0.7 : 1);
    else if (kind === 'rifle' || kind === 'magnum') this.heavyShot();
    else this.shotgunBlast(kind === 'shotgun');
  }

  /** A real recorded gunshot, made punchier with a low thump layered underneath. */
  private recordedShot(kind: WeaponDef['sound']): boolean {
    const look: Record<string, { key: string; gain: number; echo: number; low: number; thump: number; thumpFreq: number; pitch?: number }> = {
      pistol: { key: 'pistol', gain: 1.0, echo: 0.28, low: 4, thump: 0.4, thumpFreq: 120 },
      shotgun: { key: 'pump', gain: 1.1, echo: 0.35, low: 5, thump: 0.55, thumpFreq: 90 },
      autoShotgun: { key: 'drum', gain: 1.1, echo: 0.35, low: 5, thump: 0.55, thumpFreq: 90 },
      smg: { key: 'smg', gain: 0.75, echo: 0.12, low: 3, thump: 0.25, thumpFreq: 130 },
      rifle: { key: 'rifle', gain: 1.15, echo: 0.45, low: 5, thump: 0.6, thumpFreq: 80 },
      magnum: { key: 'magnum', gain: 1.2, echo: 0.45, low: 6, thump: 0.7, thumpFreq: 75, pitch: 0.92 },
      heavyPistol: { key: 'revolver', gain: 1.15, echo: 0.35, low: 5, thump: 0.55, thumpFreq: 95, pitch: 0.88 },
      swiftPistol: { key: 'swift', gain: 0.85, echo: 0.2, low: 3, thump: 0.25, thumpFreq: 130 },
    };
    const l = look[kind];
    if (!l) return false;
    const played = this.playSample(l.key, { gain: l.gain, echo: l.echo, lowBoost: l.low, presence: 2, pitch: l.pitch });
    if (!played) return false;
    const out = this.output(null, this.fxBus, 0);
    this.tone(out, l.thump > 0.5 ? 0.22 : 0.12, { freq: l.thumpFreq, freqEnd: 36, gain: l.thump, attack: 0.001 });
    return true;
  }

  /** Generated big-calibre crack and boom (rifle and revolver, "Old generated sound"). */
  private heavyShot(): void {
    const out = this.output(null, this.fxBus, 0.8);
    this.burst(out, 0.06, { filter: 'bandpass', freq: 2600, q: 0.6, gain: 1.0, attack: 0.0005 });
    this.burst(out, 0.45, { filter: 'lowpass', freq: 1800, freqEnd: 160, gain: 1.0, attack: 0.001 });
    this.tone(out, 0.3, { freq: 120, freqEnd: 30, gain: 1.0, attack: 0.001 });
    this.burst(out, 0.7, { filter: 'lowpass', freq: 500, freqEnd: 150, gain: 0.2, delay: 0.22, attack: 0.04 });
  }

  /** The rocket leaving the tube: a thump and a roaring whoosh. */
  private rocketLaunch(): void {
    const out = this.output(null, this.fxBus, 0.5);
    this.tone(out, 0.25, { freq: 90, freqEnd: 40, gain: 0.9, attack: 0.002 });
    this.burst(out, 0.12, { filter: 'lowpass', freq: 1200, gain: 0.9, attack: 0.001 });
    this.burst(out, 0.9, { filter: 'bandpass', freq: 900, freqEnd: 2400, q: 0.8, gain: 0.55, attack: 0.03 });
    this.burst(out, 1.2, { filter: 'lowpass', freq: 700, freqEnd: 300, gain: 0.35, attack: 0.05, delay: 0.05 });
  }

  /** A rocket or barrel blowing up. Further away is quieter and duller. */
  explosion(pos: Vector3, big = true): void {
    if (!this.ready) return;
    const played = this.playSample(big ? 'explosion' : 'explosionSmall', { gain: big ? 1.3 : 1.1, pos, echo: 0.6, lowBoost: 6 });
    const out = this.output(pos, this.fxBus, 0.7);
    // A deep generated thump under the recording (or instead of it).
    this.tone(out, 0.6, { freq: 70, freqEnd: 24, gain: played ? 0.9 : 1.2, attack: 0.003 });
    if (!played) {
      this.burst(out, 1.6, { filter: 'lowpass', freq: 1600, freqEnd: 120, gain: 1.2, attack: 0.002 });
      this.burst(out, 0.1, { filter: 'bandpass', freq: 1800, q: 0.5, gain: 0.9 });
    }
    // Debris pattering down afterwards.
    this.burst(out, 0.9, { filter: 'bandpass', freq: 2600, q: 0.7, gain: 0.12, delay: 0.5, attack: 0.1 });
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

  gunshot(volume = 1): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.55 * volume);
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
      case 'cylinderOut':
        // Cylinder swings out and six empty cases rattle out.
        this.burst(out, 0.04, { filter: 'bandpass', freq: 2400, q: 3, gain: 0.45 });
        for (let i = 0; i < 6; i++) this.tone(out, 0.05, { freq: 3800 + Math.random() * 1500, gain: 0.04, delay: 0.12 + i * 0.03 + Math.random() * 0.02 });
        break;
      case 'cylinderIn':
        this.burst(out, 0.04, { filter: 'bandpass', freq: 1800, q: 2, gain: 0.4 });
        this.burst(out, 0.05, { filter: 'bandpass', freq: 2600, q: 3, gain: 0.55, delay: 0.18 });
        break;
      case 'roundIn':
        this.burst(out, 0.04, { filter: 'bandpass', freq: 1500, q: 2, gain: 0.35 });
        this.burst(out, 0.015, { filter: 'bandpass', freq: 3800, q: 4, gain: 0.3, delay: 0.035 });
        break;
      case 'rocketIn':
        this.burst(out, 0.12, { filter: 'lowpass', freq: 700, gain: 0.5 });
        this.burst(out, 0.04, { filter: 'bandpass', freq: 2000, q: 2, gain: 0.45, delay: 0.1 });
        this.tone(out, 0.1, { freq: 300, freqEnd: 180, gain: 0.15, delay: 0.1 });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Pickups, healing and the mood of the fight

  /** A pickup chime that suits what was picked up. */
  pickup(kind: 'ammo' | 'herb' | 'spray' | 'coins' | 'treasure' | 'grenade' | 'orb'): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.06);
    switch (kind) {
      case 'ammo':
      case 'grenade':
        this.burst(out, 0.03, { filter: 'bandpass', freq: 2200, q: 3, gain: 0.35 });
        this.burst(out, 0.04, { filter: 'bandpass', freq: 1500, q: 3, gain: 0.4, delay: 0.06 });
        break;
      case 'herb':
        this.burst(out, 0.18, { filter: 'bandpass', freq: 2800, q: 0.6, gain: 0.22, attack: 0.04 });
        this.tone(out, 0.14, { freq: 520, freqEnd: 700, gain: 0.12, delay: 0.05 });
        break;
      case 'spray':
        this.burst(out, 0.2, { filter: 'highpass', freq: 5000, gain: 0.18, attack: 0.03 });
        this.tone(out, 0.12, { freq: 880, gain: 0.1, delay: 0.1 });
        break;
      case 'coins':
        this.tone(out, 0.12, { freq: 1850, gain: 0.13 });
        this.tone(out, 0.2, { freq: 2480, gain: 0.12, delay: 0.07 });
        this.burst(out, 0.02, { filter: 'highpass', freq: 6000, gain: 0.12 });
        break;
      case 'treasure':
        for (let i = 0; i < 4; i++) this.tone(out, 0.4, { freq: 1400 + i * 420, gain: 0.1, delay: i * 0.07 });
        break;
      case 'orb':
        this.tone(out, 0.5, { freq: 660, freqEnd: 1320, gain: 0.2 });
        this.tone(out, 0.5, { freq: 990, freqEnd: 1980, gain: 0.12, delay: 0.05 });
        break;
    }
  }

  /** Using a healing item. */
  heal(spray: boolean): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.1);
    if (spray) {
      this.burst(out, 0.5, { filter: 'highpass', freq: 4500, gain: 0.25, attack: 0.04 });
      this.burst(out, 0.4, { filter: 'bandpass', freq: 7000, q: 1, gain: 0.12, delay: 0.1 });
    } else {
      this.burst(out, 0.4, { filter: 'bandpass', freq: 2600, q: 0.5, gain: 0.2, attack: 0.1 });
      this.burst(out, 0.3, { filter: 'lowpass', freq: 500, gain: 0.2, delay: 0.1 });
    }
  }

  /** The "done" chime when the health comes back. */
  healed(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.2);
    this.tone(out, 0.5, { freq: 523, gain: 0.12 });
    this.tone(out, 0.5, { freq: 659, gain: 0.1, delay: 0.09 });
    this.tone(out, 0.7, { freq: 784, gain: 0.1, delay: 0.18 });
  }

  /** A heartbeat (lub-dub). `strength` 0..1. */
  heartbeat(strength: number): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.02);
    this.tone(out, 0.16, { freq: 62, freqEnd: 40, gain: 0.55 * strength + 0.2, attack: 0.004 });
    this.tone(out, 0.14, { freq: 55, freqEnd: 36, gain: 0.4 * strength + 0.15, attack: 0.004, delay: 0.17 });
  }

  /** A wave beginning: a low horn and a rumble. */
  waveStart(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.5);
    this.tone(out, 1.4, { type: 'sawtooth', freq: 72, freqEnd: 64, gain: 0.22, attack: 0.25 });
    this.tone(out, 1.4, { type: 'sawtooth', freq: 108, freqEnd: 96, gain: 0.12, attack: 0.3 });
    this.burst(out, 1.4, { filter: 'lowpass', freq: 220, gain: 0.3, attack: 0.3 });
  }

  /** A wave cleared: a short rising phrase. */
  waveClear(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.35);
    [392, 494, 587, 784].forEach((f, i) => this.tone(out, 0.6, { freq: f, gain: 0.12, delay: i * 0.12 }));
  }

  /** A heavy enemy is coming: a drum hit and a groan. */
  eliteSting(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.6);
    this.tone(out, 0.6, { freq: 55, freqEnd: 28, gain: 0.9, attack: 0.002 });
    this.tone(out, 0.5, { freq: 82, freqEnd: 41, gain: 0.5, attack: 0.002, delay: 0.35 });
    this.burst(out, 0.7, { filter: 'lowpass', freq: 300, gain: 0.4, attack: 0.02 });
    this.voice(out, 1.4, { f0: 60, f0End: 40, f1: [300, 220], f2: [700, 500], gain: 0.5, attack: 0.1, rasp: 0.5 });
  }

  /** The player dying: everything drops away. */
  playerDeath(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.6);
    this.tone(out, 1.6, { freq: 150, freqEnd: 32, gain: 0.7, attack: 0.01 });
    this.burst(out, 0.5, { filter: 'lowpass', freq: 400, gain: 0.7 });
    this.voice(out, 0.7, { f0: 120, f0End: 70, f1: [600, 400], f2: [1100, 700], gain: 0.5, attack: 0.02, rasp: 0.2 });
  }

  /** A wooden crate splintering. */
  crateBreak(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.2);
    this.burst(out, 0.15, { filter: 'bandpass', freq: 1200, q: 0.8, gain: 0.7, attack: 0.001 });
    this.burst(out, 0.1, { filter: 'highpass', freq: 3000, gain: 0.3, delay: 0.02 });
    this.tone(out, 0.12, { freq: 200, freqEnd: 90, gain: 0.45 });
    for (let i = 0; i < 4; i++) this.burst(out, 0.04, { filter: 'bandpass', freq: 1500 + Math.random() * 1500, q: 2, gain: 0.15, delay: 0.1 + i * 0.05 + Math.random() * 0.04 });
  }

  /** A menu / button click. */
  uiClick(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0);
    this.tone(out, 0.05, { freq: 1200, gain: 0.08 });
  }

  // ---------------------------------------------------------------------------
  // Melee, knife and gore

  /** A heavy boot landing. */
  kick(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.2);
    this.burst(out, 0.12, { filter: 'lowpass', freq: 500, gain: 1.0, attack: 0.001 });
    this.tone(out, 0.16, { freq: 105, freqEnd: 45, gain: 0.9, attack: 0.001 });
    this.burst(out, 0.03, { filter: 'bandpass', freq: 2200, q: 1.5, gain: 0.4 });
  }

  /** A body slammed into the ground head first. */
  slam(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.35);
    this.burst(out, 0.35, { filter: 'lowpass', freq: 380, gain: 1.1, attack: 0.002 });
    this.tone(out, 0.3, { freq: 80, freqEnd: 32, gain: 1.0, attack: 0.002 });
    this.burst(out, 0.06, { filter: 'bandpass', freq: 1600, q: 1.2, gain: 0.5 });
    this.burst(out, 0.04, { filter: 'highpass', freq: 3000, gain: 0.25, delay: 0.01 });
  }

  /** The knife cutting through the air. */
  knifeSwish(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.04);
    this.burst(out, 0.16, { filter: 'bandpass', freq: 1800, freqEnd: 5200, q: 2.5, gain: 0.35, attack: 0.04 });
  }

  /** The blade going in. */
  knifeHit(pos: Vector3, stab = false): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.12);
    if (!this.playSample('splat', { gain: stab ? 0.7 : 0.45, pos, echo: 0.05, pitch: 1.3, lowpass: 5000 })) {
      this.burst(out, 0.1, { filter: 'bandpass', freq: 900, q: 1.2, gain: 0.6 });
    }
    this.burst(out, 0.03, { filter: 'bandpass', freq: 3200, q: 2, gain: 0.35 });
    if (stab) this.tone(out, 0.12, { freq: 160, freqEnd: 70, gain: 0.5 });
  }

  /** Steel meeting a zombie's swing: a clang (a bright ring for a perfect parry). */
  parry(perfect: boolean): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.25);
    this.burst(out, 0.03, { filter: 'highpass', freq: 3500, gain: 0.6 });
    this.tone(out, perfect ? 0.7 : 0.3, { freq: perfect ? 2100 : 1500, gain: perfect ? 0.3 : 0.2 });
    this.tone(out, perfect ? 0.6 : 0.25, { freq: perfect ? 3170 : 2240, gain: 0.12 });
    this.burst(out, 0.08, { filter: 'lowpass', freq: 600, gain: 0.5 });
    if (perfect) this.tone(out, 0.9, { freq: 4200, gain: 0.08, delay: 0.02 });
  }

  /** A head bursting: a crack of bone and a wet splatter. */
  headBurst(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.2);
    this.burst(out, 0.03, { filter: 'bandpass', freq: 2800, q: 1, gain: 1.0, attack: 0.0005 });
    this.burst(out, 0.05, { filter: 'highpass', freq: 1800, gain: 0.6, delay: 0.005 });
    this.tone(out, 0.1, { freq: 300, freqEnd: 90, gain: 0.6 });
    if (!this.playSample('splat', { gain: 1.0, pos, echo: 0.1, lowBoost: 3 })) {
      this.burst(out, 0.3, { filter: 'bandpass', freq: 800, freqEnd: 250, q: 1.5, gain: 0.7, delay: 0.02 });
    }
  }

  /** An arm or leg torn off. */
  limbTear(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.15);
    this.burst(out, 0.04, { filter: 'bandpass', freq: 2000, q: 1.2, gain: 0.7 });
    this.tone(out, 0.08, { freq: 220, freqEnd: 80, gain: 0.45 });
    if (!this.playSample('splat', { gain: 0.8, pos, echo: 0.08, pitch: 0.85 })) {
      this.burst(out, 0.22, { filter: 'bandpass', freq: 700, freqEnd: 300, q: 1.5, gain: 0.55 });
    }
  }

  /** Grunting and scuffling while you fight free of a grab. */
  struggle(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.05);
    this.burst(out, 0.08, { filter: 'lowpass', freq: 600, gain: 0.35 });
    this.voice(out, 0.18, { f0: 140, f0End: 120, f1: [650, 550], f2: [1150, 1000], gain: 0.25, attack: 0.01, rasp: 0.2 });
  }

  /** The zombie's teeth sinking in. */
  bite(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.15);
    this.burst(out, 0.05, { filter: 'bandpass', freq: 2400, q: 1.2, gain: 0.8 });
    this.playSample('splat', { gain: 0.8, pos, echo: 0.05, pitch: 1.15 });
    this.voice(out, 0.5, { f0: 150, f0End: 110, f1: [700, 600], f2: [1300, 1100], gain: 0.55, attack: 0.01, rasp: 0.3 });
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
      case 'parasite':
        // Wet and squelchy, with a shriek.
        this.burst(out, 0.14, { filter: 'bandpass', freq: 900, freqEnd: 300, q: 3, gain: 0.7 });
        this.voice(out, 0.3, { f0: 380, f0End: 240, f1: [1400, 900], f2: [2500, 1800], gain: 0.4, attack: 0.01, rasp: 0.5 });
        break;
      case 'shield':
        this.shieldHit(pos, false);
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

  /** The chainsaw engine: a ragged burbling idle, snarling when it swings. */
  rev(pos: Vector3, level: number): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.2);
    const hard = level > 0.5;
    const f = hard ? 105 : 62;
    this.tone(out, 0.46, { freq: f, freqEnd: f * (hard ? 1.5 : 1.1), type: 'sawtooth', gain: hard ? 0.34 : 0.2, attack: 0.04 });
    this.tone(out, 0.46, { freq: f * 2.02, freqEnd: f * (hard ? 3.2 : 2.3), type: 'square', gain: hard ? 0.12 : 0.06, attack: 0.04 });
    this.burst(out, 0.44, { filter: 'bandpass', freq: hard ? 1500 : 900, freqEnd: hard ? 2600 : 1200, q: 1.2, gain: hard ? 0.28 : 0.15, attack: 0.03 });
  }

  /** Something hits a wooden shield (or the shield splinters). */
  shieldHit(pos: Vector3, broke: boolean): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.2);
    this.burst(out, 0.07, { filter: 'bandpass', freq: 1300, q: 2.2, gain: 0.75 });
    this.tone(out, 0.1, { freq: 260, freqEnd: 140, gain: 0.5 });
    if (broke) {
      this.burst(out, 0.4, { filter: 'bandpass', freq: 1800, freqEnd: 500, q: 0.9, gain: 0.8, delay: 0.02 });
      this.burst(out, 0.18, { filter: 'highpass', freq: 3200, gain: 0.35, delay: 0.05 });
      this.tone(out, 0.25, { freq: 190, freqEnd: 70, gain: 0.55 });
    }
  }

  /** An axe tumbling through the air. */
  axeWhoosh(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.1);
    this.burst(out, 0.4, { filter: 'bandpass', freq: 500, freqEnd: 1400, q: 1.6, gain: 0.4, attack: 0.12 });
  }

  /** An axe biting into a body, a wall or the ground. */
  axeThunk(pos: Vector3, flesh: boolean): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.15);
    this.burst(out, 0.06, { filter: 'bandpass', freq: flesh ? 700 : 1500, q: 2, gain: 0.8 });
    this.tone(out, 0.12, { freq: flesh ? 130 : 240, freqEnd: 70, gain: 0.55 });
    if (!flesh) this.tone(out, 0.3, { freq: 1900, gain: 0.08, delay: 0.01 });
  }

  /** A lit fuse spitting. */
  fuseHiss(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.05);
    this.burst(out, 0.35, { filter: 'highpass', freq: 4200, gain: 0.16, attack: 0.04 });
    this.burst(out, 0.3, { filter: 'bandpass', freq: 6500, q: 1, gain: 0.1, attack: 0.05 });
  }

  /** A grenade or stick bouncing on the ground. */
  grenadeBounce(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.08);
    this.tone(out, 0.08, { freq: 1700, freqEnd: 1100, gain: 0.12 });
    this.burst(out, 0.06, { filter: 'bandpass', freq: 1200, q: 1.5, gain: 0.25 });
  }

  /** The pin comes out and the grenade leaves the hand. */
  grenadeThrow(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.05);
    this.tone(out, 0.05, { freq: 2600, freqEnd: 2200, gain: 0.12 });
    this.burst(out, 0.28, { filter: 'bandpass', freq: 400, freqEnd: 1100, q: 1.3, gain: 0.3, attack: 0.08, delay: 0.1 });
  }

  /** The flash grenade: a sharp bang and a ringing in the ears. */
  flashBang(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.4);
    this.burst(out, 0.09, { filter: 'highpass', freq: 1500, gain: 1.1, attack: 0.0005 });
    this.burst(out, 0.3, { filter: 'lowpass', freq: 2200, freqEnd: 300, gain: 0.9, attack: 0.001 });
    this.tone(out, 0.12, { freq: 80, freqEnd: 40, gain: 0.8 });
    this.tone(out, 1.2, { freq: 4300, gain: 0.05, attack: 0.05, delay: 0.05 });
  }

  /** Flames catching: a soft rushing whoomph. */
  fireWhoosh(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.3);
    this.burst(out, 0.9, { filter: 'lowpass', freq: 500, freqEnd: 1700, gain: 0.7, attack: 0.05 });
    this.burst(out, 1.4, { filter: 'bandpass', freq: 1800, q: 0.6, gain: 0.18, attack: 0.2 });
    this.tone(out, 0.4, { freq: 90, freqEnd: 50, gain: 0.5, attack: 0.02 });
  }

  /** The crackle of something burning. */
  crackle(pos: Vector3): void {
    if (!this.ready) return;
    const out = this.output(pos, this.fxBus, 0.05);
    for (let i = 0; i < 3; i++) this.burst(out, 0.03, { filter: 'highpass', freq: 3000, gain: 0.12, delay: Math.random() * 0.25 });
  }

  /** A "no" from a menu: a short low buzz. */
  uiDeny(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0);
    this.tone(out, 0.12, { freq: 150, freqEnd: 110, type: 'square', gain: 0.1, attack: 0.005 });
  }

  /** A purchase: coins on wood. */
  uiBuy(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.05);
    for (let i = 0; i < 3; i++) this.tone(out, 0.1, { freq: 2400 + Math.random() * 900, gain: 0.07, delay: i * 0.045 });
    this.burst(out, 0.05, { filter: 'bandpass', freq: 1200, q: 2, gain: 0.2 });
  }

  /** The case clasps clicking open or shut. */
  caseToggle(open: boolean): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.03);
    this.burst(out, 0.04, { filter: 'bandpass', freq: open ? 2200 : 1500, q: 3, gain: 0.3 });
    this.burst(out, 0.05, { filter: 'bandpass', freq: open ? 1500 : 2200, q: 3, gain: 0.25, delay: 0.09 });
    this.tone(out, 0.06, { freq: 320, freqEnd: 180, gain: 0.12, delay: 0.04 });
  }

  /** The Trader appears at his stall: a low chime and a rustle. */
  traderArrives(): void {
    if (!this.ready) return;
    const out = this.output(null, this.fxBus, 0.4);
    this.tone(out, 1.3, { freq: 392, gain: 0.07, attack: 0.01 });
    this.tone(out, 1.5, { freq: 587, gain: 0.05, attack: 0.01, delay: 0.12 });
    this.burst(out, 0.4, { filter: 'bandpass', freq: 700, freqEnd: 400, gain: 0.08, attack: 0.1 });
  }
}
