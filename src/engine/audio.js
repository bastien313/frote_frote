// Synthesized audio (WebAudio, no sound files): short SFX, a looping scrub
// noise whose volume follows the cleaning intensity, and gentle generative music.

export class Audio {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.35;
    this.enabled = true;
    this.lastPlay = {};
    this.musicOn = false;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master);
    this.noiseBuf = this.makeNoise();
    this.startScrub();
    if (this.wantMusic) this.startMusic();
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.1);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = 0, delay = 0, dest } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, { freq = 1200, q = 1, vol = 0.3, type = 'bandpass', delay = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  play(name, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const minGap = { tick: 0.05, serve: 0.06, pop: 0.03, deposit: 0.035, pick: 0.04, drop: 0.04, hit: 0.05 }[name] ?? 0.02;
    if (now - (this.lastPlay[name] || 0) < minGap) return;
    this.lastPlay[name] = now;
    const p = o.pitch || 1;
    switch (name) {
      case 'pop': this.tone(520 * p, 0.09, { type: 'sine', vol: 0.25, slide: 1.8 }); break;
      case 'deposit': this.tone(380 * p, 0.07, { type: 'triangle', vol: 0.22, slide: 0.6 }); this.noiseBurst(0.05, { freq: 900, vol: 0.06 }); break;
      case 'pick': this.tone(660 * p, 0.06, { type: 'triangle', vol: 0.18, slide: 1.3 }); break;
      case 'drop': this.tone(440 * p, 0.06, { type: 'triangle', vol: 0.16, slide: 0.8 }); break;
      case 'serve': this.tone(880, 0.05, { type: 'sine', vol: o.quiet ? 0.05 : 0.14 }); break;
      case 'cash':
        this.tone(1318, 0.08, { type: 'square', vol: 0.08 });
        this.tone(1760, 0.18, { type: 'square', vol: 0.08, delay: 0.07 });
        this.noiseBurst(0.12, { freq: 5000, vol: 0.08, type: 'highpass', delay: 0.05 });
        break;
      case 'tick': this.tone(900 * p, 0.04, { type: 'square', vol: 0.05 }); break;
      case 'build':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.07 }));
        this.noiseBurst(0.2, { freq: 300, vol: 0.15, type: 'lowpass' });
        break;
      case 'upgrade':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.14, { type: 'sine', vol: 0.18, delay: i * 0.05 }));
        break;
      case 'unlock':
        this.noiseBurst(0.35, { freq: 220, vol: 0.4, type: 'lowpass' });
        [330, 440, 554, 660].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.15, delay: 0.1 + i * 0.06 }));
        break;
      case 'fanfare':
        [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.09 }));
        break;
      case 'quest':
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.15, { type: 'sine', vol: 0.18, delay: i * 0.08 }));
        break;
      case 'star':
        [659, 880, 1046, 1318, 1760].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.1 }));
        break;
      case 'error': this.tone(200, 0.15, { type: 'square', vol: 0.08, slide: 0.7 }); break;
      case 'hit': this.noiseBurst(0.08, { freq: 500 * p, q: 2, vol: 0.35 }); this.tone(120 * p, 0.08, { type: 'square', vol: 0.08, slide: 0.5 }); break;
      case 'break': this.noiseBurst(0.35, { freq: 700, q: 0.7, vol: 0.5 }); this.tone(90, 0.25, { type: 'sawtooth', vol: 0.12, slide: 0.4 }); break;
      case 'clear': this.tone(600, 0.06, { vol: 0.15 }); this.tone(900, 0.08, { vol: 0.12, delay: 0.05 }); break;
      case 'angry': this.tone(260, 0.2, { type: 'sawtooth', vol: 0.05, slide: 0.7 }); break;
      case 'click': this.tone(700, 0.04, { type: 'sine', vol: 0.12 }); break;
    }
  }

  // ---------------------------------------------------------------- scrub loop

  startScrub() {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    this.scrubFilter = c.createBiquadFilter();
    this.scrubFilter.type = 'bandpass';
    this.scrubFilter.frequency.value = 1800;
    this.scrubFilter.Q.value = 0.8;
    this.scrubGain = c.createGain();
    this.scrubGain.gain.value = 0;
    this.scrubLfo = c.createOscillator();
    this.scrubLfo.frequency.value = 7;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 500;
    this.scrubLfo.connect(lfoGain);
    lfoGain.connect(this.scrubFilter.frequency);
    s.connect(this.scrubFilter);
    this.scrubFilter.connect(this.scrubGain);
    this.scrubGain.connect(this.sfx);
    s.start();
    this.scrubLfo.start();
  }

  /** intensity 0..1, tool id changes the colour of the sound. */
  setScrub(intensity, tool) {
    if (!this.ctx || !this.scrubGain) return;
    const t = this.ctx.currentTime;
    const base = { sponge: 1500, mop: 1100, washer: 3200, scrubber: 700 }[tool] || 1500;
    this.scrubFilter.frequency.setTargetAtTime(base, t, 0.1);
    this.scrubLfo.frequency.setTargetAtTime(tool === 'washer' ? 18 : tool === 'scrubber' ? 4 : 7, t, 0.1);
    this.scrubGain.gain.setTargetAtTime(this.enabled ? intensity * 0.22 : 0, t, 0.06);
  }

  // ---------------------------------------------------------------- music

  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const chords = [
      [261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7],
    ];
    const scale = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];
    let step = 0;
    const beat = 0.42;
    let next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.musicOn) return;
      while (next < this.ctx.currentTime + 0.3) {
        const bar = Math.floor(step / 8) % chords.length;
        const ch = chords[bar];
        if (step % 8 === 0) ch.forEach((f) => this.tone(f, beat * 7.5, { type: 'sine', vol: 0.05, attack: 0.3, dest: this.music, delay: next - this.ctx.currentTime }));
        if (step % 2 === 0) this.tone(ch[0] / 2, beat * 1.6, { type: 'triangle', vol: 0.08, dest: this.music, delay: next - this.ctx.currentTime });
        if (Math.random() < 0.55) {
          const f = scale[Math.floor(Math.random() * scale.length)];
          this.tone(f, beat * 0.9, { type: 'triangle', vol: 0.045, dest: this.music, delay: next - this.ctx.currentTime });
        }
        step++;
        next += beat;
      }
      this.musicTimer = setTimeout(tick, 120);
    };
    tick();
  }

  stopMusic() {
    this.wantMusic = false;
    this.musicOn = false;
    clearTimeout(this.musicTimer);
  }
}
