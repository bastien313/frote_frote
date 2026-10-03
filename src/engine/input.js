// Input: floating virtual joystick (touch / mouse drag anywhere on the canvas)
// plus keyboard (WASD / ZQSD via physical key codes, and arrow keys).

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, radius: 56 };
    this.enabled = true;
    this.onFirstGesture = null;

    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      this.gesture();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.release(); });
  }

  gesture() {
    if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
  }

  down(e) {
    this.gesture();
    if (!this.enabled || this.joy.active) return;
    e.preventDefault();
    this.joy.active = true;
    this.joy.id = e.pointerId;
    this.joy.ox = e.clientX;
    this.joy.oy = e.clientY;
    this.joy.dx = this.joy.dy = 0;
    this.joy.radius = Math.max(44, Math.min(70, Math.min(window.innerWidth, window.innerHeight) * 0.12));
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  move(e) {
    const j = this.joy;
    if (!j.active || e.pointerId !== j.id) return;
    e.preventDefault();
    let dx = (e.clientX - j.ox) / j.radius, dy = (e.clientY - j.oy) / j.radius;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      // drag the origin along so direction changes stay responsive
      const over = d - 1;
      j.ox += (dx / d) * over * j.radius;
      j.oy += (dy / d) * over * j.radius;
      dx /= d; dy /= d;
    }
    j.dx = dx; j.dy = dy;
  }

  up(e) {
    if (this.joy.active && e.pointerId === this.joy.id) this.release();
  }

  release() {
    this.joy.active = false;
    this.joy.id = null;
    this.joy.dx = this.joy.dy = 0;
  }

  /** Movement vector, magnitude 0..1. */
  vector() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
    if (this.joy.active) {
      const d = Math.hypot(this.joy.dx, this.joy.dy);
      if (d < 0.12) return { x: 0, y: 0 };
      const m = Math.min(1, (d - 0.12) / 0.6);
      return { x: (this.joy.dx / d) * m, y: (this.joy.dy / d) * m };
    }
    return { x: 0, y: 0 };
  }
}
