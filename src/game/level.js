// Parses a level definition (ASCII map + rooms) into a tile grid with
// room membership and a dynamic "solid" layer used for collisions and pathfinding.
// See docs/LEVEL_FORMAT.md for the map legend.

export const CELL = {
  VOID: 0, WALL: 1, WINDOW: 2, FLOOR: 3, PAVEMENT: 4, GRASS: 5, TREE: 6, HEDGE: 7,
  FENCE: 8, DOOR: 9, ENTRANCE: 10, WATER: 11, SANDX: 12,
};

const CHAR_TO_CELL = {
  '#': CELL.WALL, 'W': CELL.WINDOW, '.': CELL.PAVEMENT, ',': CELL.GRASS, 'T': CELL.TREE,
  '~': CELL.HEDGE, '_': CELL.FENCE, '=': CELL.ENTRANCE, 'w': CELL.WATER, ':': CELL.SANDX,
  ' ': CELL.VOID,
};

/** Cells that block movement regardless of game state. */
export const STATIC_SOLID = new Set([CELL.VOID, CELL.WALL, CELL.WINDOW, CELL.TREE, CELL.HEDGE, CELL.FENCE, CELL.WATER]);
/** Cells drawn as tall walls (3/4 view blocks). */
export const WALL_LIKE = new Set([CELL.WALL, CELL.WINDOW]);
/** Exterior cells (no room). */
export const EXTERIOR = new Set([CELL.PAVEMENT, CELL.GRASS, CELL.TREE, CELL.HEDGE, CELL.FENCE, CELL.ENTRANCE, CELL.WATER, CELL.SANDX]);

const isRoomLetter = (c) => c >= 'A' && c <= 'Z' && !CHAR_TO_CELL[c];
const isDoorLetter = (c) => c >= 'a' && c <= 'z' && !CHAR_TO_CELL[c];

export class LevelMap {
  constructor(def) {
    this.def = def;
    this.h = def.map.length;
    this.w = Math.max(...def.map.map((r) => r.length));
    const n = this.w * this.h;
    this.cell = new Uint8Array(n);
    /** room index of floor/door cells, -1 otherwise */
    this.roomIdx = new Int8Array(n).fill(-1);
    /** 1 if the door cell is still locked */
    this.locked = new Uint8Array(n);
    /** number of furniture pieces blocking this tile */
    this.furniture = new Uint8Array(n);
    this.roomIds = Object.keys(def.rooms);
    this.rooms = this.roomIds.map((id, i) => ({
      id, index: i, def: def.rooms[id], name: def.rooms[id].name,
      cells: [], doorCells: [], minX: 1e9, minY: 1e9, maxX: -1, maxY: -1,
    }));
    this.roomById = Object.fromEntries(this.rooms.map((r) => [r.id, r]));

    for (let y = 0; y < this.h; y++) {
      const row = def.map[y];
      for (let x = 0; x < this.w; x++) {
        const ch = row[x] ?? ' ';
        const i = y * this.w + x;
        if (isRoomLetter(ch)) {
          const room = this.roomById[ch];
          if (!room) throw new Error(`Level ${def.id}: map uses room '${ch}' which is not defined in rooms`);
          this.cell[i] = CELL.FLOOR;
          this.roomIdx[i] = room.index;
          room.cells.push(i);
          room.minX = Math.min(room.minX, x); room.maxX = Math.max(room.maxX, x);
          room.minY = Math.min(room.minY, y); room.maxY = Math.max(room.maxY, y);
        } else if (isDoorLetter(ch)) {
          const room = this.roomById[ch.toUpperCase()];
          if (!room) throw new Error(`Level ${def.id}: door '${ch}' leads to undefined room`);
          this.cell[i] = CELL.DOOR;
          this.roomIdx[i] = room.index;
          room.doorCells.push(i);
          this.locked[i] = 1;
        } else {
          const c = CHAR_TO_CELL[ch];
          if (c === undefined) throw new Error(`Level ${def.id}: unknown map char '${ch}' at ${x},${y}`);
          this.cell[i] = c;
        }
      }
    }
    for (const r of this.rooms) {
      r.cx = (r.minX + r.maxX + 1) / 2;
      r.cy = (r.minY + r.maxY + 1) / 2;
      r.padPos = this.computeRoomPad(r);
    }
    this.version = 0; // bumped whenever solidity changes (paths must be recomputed)
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  cellAt(x, y) { return this.inBounds(x, y) ? this.cell[this.idx(x, y)] : CELL.VOID; }

  /** Room object at tile coords, or null for exterior / walls. */
  roomAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    const ri = this.roomIdx[this.idx(x, y)];
    return ri >= 0 ? this.rooms[ri] : null;
  }

