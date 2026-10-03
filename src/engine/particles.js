// Lightweight particle + floating text system (world coordinates, z = height in tiles).
// Pure data/update; drawing lives in render/renderer.js.

export class Particles {
  constructor(max = 700) {
    this.max = max;
    this.list = [];
    this.texts = [];
    this.enabled = true;
    this.scale = 1; // quality multiplier on spawn counts
  }

  spawn(p) {
    if (!this.enabled) return;
    if (this.list.length >= this.max) this.list.shift();
    p.life = p.max = p.max ?? p.life ?? 0.6;
    p.z ??= 0; p.vx ??= 0; p.vy ??= 0; p.vz ??= 0; p.g ??= 0; p.drag ??= 0;
    p.rot ??= Math.random() * Math.PI * 2; p.vr ??= 0;
    p.size ??= 0.08;
    this.list.push(p);
  }

  count(n) { return Math.max(1, Math.round(n * this.scale)); }

  /** Generic radial burst. */
  burst(x, y, n, o = {}) {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (o.speed ?? 1.5) * (0.4 + Math.random() * 0.8);
      this.spawn({
        type: o.type || 'dot', x, y, z: o.z ?? 0.2,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: (o.up ?? 2) * (0.5 + Math.random()),
        g: o.g ?? 7, drag: o.drag ?? 1.5, max: (o.life ?? 0.7) * (0.7 + Math.random() * 0.6),
        size: (o.size ?? 0.07) * (0.7 + Math.random() * 0.6),
        color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color || '#fff',
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  sparkle(x, y, n = 4, spread = 0.4, color = '#fff6b0') {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: 'spark', x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread * 2,
        z: 0.05 + Math.random() * 0.4, vz: 0.4 + Math.random() * 0.5, max: 0.5 + Math.random() * 0.5,
        size: 0.06 + Math.random() * 0.08, color,
      });
    }
  }

  bubbles(x, y, n = 2, spread = 0.35) {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: 'bubble', x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread * 2,
        z: 0.02, vz: 0.3 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.3, max: 0.6 + Math.random() * 0.6,
        size: 0.04 + Math.random() * 0.06, color: 'rgba(255,255,255,0.9)',
      });
    }
  }

  spray(x, y, dirx, diry, n = 3, color = '#8fd3ff') {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const s = 2.5 + Math.random() * 2;
      const a = Math.atan2(diry, dirx) + (Math.random() - 0.5) * 0.9;
      this.spawn({
        type: 'drop', x, y, z: 0.45, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0.5 + Math.random(),
        g: 9, drag: 2.5, max: 0.25 + Math.random() * 0.2, size: 0.035 + Math.random() * 0.03, color,
      });
    }
  }

  dust(x, y, n = 6, color = 'rgba(170,150,120,0.7)') {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({
        type: 'dust', x, y, z: 0.15 + Math.random() * 0.3, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 0.9, vz: 0.6,
        drag: 3, max: 0.6 + Math.random() * 0.4, size: 0.18 + Math.random() * 0.16, color,
      });
    }
  }

  confetti(x, y, n = 40) {
    const colors = ['#ff5d5d', '#ffd34d', '#4dd2ff', '#7dff6b', '#d77dff', '#ff9a3d'];
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      this.spawn({
        type: 'confetti', x, y, z: 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: 3 + Math.random() * 4,
        g: 6, drag: 1.2, max: 1.4 + Math.random(), size: 0.08 + Math.random() * 0.05,
        color: colors[i % colors.length], vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  ring(x, y, color = '#ffffff', size = 1, life = 0.45) {
    this.spawn({ type: 'ring', x, y, z: 0.02, max: life, size, color });
  }

  text(x, y, str, color = '#5dff7a', size = 1, z = 1.1) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.2, y, z, str, color, size, life: 1.1, max: 1.1 });
  }

  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.vz -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.rot += p.vr * dt;
      L[w++] = p;
    }
    L.length = w;
    const T = this.texts;
    w = 0;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      t.life -= dt;
      if (t.life <= 0) continue;
      t.z += dt * 0.9;
      T[w++] = t;
    }
    T.length = w;
  }
}
