// Procedural Web Audio API music generator for Dead Acre.
// Generates low ambient dread for Survival mode and up-tempo synth-driven
// combat tracks for Score Attack mode. Pure code, no external audio files.

import { tuning } from '../config/tuning';
import { settings } from '../config/settings';

export type MusicTrack = 'none' | 'ambient' | 'action';

export class MusicDirector {
  private ctx: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private currentTrack: MusicTrack = 'none';
  private targetTrack: MusicTrack = 'none';
  private fadeGain: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private stepInterval = 60 / 128 / 4; // 16th notes
  private overdrive = false;

  // Ambient nodes
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientLfo: OscillatorNode | null = null;
  private ambientLfoGain: GainNode | null = null;

  // Action / Combat nodes
  private actionFilter: BiquadFilterNode | null = null;

  constructor(sharedContext?: AudioContext | null, destinationNode?: AudioNode | null) {
    if (sharedContext) {
      this.attachContext(sharedContext, destinationNode);
    }
  }

  attachContext(ctx: AudioContext, destinationNode?: AudioNode | null): void {
    if (this.ctx === ctx) return;
    this.stopNodes();
    this.ctx = ctx;
    this.outputNode = ctx.createGain();
    this.outputNode.connect(destinationNode ?? ctx.destination);
    this.fadeGain = ctx.createGain();
    this.fadeGain.gain.value = 0;
    this.fadeGain.connect(this.outputNode);
    this.updateVolume();
  }

  updateVolume(): void {
    if (!this.outputNode) return;
    const master = tuning.audio.masterVolume;
    const music = settings.volumeMusic * tuning.audio.musicVolume;
    this.outputNode.gain.value = Math.max(0, Math.min(1, master * music));
  }

  get track(): MusicTrack {
    return this.currentTrack;
  }

  play(track: MusicTrack): void {
    if (this.targetTrack === track) return;
    this.targetTrack = track;
    if (!this.ctx) return;
    if (track === 'none') {
      this.fadeOut();
    } else {
      this.transitionTo(track);
    }
  }