  /** Room containing a world point (floor cells only, doors excluded). */
  roomAtWorld(wx, wy) {
    const x = Math.floor(wx), y = Math.floor(wy);
    if (!this.inBounds(x, y)) return null;
    const i = this.idx(x, y);
    if (this.cell[i] !== CELL.FLOOR) return null;
    return this.rooms[this.roomIdx[i]];
  }

  isSolid(x, y) {
    if (!this.inBounds(x, y)) return true;
    const i = this.idx(x, y);
    const c = this.cell[i];
    if (STATIC_SOLID.has(c)) return true;
    if (c === CELL.DOOR && this.locked[i]) return true;
    if (c === CELL.FLOOR && !this.rooms[this.roomIdx[i]].unlocked) return true;
    return this.furniture[i] > 0;
  }

  isFree(x, y) { return !this.isSolid(x, y); }

  /** Tile is free of walls/furniture and belongs to an unlocked area. */
  isFreeFloor(x, y) {
    if (this.isSolid(x, y)) return false;
    const c = this.cellAt(x, y);
    return c === CELL.FLOOR;
  }

  setRoomUnlocked(room, unlocked) {
    room.unlocked = unlocked;
    for (const i of room.doorCells) this.locked[i] = unlocked ? 0 : 1;
    this.version++;
  }

  addFurniture(tiles, delta) {
    for (const [x, y] of tiles) {
      if (!this.inBounds(x, y)) continue;
      const i = this.idx(x, y);
      this.furniture[i] = Math.max(0, this.furniture[i] + delta);
    }
    this.version++;
  }

  /** Default position of the unlock pad of a room: in front of its door, on the open side. */
  computeRoomPad(room) {
    if (room.def.pad) return { x: room.def.pad[0] + 0.5, y: room.def.pad[1] + 0.5 };
    if (room.doorCells.length === 0) return null;
    const sorted = [...room.doorCells].sort((a, b) => a - b);
    const di = sorted[Math.floor(sorted.length / 2)];
    const dx = di % this.w, dy = (di / this.w) | 0;
    for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = dx + ox, ny = dy + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.idx(nx, ny);
      const c = this.cell[ni];
      const other = this.roomIdx[ni];
      if ((c === CELL.FLOOR && other !== room.index) || c === CELL.PAVEMENT || c === CELL.GRASS || c === CELL.ENTRANCE) {
        return { x: nx + 0.5, y: ny + 0.5 };
      }
    }
    return { x: dx + 0.5, y: dy + 0.5 };
  }

  /** Push a circle (world coords) out of solid tiles. Returns corrected {x,y}. */
  resolveCircle(x, y, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
      const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.isSolid(tx, ty)) continue;
          const cx = Math.max(tx, Math.min(x, tx + 1));
          const cy = Math.max(ty, Math.min(y, ty + 1));
          let dx = x - cx, dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 < 1e-9) {
            // center inside the tile: push toward the nearest side that leads to a free tile
            const opts = [
              [tx - r - 1e-3, y, x - tx, tx - 1, ty], [tx + 1 + r + 1e-3, y, tx + 1 - x, tx + 1, ty],
              [x, ty - r - 1e-3, y - ty, tx, ty - 1], [x, ty + 1 + r + 1e-3, ty + 1 - y, tx, ty + 1],
            ].sort((a, b) => a[2] - b[2]);
            const o = opts.find((op) => !this.isSolid(op[3], op[4]));
            if (!o) {
              const t = this.nearestFreeTile(x, y);
              if (t) { x = t.x + 0.5; y = t.y + 0.5; }
              return { x, y };
            }
            x = o[0]; y = o[1];
          } else {
            const d = Math.sqrt(d2);
            const push = r - d + 1e-4;
            x += (dx / d) * push; y += (dy / d) * push;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, y };
  }

  /** Move a circle by (dx,dy) with sliding collisions. */
  moveCircle(x, y, dx, dy, r) {
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / 0.15));
    for (let s = 0; s < steps; s++) {
      const p = this.resolveCircle(x + dx / steps, y + dy / steps, r);
      x = p.x; y = p.y;
    }
    return { x, y };
  }

  /** Closest free tile to (x,y) (BFS), used to rescue stuck agents and place items. */
  nearestFreeTile(x, y, pred = (tx, ty) => this.isFree(tx, ty)) {
    const sx = Math.floor(x), sy = Math.floor(y);
    if (pred(sx, sy)) return { x: sx, y: sy };
    const seen = new Set([sx + ',' + sy]);
    const q = [[sx, sy]];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = cx + ox, ny = cy + oy;
        const k = nx + ',' + ny;
        if (seen.has(k) || !this.inBounds(nx, ny)) continue;
        seen.add(k);
        if (pred(nx, ny)) return { x: nx, y: ny };
        if (seen.size > 2000) return null;
        q.push([nx, ny]);
      }
    }
    return null;
  }
}
