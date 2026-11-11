import type { FighterId } from '../core/types';
import { isAudioMuted, setAudioMuted } from '../core/storage';

export type TrackId = 'none' | 'intro' | 'background' | 'battle';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicGain: GainNode | null = null;

  muted: boolean;
  musicEnabled = true;
  paused = false;
  currentTrack: TrackId = 'none';
  private musicStep = 0;
  private musicTimer: number | null = null;
  private activeVoices = 0;
  private readonly maxVoices = 8;

  private audioCache = new Map<string, AudioBuffer>();
  private loadingClips = new Set<string>();
  private currentSpeechSource: AudioBufferSourceNode | null = null;

  onStateChange: (() => void) | null = null;

  constructor() {
    this.muted = isAudioMuted();
  }

  get locked(): boolean {
    return !this.ctx || this.ctx.state !== 'running';
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -2;
      comp.knee.value = 0;
      comp.ratio.value = 20;
      comp.attack.value = 0.002;
      comp.release.value = 0.1;

      this.output = this.ctx.createGain();
      this.output.gain.value = 0.88;
      comp.connect(this.output).connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.72;
      this.master.connect(comp);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.muted ? 0 : 1;
      this.sfxBus.connect(comp);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicEnabled ? 0.2 : 0;
      this.musicGain.connect(this.master);

      this.startSequencer();
      this.ctx.addEventListener('statechange', () => this.onStateChange?.());
    }

    if (this.ctx.state !== 'running' && !this.paused) {
      void this.ctx.resume().then(() => this.onStateChange?.());
    }
  }

  async playVoiceClip(url: string, duckMusic = true): Promise<void> {
    if (typeof window === 'undefined' || !url || this.muted || this.paused) return;
    if (!this.ctx) this.unlock();
    if (!this.ctx || !this.sfxBus) return;

    let buf = this.audioCache.get(url);
    if (!buf) {
      if (this.loadingClips.has(url)) return;
      this.loadingClips.add(url);
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        buf = await this.ctx.decodeAudioData(arr);
        this.audioCache.set(url, buf);
      } catch {
        return;
      } finally {
        this.loadingClips.delete(url);
      }
    }

    if (this.muted || this.paused || !this.ctx || !this.sfxBus) return;
    try {
      this.currentSpeechSource?.stop();
    } catch {
      // Ignore already stopped buffer source
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = 1.05;
    src.connect(gain).connect(this.sfxBus);

    if (duckMusic && this.musicGain && this.musicEnabled) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.setTargetAtTime(0.08, t, 0.04);
      src.onended = () => {
        if (this.musicGain && this.ctx && this.musicEnabled) {
          this.musicGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.12);
        }
      };
    }

    this.currentSpeechSource = src;
    src.start();
  }

  playAnnouncer(key: 'round1' | 'round2' | 'round3' | 'fight' | 'ko' | 'win' | 'lose' | 'boss'): void {
    void this.playVoiceClip(`/audio/ann_${key}.wav`, true);
  }

  playCharacterLine(id: FighterId, kind: 'intro' | 'super' | 'win'): void {
    void this.playVoiceClip(`/audio/voice_${id}_${kind}.wav`, true);
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    setAudioMuted(muted);
    if (this.master) this.master.gain.value = muted ? 0 : 0.72;
    if (this.sfxBus) this.sfxBus.gain.value = muted ? 0 : 1;
    if (muted && this.currentSpeechSource) {
      try {
        this.currentSpeechSource.stop();
      } catch {
        // Ignore
      }
    }
    this.onStateChange?.();
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicEnabled ? 0.2 : 0, this.ctx.currentTime, 0.08);
    }
    this.onStateChange?.();
    return this.musicEnabled;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setTrack(track: TrackId): void {
    this.currentTrack = track;
    this.musicStep = 0;
  }

  private startSequencer(): void {
    if (this.musicTimer !== null) return;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted || !this.musicEnabled || this.paused) return;
      if (this.currentTrack === 'none') return;
      this.playMusicBeat();
    }, 185);
  }

  private playMusicBeat(): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const step = this.musicStep++;

    if (this.currentTrack === 'battle') {
      const bassNotes = [110, 110, 130.8, 110, 146.8, 130.8, 164.8, 146.8];
      if (step % 2 === 0) {
        this.tone(bassNotes[(step >> 1) % bassNotes.length], 0.14, 'sawtooth', 0.14, this.musicGain, t, 88);
      }
      if (step % 4 === 0 || step % 8 === 3) {
        this.noiseBurst(0.055, 0.16, 480, this.musicGain, t);
      }
      if (step % 4 === 2) {
        this.noiseBurst(0.04, 0.12, 2400, this.musicGain, t);
      }
    } else if (this.currentTrack === 'background') {
      const scale = [220, 261.6, 293.7, 329.6, 392.0, 440];
      if (step % 2 === 0) {
        const freq = scale[(step * 3) % scale.length];
        this.tone(freq, 0.18, 'triangle', 0.11, this.musicGain, t, freq * 1.01);
      }
      if (step % 4 === 0) {
        this.tone(110, 0.16, 'sine', 0.1, this.musicGain, t, 75);
      }
    } else if (this.currentTrack === 'intro') {
      const fanfare = [293.7, 370.0, 440.0, 587.3];
      if (step % 4 === 0) {
        const freq = fanfare[(step >> 2) % fanfare.length];
        this.tone(freq, 0.3, 'triangle', 0.12, this.musicGain, t, freq);
      }
    }
  }

  private canSpawnVoice(): boolean {
    return !!this.ctx && !!this.sfxBus && !this.muted && this.ctx.state === 'running' && this.activeVoices < this.maxVoices;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gainLevel: number,
    dest: AudioNode,
    startAt: number,
    endFreq = freq,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startAt + dur);
    }
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.linearRampToValueAtTime(gainLevel, startAt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    osc.connect(g).connect(dest);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.02);
  }

  private noiseBurst(dur: number, gainLevel: number, cutoffHz: number, dest: AudioNode, startAt: number): void {
    if (!this.ctx) return;
    const sampleLen = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, sampleLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < sampleLen; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainLevel, startAt);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(startAt);
  }

  private sfx(fn: (ctx: AudioContext, dest: GainNode, t: number) => void): void {
    if (!this.canSpawnVoice() || !this.ctx || !this.sfxBus) return;
    this.activeVoices++;
    fn(this.ctx, this.sfxBus, this.ctx.currentTime);
    window.setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, 180);
  }

  uiTap(): void {
    this.sfx((_ctx, d, t) => this.tone(620, 0.06, 'sine', 0.14, d, t, 480));
  }

  uiConfirm(): void {
    this.sfx((_ctx, d, t) => {
      this.tone(440, 0.09, 'triangle', 0.18, d, t, 660);
      this.tone(660, 0.12, 'triangle', 0.16, d, t + 0.06, 880);
    });
  }

  uiBack(): void {
    this.sfx((_ctx, d, t) => this.tone(420, 0.09, 'sine', 0.14, d, t, 260));
  }

  hit(power = 1, fighterId?: FighterId): void {
    const jitter = 0.96 + Math.random() * 0.08;
    this.sfx((_ctx, d, t) => {
      if (fighterId === 'thor') {
        this.tone(135 * jitter, 0.22, 'sawtooth', 0.28, d, t, 42);
        this.tone(920, 0.08, 'square', 0.14, d, t, 310);
      } else if (fighterId === 'ironman') {
        this.tone(760 * jitter, 0.14, 'sine', 0.22, d, t, 220);
        this.noiseBurst(0.08, 0.24, 2400, d, t);
      } else if (fighterId === 'michael') {
        this.tone(340 * jitter, 0.08, 'triangle', 0.3, d, t, 65);
        this.noiseBurst(0.1, 0.32, 3200, d, t);
      } else if (fighterId === 'spiderman') {
        this.tone(540 * jitter, 0.07, 'sine', 0.2, d, t, 180);
        this.noiseBurst(0.07, 0.2, 2600, d, t);
      } else if (fighterId === 'steve') {
        // Classic crisp blocky punch + pixel crunch
        this.tone(240, 0.09, 'square', 0.24, d, t, 95);
        this.noiseBurst(0.06, 0.26, 950, d, t);
      } else if (fighterId === 'wukong') {
        this.tone(280 * jitter, 0.12, 'triangle', 0.24, d, t, 120);
        this.noiseBurst(0.09, 0.22, 1800, d, t);
      } else {
        // Kratos heavy steel/bone impact
        this.tone(160 * jitter * (0.9 + power * 0.2), 0.16, 'sawtooth', 0.3, d, t, 38);
        this.noiseBurst(0.1, 0.3, 1300, d, t);
      }
    });
  }

  block(): void {
    this.sfx((_ctx, d, t) => {
      this.tone(540, 0.08, 'square', 0.18, d, t, 310);
      this.noiseBurst(0.05, 0.14, 2200, d, t);
    });
  }

  whoosh(): void {
    this.sfx((_ctx, d, t) => this.noiseBurst(0.11, 0.12, 950, d, t));
  }

  superSting(fighterId?: FighterId): void {
    this.sfx((_ctx, d, t) => {
      if (fighterId === 'michael') {
        this.tone(180, 0.5, 'sine', 0.28, d, t, 48);
      } else if (fighterId === 'ironman') {
        this.tone(260, 0.55, 'sawtooth', 0.26, d, t, 1320);
      } else if (fighterId === 'thor') {
        this.tone(95, 0.45, 'sawtooth', 0.32, d, t, 42);
        this.noiseBurst(0.4, 0.3, 1600, d, t);
      } else {
        this.tone(220, 0.4, 'sawtooth', 0.25, d, t, 880);
        this.tone(440, 0.45, 'triangle', 0.2, d, t + 0.05, 110);
      }
    });
  }

  boom(): void {
    this.sfx((_ctx, d, t) => {
      this.tone(120, 0.45, 'sine', 0.42, d, t, 28);
      this.noiseBurst(0.32, 0.36, 520, d, t);
    });
  }

  ko(): void {
    this.sfx((_ctx, d, t) => {
      this.tone(260, 0.5, 'sawtooth', 0.3, d, t, 45);
      this.noiseBurst(0.35, 0.28, 700, d, t);
    });
  }

  winJingle(won: boolean): void {
    this.sfx((_ctx, d, t) => {
      const seq = won ? [440, 554.4, 659.3, 880] : [392, 349.2, 311.1, 261.6];
      seq.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.2, d, t + i * 0.11, f));
    });
  }

  dispose(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
