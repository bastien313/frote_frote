// Small math / formatting helpers shared by every module. Pure functions only.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Move `v` toward `target` by at most `step`. */
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Format a money amount the idle-game way: 950, 1 234, 12,3K, 4,56M ... */
export function fmtMoney(v) {
  v = Math.floor(v);
  if (v < 0) return '-' + fmtMoney(-v);
  if (v < 10000) return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let i = 0;
  let n = v;
  while (n >= 1000 && i < SUFFIXES.length - 1) { n /= 1000; i++; }
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return n.toFixed(digits).replace('.', ',').replace(/,0+$/, '') + SUFFIXES[i];
}

/** Format a duration in seconds as "1h 05m", "4m 12s" or "35s". */
export function fmtDuration(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

/** Weighted pick from [{w, ...}] or [[value, weight]] arrays. */
export function weightedPick(entries, rnd = Math.random) {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rnd() * total;
  for (const e of entries) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

export const angleOf = (x, y) => Math.atan2(y, x);
export const TAU = Math.PI * 2;
