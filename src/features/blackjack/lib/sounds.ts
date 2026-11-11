// ========================
// Sound Effects System (Web Audio API)
// ========================

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private volume = 0.3;
  private unlocked = false;

  constructor() {
    this.initUserGestureUnlock();
  }

  private initUserGestureUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { passive: true, once: true });
    window.addEventListener('touchstart', unlock, { passive: true, once: true });
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      // Pre-allocate 1 second of white noise
      const bufferSize = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.15;
      }
    }
    return this.noiseBuffer;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal?: number) {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = gainVal ?? this.volume;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
      };

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio not available
    }
  }

  private playNoise(duration: number, gainVal?: number) {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const source = ctx.createBufferSource();
      source.buffer = this.getNoiseBuffer(ctx);
      const gain = ctx.createGain();
      gain.gain.value = gainVal ?? this.volume * 0.3;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      source.connect(gain);
      gain.connect(ctx.destination);

      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
      };

      source.start();
      source.stop(ctx.currentTime + duration);
    } catch {
      // Audio not available
    }
  }

  cardDeal() {
    this.playNoise(0.08, this.volume * 0.5);
    setTimeout(() => this.playTone(800, 0.05, 'sine', this.volume * 0.15), 30);
  }

  cardFlip() {
    this.playNoise(0.06, this.volume * 0.4);
    setTimeout(() => this.playTone(1200, 0.04, 'sine', this.volume * 0.1), 20);
  }

  chipPlace() {
    this.playTone(1800, 0.06, 'sine', this.volume * 0.2);
    setTimeout(() => this.playTone(2400, 0.04, 'sine', this.volume * 0.15), 30);
  }

  hit() {
    this.playTone(600, 0.1, 'sine', this.volume * 0.2);
  }

  stand() {
    this.playTone(400, 0.15, 'triangle', this.volume * 0.2);
    setTimeout(() => this.playTone(300, 0.1, 'triangle', this.volume * 0.15), 80);
  }

  blackjack() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.2, 'sine', this.volume * 0.25), i * 100);
    });
  }

  win() {
    this.playTone(523, 0.15, 'sine', this.volume * 0.2);
    setTimeout(() => this.playTone(659, 0.15, 'sine', this.volume * 0.2), 100);
    setTimeout(() => this.playTone(784, 0.2, 'sine', this.volume * 0.25), 200);
  }

  lose() {
    this.playTone(300, 0.2, 'triangle', this.volume * 0.15);
    setTimeout(() => this.playTone(250, 0.3, 'triangle', this.volume * 0.12), 150);
  }

  push() {
    this.playTone(440, 0.15, 'sine', this.volume * 0.15);
    setTimeout(() => this.playTone(440, 0.15, 'sine', this.volume * 0.12), 150);
  }

  bet() {
    this.playTone(600, 0.08, 'sine', this.volume * 0.15);
  }

  newRound() {
    this.playTone(440, 0.1, 'triangle', this.volume * 0.15);
    setTimeout(() => this.playTone(550, 0.1, 'triangle', this.volume * 0.15), 80);
    setTimeout(() => this.playTone(660, 0.15, 'triangle', this.volume * 0.2), 160);
  }
}

export const sounds = new SoundEngine();
