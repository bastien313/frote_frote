// The dirt layer: a fine grid (DIRT_RES cells per tile) storing how dirty
// each spot of floor is, and which dirt type it is. Cleaning erases it.
// The renderer draws `pixels` (RGBA, 1 px per cell) scaled up with smoothing,
// which gives soft organic stains for free.

import { DIRT_TYPES } from '../data/catalog.js';
import { fbm, valueNoise, hashString } from '../util/rng.js';
import { CELL } from './level.js';

export const DIRT_RES = 8;
/** Amount removed per second at the center of a power-1 tool on hardness-1 dirt. */
export const BASE_CLEAN_RATE = 3.2;
const EPS = 0.03;

export class DirtLayer {
  constructor(map, res = DIRT_RES) {
    this.map = map;
    this.res = res;
    this.w = map.w * res;
    this.h = map.h * res;
    const n = this.w * this.h;
    this.amount = new Float32Array(n);
    this.type = new Uint8Array(n);
    this.shade = new Uint8Array(n);
    this.room = new Int8Array(n).fill(-1);
    this.roomInitial = new Float64Array(map.rooms.length);
    this.roomNow = new Float64Array(map.rooms.length);
    this.tileSum = new Float32Array(map.w * map.h);
    this.pixels = new Uint8ClampedArray(n * 4);
    this.dirty = { x0: 0, y0: 0, x1: this.w - 1, y1: this.h - 1, any: true };
    // room membership of every dirt cell (floor cells only)
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const ti = map.idx(tx, ty);
        if (map.cell[ti] !== CELL.FLOOR) continue;
        const ri = map.roomIdx[ti];
        for (let sy = 0; sy < res; sy++) {
          for (let sx = 0; sx < res; sx++) {
            this.room[(ty * res + sy) * this.w + tx * res + sx] = ri;
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const x = i % this.w, y = (i / this.w) | 0;
      const v = valueNoise(x * 0.16, y * 0.16, 77) * 0.65 + valueNoise(x * 0.7, y * 0.7, 78) * 0.35;
      this.shade[i] = Math.floor(v * 255);
    }
  }

  /** Procedurally fill every room with its dirt layers (deterministic per level id). */
  generate(levelDef) {
    const { res } = this;
    for (const room of this.map.rooms) {
      const layers = room.def.dirt || [];
      const cells = [];
      for (const ti of room.cells) {
        const tx = ti % this.map.w, ty = (ti / this.map.w) | 0;
        for (let sy = 0; sy < res; sy++) {
          for (let sx = 0; sx < res; sx++) cells.push((ty * res + sy) * this.w + tx * res + sx);
        }
      }
      layers.forEach((L, li) => {
        const typeIndex = DIRT_TYPES.findIndex((d) => d && d.id === L.type);
        if (typeIndex < 1) throw new Error(`Unknown dirt type ${L.type}`);
        const seed = hashString(levelDef.id + ':' + room.id + ':' + li) & 0xffff;
        const scale = (L.scale || 2) * res;
        const vals = new Float32Array(cells.length);
        for (let k = 0; k < cells.length; k++) {
          const i = cells[k];
          const x = i % this.w, y = (i / this.w) | 0;
          vals[k] = fbm(x / scale, y / scale, seed, 4) * 0.92 + valueNoise(x / 2.5, y / 2.5, seed + 9) * 0.08;
        }
        const sorted = Float32Array.from(vals).sort();
        const cover = Math.min(0.98, Math.max(0.02, L.cover ?? 0.5));
        const t = sorted[Math.floor((1 - cover) * (sorted.length - 1))];
        for (let k = 0; k < cells.length; k++) {
          const v = vals[k];
          if (v <= t) continue;
          const a = Math.min(1, 0.35 + (v - t) / 0.1) * (L.amount ?? 1);
          const i = cells[k];
          if (a > this.amount[i]) {
            this.amount[i] = a;
            this.type[i] = typeIndex;
          }
        }
      });
    }
    this.recomputeTotals(true);
    this.markAllDirty();
  }

  recomputeTotals(asInitial = false) {
    this.roomNow.fill(0);
    this.tileSum.fill(0);
    const { res } = this;
    for (let i = 0; i < this.amount.length; i++) {
      const a = this.amount[i];
      if (a <= 0) continue;
      const r = this.room[i];
      if (r >= 0) this.roomNow[r] += a;
      const x = i % this.w, y = (i / this.w) | 0;
      this.tileSum[((y / res) | 0) * this.map.w + ((x / res) | 0)] += a;
    }
    if (asInitial) this.roomInitial.set(this.roomNow);
  }

  /** Fraction of the initial dirt still present in a room (0 = spotless). */
  roomDirtRatio(roomIndex) {
    const init = this.roomInitial[roomIndex];
    if (init <= 0) return 0;
    return this.roomNow[roomIndex] / init;
  }

  /**
   * Scrub a disc. Returns {removed, blocked, blockedType}.
   * `canClean(roomIndex)` filters which rooms may be cleaned.
   */
  clean(cx, cy, radius, power, tier, dt, canClean) {
    const { res } = this;
    const x0 = Math.max(0, Math.floor((cx - radius) * res)), x1 = Math.min(this.w - 1, Math.floor((cx + radius) * res));
    const y0 = Math.max(0, Math.floor((cy - radius) * res)), y1 = Math.min(this.h - 1, Math.floor((cy + radius) * res));
    const r2 = radius * radius;
    let removed = 0, blocked = 0, blockedType = 0, cleared = 0;
    const perRoom = new Map();
    for (let y = y0; y <= y1; y++) {
      const wy = (y + 0.5) / res - cy;
      for (let x = x0; x <= x1; x++) {
        const i = y * this.w + x;
        const a = this.amount[i];
        if (a <= 0) continue;
        const wx = (x + 0.5) / res - cx;
        const d2 = wx * wx + wy * wy;
        if (d2 > r2) continue;
        const ri = this.room[i];
        if (canClean && !canClean(ri)) continue;
        const dt0 = DIRT_TYPES[this.type[i]];
        let tf = 1;
        if (tier < dt0.tier) { tf = 0.06; blocked++; blockedType = this.type[i]; }
        const w = 1 - 0.7 * (d2 / r2);
        let rem = (dt * BASE_CLEAN_RATE * power * w * tf) / dt0.hardness;
        let na = a - rem;
        if (na < EPS) { na = 0; rem = a; cleared++; }
        this.amount[i] = na;
        if (na === 0) this.type[i] = 0;
        removed += rem;
        if (ri >= 0) perRoom.set(ri, (perRoom.get(ri) || 0) + rem);
        this.tileSum[((y / res) | 0) * this.map.w + ((x / res) | 0)] -= rem;
        this.writePixel(i);
      }
    }
    if (removed > 0) {
      for (const [ri, v] of perRoom) this.roomNow[ri] = Math.max(0, this.roomNow[ri] - v);
      this.markDirty(x0, y0, x1, y1);
    }
    return { removed, blocked, blockedType, cleared, perRoom };
  }

  /** Add a splat of dirt (customer spills...). Does not change the initial totals. */
  addStain(cx, cy, radius, typeId, amount, seed = 1) {
    const typeIndex = typeof typeId === 'number' ? typeId : DIRT_TYPES.findIndex((d) => d && d.id === typeId);
    const { res } = this;
    const x0 = Math.max(0, Math.floor((cx - radius) * res)), x1 = Math.min(this.w - 1, Math.floor((cx + radius) * res));
    const y0 = Math.max(0, Math.floor((cy - radius) * res)), y1 = Math.min(this.h - 1, Math.floor((cy + radius) * res));
    let added = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * this.w + x;
        const ri = this.room[i];
        if (ri < 0) continue;
        const tx = (x / res) | 0, ty = (y / res) | 0;
        if (this.map.furniture[this.map.idx(tx, ty)] > 0) continue;
        const wx = (x + 0.5) / res - cx, wy = (y + 0.5) / res - cy;
        const d = Math.sqrt(wx * wx + wy * wy) / radius;
        const n = valueNoise(x / 3, y / 3, seed) * 0.6 + 0.4;
        const v = Math.max(0, 1 - d / n) * amount * 1.6;
        if (v <= 0.05) continue;
        const na = Math.min(1, Math.max(this.amount[i], v));
        const delta = na - this.amount[i];
        if (delta <= 0) continue;
        this.amount[i] = na;
        this.type[i] = typeIndex;
        added += delta;
        this.roomNow[ri] += delta;
        this.tileSum[ty * this.map.w + tx] += delta;
        this.writePixel(i);
      }
    }
    this.markDirty(x0, y0, x1, y1);
    return added;
  }

  /** Remove dirt under tiles (when furniture is built on top). */
  clearTiles(tiles) {
    const { res } = this;
    for (const [tx, ty] of tiles) {
      for (let sy = 0; sy < res; sy++) {
        for (let sx = 0; sx < res; sx++) {
          const x = tx * res + sx, y = ty * res + sy;
          if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
          const i = y * this.w + x;
          const a = this.amount[i];
          if (a <= 0) continue;
          const ri = this.room[i];
          if (ri >= 0) {
            this.roomNow[ri] = Math.max(0, this.roomNow[ri] - a);
            this.roomInitial[ri] = Math.max(0, this.roomInitial[ri] - a);
          }
          this.amount[i] = 0;
          this.type[i] = 0;
          this.writePixel(i);
        }
      }
      this.tileSum[ty * this.map.w + tx] = 0;
      this.markDirty(tx * res, ty * res, tx * res + res - 1, ty * res + res - 1);
    }
  }

  /** Erase all dirt of a room; returns sample positions (world) of what was wiped, for sparkles. */
  wipeRoom(ri) {
    const pts = [];
    for (let i = 0; i < this.amount.length; i++) {
      if (this.room[i] !== ri || this.amount[i] <= 0) continue;
      if (pts.length < 60 && Math.random() < 0.05) pts.push({ x: (i % this.w + 0.5) / this.res, y: (((i / this.w) | 0) + 0.5) / this.res });
      this.amount[i] = 0;
      this.type[i] = 0;
      this.writePixel(i);
    }
    this.roomNow[ri] = 0;
    this.recomputeTotals(false);
    this.markAllDirty();
    return pts;
  }

  /** Nearest tile (world center) with dirt above `minSum` in an allowed room. */
  nearestDirtyTile(x, y, canClean, minSum = 1.5) {
    let best = null, bestD = Infinity;
    const mw = this.map.w;
    for (let i = 0; i < this.tileSum.length; i++) {
      if (this.tileSum[i] < minSum) continue;
      const ri = this.map.roomIdx[i];
      if (ri < 0 || (canClean && !canClean(ri))) continue;
      const tx = i % mw, ty = (i / mw) | 0;
      const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
      if (d < bestD) { bestD = d; best = { x: tx + 0.5, y: ty + 0.5, tx, ty, sum: this.tileSum[i] }; }
    }
    if (best) {
      // aim at the dirtiest cell of that tile (tile centres can leave corners untouched)
      const { res } = this;
      let ba = 0;
      for (let sy = 0; sy < res; sy++) {
        for (let sx = 0; sx < res; sx++) {
          const a = this.amount[(best.ty * res + sy) * this.w + best.tx * res + sx];
          if (a > ba) { ba = a; best.x = best.tx + (sx + 0.5) / res; best.y = best.ty + (sy + 0.5) / res; }
        }
      }
    }
    return best;
  }

  /** Tile coordinates whose dirt sum is greatest within a room (used by hints). */
  dirtiestTileInRoom(ri) {
    let best = null, bestS = 0.5;
    const mw = this.map.w;
    for (let i = 0; i < this.tileSum.length; i++) {
      if (this.map.roomIdx[i] !== ri) continue;
      if (this.tileSum[i] > bestS) { bestS = this.tileSum[i]; best = { x: (i % mw) + 0.5, y: ((i / mw) | 0) + 0.5 }; }
    }
    return best;
  }

  /** Is there noticeable dirt under a world point? */
  amountAt(wx, wy) {
    const x = Math.floor(wx * this.res), y = Math.floor(wy * this.res);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.amount[y * this.w + x];
  }

  // ---------------------------------------------------------------- rendering

  writePixel(i) {
    const a = this.amount[i];
    const p = i * 4;
    if (a <= 0) { this.pixels[p + 3] = 0; return; }
    const t = DIRT_TYPES[this.type[i]];
    const s = 0.72 + (this.shade[i] / 255) * 0.5 - a * 0.1;
    this.pixels[p] = t.color[0] * s;
    this.pixels[p + 1] = t.color[1] * s;
    this.pixels[p + 2] = t.color[2] * s;
    this.pixels[p + 3] = Math.min(1, 0.3 + a * 1.15) * t.alpha * 255;
  }

  markDirty(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d.any) { d.x0 = x0; d.y0 = y0; d.x1 = x1; d.y1 = y1; d.any = true; return; }
    d.x0 = Math.min(d.x0, x0); d.y0 = Math.min(d.y0, y0);
    d.x1 = Math.max(d.x1, x1); d.y1 = Math.max(d.y1, y1);
  }

  markAllDirty() {
    for (let i = 0; i < this.amount.length; i++) this.writePixel(i);
    this.dirty = { x0: 0, y0: 0, x1: this.w - 1, y1: this.h - 1, any: true };
  }

  // ---------------------------------------------------------------- save / load

  serialize() {
    const n = this.amount.length;
    const q = new Uint8Array(n);
    for (let i = 0; i < n; i++) q[i] = Math.round(Math.min(1, this.amount[i]) * 255);
    return { a: rleEncode(q), t: rleEncode(this.type), i: Array.from(this.roomInitial, (v) => Math.round(v)) };
  }

  deserialize(data) {
    const q = rleDecode(data.a, this.amount.length);
    const t = rleDecode(data.t, this.type.length);
    const minQ = Math.ceil(EPS * 255);
    for (let i = 0; i < q.length; i++) {
      this.amount[i] = q[i] >= minQ ? q[i] / 255 : 0;
      this.type[i] = this.amount[i] > 0 ? t[i] : 0;
      if (this.amount[i] > 0 && !DIRT_TYPES[this.type[i]]) { this.amount[i] = 0; this.type[i] = 0; }
    }
    this.recomputeTotals(false);
    if (Array.isArray(data.i) && data.i.length === this.roomInitial.length) {
      this.roomInitial.set(data.i);
    }
    this.markAllDirty();
  }
}

// --- RLE + base64 (varint run length, then value byte) ----------------------

export function rleEncode(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let run = 1;
    while (i + run < arr.length && arr[i + run] === v) run++;
    let r = run;
    while (r >= 0x80) { out.push((r & 0x7f) | 0x80); r >>>= 7; }
    out.push(r);
    out.push(v);
    i += run;
  }
  return bytesToB64(Uint8Array.from(out));
}

export function rleDecode(b64, length) {
  const bytes = b64ToBytes(b64);
  const out = new Uint8Array(length);
  let o = 0, i = 0;
  while (i < bytes.length && o < length) {
    let run = 0, shift = 0, b;
    do { b = bytes[i++]; run |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const v = bytes[i++];
    out.fill(v, o, Math.min(length, o + run));
    o += run;
  }
  return out;
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
