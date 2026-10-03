// Deterministic random numbers and value noise.
// Levels are generated from a seed so the same level always looks the same
// (important: saves only store what changed, and tests are reproducible).

/** mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit unsigned int (FNV-1a). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer lattice hash -> [0,1). */
function lattice(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/** 2D value noise in [0,1). */
export function valueNoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 2D gradient (Perlin-style) noise in [0,1). Fewer axis-aligned artifacts than value noise. */
export function gradNoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const g = (cx, cy, dx, dy) => {
    const a = lattice(cx, cy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const q = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const u = q(fx), v = q(fy);
  const n00 = g(ix, iy, fx, fy), n10 = g(ix + 1, iy, fx - 1, fy);
  const n01 = g(ix, iy + 1, fx, fy - 1), n11 = g(ix + 1, iy + 1, fx - 1, fy - 1);
  const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
  return Math.min(0.9999, Math.max(0, 0.5 + (nx0 + (nx1 - nx0) * v) * 0.75));
}

/** Fractal brownian motion of gradient noise (octaves rotated to hide the lattice), roughly in [0,1). */
export function fbm(x, y, seed = 0, octaves = 4) {
  let amp = 0.5, sum = 0, norm = 0;
  const c = Math.cos(0.65), s = Math.sin(0.65);
  for (let o = 0; o < octaves; o++) {
    sum += amp * gradNoise(x + o * 17.3, y - o * 9.1, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    const nx = (x * c - y * s) * 2.03, ny = (x * s + y * c) * 2.03;
    x = nx; y = ny;
  }
  return sum / norm;
}