  setOverdrive(active: boolean): void {
    this.overdrive = active;
    if (this.actionFilter && this.ctx) {
      const targetFreq = active ? 3200 : 1200;
      this.actionFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.2);
    }
  }

  tick(dt: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.updateVolume();

    if (this.currentTrack === 'action') {
      this.timer += dt;
      while (this.timer >= this.stepInterval) {
        this.timer -= this.stepInterval;
        this.tickActionStep();
        this.step = (this.step + 1) % 64;
      }
    } else if (this.currentTrack === 'ambient') {
      this.timer += dt;
      if (this.timer >= 4.0) {
        this.timer = 0;
        this.playAmbientSwell();
      }
    }
  }

  private transitionTo(newTrack: MusicTrack): void {
    if (!this.ctx || !this.fadeGain) return;
    const now = this.ctx.currentTime;
    // Fade out old track over 0.5s
    this.fadeGain.gain.setValueAtTime(this.fadeGain.gain.value, now);
    this.fadeGain.gain.linearRampToValueAtTime(0, now + 0.4);

    setTimeout(() => {
      this.stopNodes();
      this.currentTrack = newTrack;
      if (newTrack === 'ambient') this.startAmbientNodes();
      else if (newTrack === 'action') this.startActionNodes();

      if (this.fadeGain && this.ctx) {
        const cur = this.ctx.currentTime;
        this.fadeGain.gain.setValueAtTime(0, cur);
        this.fadeGain.gain.linearRampToValueAtTime(1.0, cur + 0.8);
      }
    }, 420);
  }

  private fadeOut(): void {
    if (!this.ctx || !this.fadeGain) return;
    const now = this.ctx.currentTime;
    this.fadeGain.gain.setValueAtTime(this.fadeGain.gain.value, now);
    this.fadeGain.gain.linearRampToValueAtTime(0, now + 0.5);
    setTimeout(() => {
      this.stopNodes();
      this.currentTrack = 'none';
    }, 520);
  }

  private startAmbientNodes(): void {
    if (!this.ctx || !this.fadeGain) return;
    const ctx = this.ctx;

    // Sub-bass dread drone
    this.ambientFilter = ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.value = 110;
    this.ambientFilter.Q.value = 4.0;

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.4;
    this.droneGain.connect(this.ambientFilter);
    this.ambientFilter.connect(this.fadeGain);

    // Two slightly detuned oscillators for low acoustic beating
    this.droneOsc1 = ctx.createOscillator();
    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.value = 43.65; // F1 note

    this.droneOsc2 = ctx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.value = 44.15;

    // Slow LFO to pulse the filter
    this.ambientLfo = ctx.createOscillator();
    this.ambientLfo.type = 'sine';
    this.ambientLfo.frequency.value = 0.15; // 6.6 second cycle

    this.ambientLfoGain = ctx.createGain();
    this.ambientLfoGain.gain.value = 45;
    this.ambientLfo.connect(this.ambientLfoGain);
    this.ambientLfoGain.connect(this.ambientFilter.frequency);

    this.droneOsc1.connect(this.droneGain);
    this.droneOsc2.connect(this.droneGain);

    this.droneOsc1.start();
    this.droneOsc2.start();
    this.ambientLfo.start();
    this.timer = 0;
  }

  private playAmbientSwell(): void {
    if (!this.ctx || !this.fadeGain || this.currentTrack !== 'ambient') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Sparse haunting chime / dissonance
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 350 + Math.random() * 400;
    bp.Q.value = 8.0;

    osc.type = 'triangle';
    const notes = [130.81, 155.56, 174.61, 196.0, 207.65]; // C minor / diminished scale
    osc.frequency.value = notes[Math.floor(Math.random() * notes.length)] * 2;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.12, now + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

    osc.connect(bp);
    bp.connect(g);
    g.connect(this.fadeGain);

    osc.start(now);
    osc.stop(now + 4.0);
  }

  private startActionNodes(): void {
    if (!this.ctx || !this.fadeGain) return;
    const ctx = this.ctx;

    this.actionFilter = ctx.createBiquadFilter();
    this.actionFilter.type = 'lowpass';
    this.actionFilter.frequency.value = this.overdrive ? 3200 : 1200;
    this.actionFilter.Q.value = 3.5;
    this.actionFilter.connect(this.fadeGain);

    this.step = 0;
    this.timer = 0;
  }

  private tickActionStep(): void {
    if (!this.ctx || !this.actionFilter) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Driving bass sequence in D minor (D1, D1, F1, D1, G1, D1, A1, C2)
    const bassline = [
      36.71, 0, 36.71, 0,
      43.65, 0, 36.71, 0,
      49.00, 0, 36.71, 0,
      55.00, 0, 65.41, 0,
    ];
    const freq = bassline[this.step % 16];

    if (freq > 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      g.gain.setValueAtTime(0.22, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + this.stepInterval * 1.6);

      osc.connect(g);
      g.connect(this.actionFilter);

      osc.start(now);
      osc.stop(now + this.stepInterval * 1.8);
    }

    // High energetic arpeggios on 16th notes
    if (this.step % 2 === 0) {
      const arpNotes = [146.83, 174.61, 220.0, 261.63, 293.66, 349.23, 440.0, 523.25];
      const arpFreq = arpNotes[(this.step / 2) % arpNotes.length];

      const arpOsc = ctx.createOscillator();
      const arpGain = ctx.createGain();
      arpOsc.type = this.overdrive ? 'square' : 'triangle';
      arpOsc.frequency.setValueAtTime(arpFreq, now);

      const amp = this.overdrive ? 0.08 : 0.04;
      arpGain.gain.setValueAtTime(amp, now);
      arpGain.gain.exponentialRampToValueAtTime(0.001, now + this.stepInterval * 0.9);

      arpOsc.connect(arpGain);
      arpGain.connect(this.actionFilter);

      arpOsc.start(now);
      arpOsc.stop(now + this.stepInterval);
    }

    // Rhythmic percussive click on downbeats
    if (this.step % 4 === 0) {
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(110, now);
      kickOsc.frequency.exponentialRampToValueAtTime(35, now + 0.08);

      kickGain.gain.setValueAtTime(0.3, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      kickOsc.connect(kickGain);
      kickGain.connect(this.actionFilter);

      kickOsc.start(now);
      kickOsc.stop(now + 0.12);
    }
  }

  private stopNodes(): void {
    if (this.droneOsc1) {
      try { this.droneOsc1.stop(); this.droneOsc1.disconnect(); } catch {}
      this.droneOsc1 = null;
    }
    if (this.droneOsc2) {
      try { this.droneOsc2.stop(); this.droneOsc2.disconnect(); } catch {}
      this.droneOsc2 = null;
    }
    if (this.ambientLfo) {
      try { this.ambientLfo.stop(); this.ambientLfo.disconnect(); } catch {}
      this.ambientLfo = null;
    }
    if (this.ambientFilter) {
      this.ambientFilter.disconnect();
      this.ambientFilter = null;
    }
    if (this.actionFilter) {
      this.actionFilter.disconnect();
      this.actionFilter = null;
    }
  }
}
