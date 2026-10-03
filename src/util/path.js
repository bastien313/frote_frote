// A* pathfinding on the tile grid + line-of-sight path smoothing.
// `isFree(tx, ty)` tells whether a tile can be walked on.

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node, f) {
    const it = this.items;
    it.push({ node, f });
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (it[p].f <= it[i].f) break;
      [it[p], it[i]] = [it[i], it[p]];
      i = p;
    }
  }
  pop() {
    const it = this.items;
    const top = it[0];
    const last = it.pop();
    if (it.length > 0) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < it.length && it[l].f < it[m].f) m = l;
        if (r < it.length && it[r].f < it[m].f) m = r;
        if (m === i) break;
        [it[m], it[i]] = [it[i], it[m]];
        i = m;
      }
    }
    return top.node;
  }
}

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * Find a path of tiles from (sx,sy) to (gx,gy). Returns an array of
 * {x,y} tile coordinates (start excluded, goal included) or null.
 * If the goal itself is blocked, the path ends next to it.
 */
export function findPath(w, h, isFree, sx, sy, gx, gy, maxNodes = 6000) {
  sx |= 0; sy |= 0; gx |= 0; gy |= 0;
  if (sx === gx && sy === gy) return [];
  const goalFree = isFree(gx, gy);
  const idx = (x, y) => y * w + x;
  const g = new Float32Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const heap = new MinHeap();
  const hfn = (x, y) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  const s = idx(sx, sy);
  g[s] = 0;
  heap.push(s, hfn(sx, sy));
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur / w) | 0;
    if (cx === gx && cy === gy) return rebuild(came, cur, w, s);
    // goal blocked: stop when adjacent to it
    if (!goalFree && Math.abs(cx - gx) <= 1 && Math.abs(cy - gy) <= 1) return rebuild(came, cur, w, s);
    if (++expanded > maxNodes) break;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const isGoal = nx === gx && ny === gy;
      if (!isFree(nx, ny) && !(isGoal && goalFree)) continue;
      // no corner cutting
      if (dx !== 0 && dy !== 0 && (!isFree(cx + dx, cy) || !isFree(cx, cy + dy))) continue;
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + hfn(nx, ny));
      }
    }
  }
  return null;
}

function rebuild(came, node, w, start) {
  const out = [];
  while (node !== start && node !== -1) {
    out.push({ x: node % w, y: (node / w) | 0 });
    node = came[node];
  }
  out.reverse();
  return out;
}

/** True if a circle of radius r can travel in a straight line between two world points. */
export function lineFree(isFree, ax, ay, bx, by, r = 0.3) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 0.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (!isFree(Math.floor(x - r), Math.floor(y - r)) || !isFree(Math.floor(x + r), Math.floor(y - r)) ||
        !isFree(Math.floor(x - r), Math.floor(y + r)) || !isFree(Math.floor(x + r), Math.floor(y + r))) return false;
  }
  return true;
}

/**
 * Convert a tile path to world waypoints (tile centers) and remove
 * intermediate points that are in direct line of sight.
 */
export function smoothPath(isFree, startX, startY, tiles, finalX, finalY) {
  const pts = tiles.map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 }));
  if (finalX !== undefined && pts.length > 0) {
    pts[pts.length - 1] = { x: finalX, y: finalY };
  } else if (finalX !== undefined) {
    pts.push({ x: finalX, y: finalY });
  }
  if (pts.length <= 1) return pts;
  const out = [];
  let ax = startX, ay = startY;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !lineFree(isFree, ax, ay, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    ax = pts[j].x; ay = pts[j].y;
    i = j + 1;
  }
  return out;
}
