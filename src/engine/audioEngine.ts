/**
 * 100% procedural Web Audio API soundscape for the 3D aquarium.
 * Generates soft water circulation, random bubble pops, and feeding plops
 * without any external audio assets.
 */
export class AquariumAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNoiseGain: GainNode | null = null;
  private filterBiquad: BiquadFilterNode | null = null;
  private enabled = false;
  private filterPower = 0.72;
  private aeration = true;
  private bubbleTimer: number | null = null;

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (next) {
      this.initIfNeeded();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setTargetAtTime(0.28, this.ctx.currentTime, 0.25);
      }
      this.scheduleBubbleLoop();
    } else {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      }
      if (this.bubbleTimer !== null) {
        window.clearTimeout(this.bubbleTimer);
        this.bubbleTimer = null;
      }
    }
  }

  public updateFiltration(power01: number, aeration: boolean): void {
    this.filterPower = Math.max(0, Math.min(1, power01));
    this.aeration = aeration;
    if (!this.ctx || !this.filterNoiseGain || !this.filterBiquad) return;
    const now = this.ctx.currentTime;
    const targetGain = 0.03 + this.filterPower * 0.16;
    const targetFreq = 260 + this.filterPower * 540;
    this.filterNoiseGain.gain.setTargetAtTime(targetGain, now, 0.2);
    this.filterBiquad.frequency.setTargetAtTime(targetFreq, now, 0.2);
  }

  public playFeedPlop(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Soft cluster of 3 tiny water plops
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.065 + Math.random() * 0.025;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const baseFreq = 460 + Math.random() * 260;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.9, t + 0.065);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.09);
    }
  }

  public playNibble(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const startFreq = 720 + Math.random() * 240;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.4, now + 0.04);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  private initIfNeeded(): void {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0001;
    this.masterGain.connect(this.ctx.destination);

    // Continuous gentle filtered brown/pink water noise
    const bufferLen = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferLen, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferLen; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.028 * white) / 1.028;
      data[i] = lastOut * 2.8;
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    this.filterBiquad = this.ctx.createBiquadFilter();
    this.filterBiquad.type = 'bandpass';
    this.filterBiquad.frequency.value = 260 + this.filterPower * 540;
    this.filterBiquad.Q.value = 0.9;

    this.filterNoiseGain = this.ctx.createGain();
    this.filterNoiseGain.gain.value = 0.03 + this.filterPower * 0.16;

    noiseSrc.connect(this.filterBiquad);
    this.filterBiquad.connect(this.filterNoiseGain);
    this.filterNoiseGain.connect(this.masterGain);
    noiseSrc.start();
  }

  private scheduleBubbleLoop(): void {
    if (this.bubbleTimer !== null) {
      window.clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
    if (!this.enabled) return;

    const activity = this.aeration ? 0.35 + this.filterPower * 0.65 : this.filterPower * 0.3;
    if (activity > 0.04 && this.ctx && this.masterGain) {
      this.triggerBubblePop(activity);
    }

    const delayMs = Math.max(110, 720 - activity * 520) * (0.65 + Math.random() * 0.75);
    this.bubbleTimer = window.setTimeout(() => this.scheduleBubbleLoop(), delayMs);
  }

  private triggerBubblePop(activity: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const base = 310 + Math.random() * 520;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * (1.45 + Math.random() * 0.45), now + 0.045);

    const vol = 0.015 + Math.random() * 0.028 * activity;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public dispose(): void {
    if (this.bubbleTimer !== null) {
      window.clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
