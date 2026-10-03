#!/usr/bin/env node
// Print a level map with its entities overlaid, to help designing levels.
//   node tools/print-map.mjs <levelIndex>
// Legend: K counter, q queue, k service spot, G station, g pickup, T table, s seat,
//         B bin, d decor, H hire pad, P room pad, @ start, S spawn

import { LEVELS } from '../src/data/levels/index.js';
import { LevelMap } from '../src/game/level.js';
import { createEntity } from '../src/game/entities.js';

const i = parseInt(process.argv[2] || '0', 10);
const def = LEVELS[i];
const map = new LevelMap(def);
const grid = def.map.map((r) => r.split(''));
const put = (x, y, ch) => { x = Math.floor(x); y = Math.floor(y); if (grid[y] && grid[y][x] !== undefined) grid[y][x] = ch; };
for (const d of def.entities) {
  const e = createEntity(d, def);
  if (e.type === 'counter') {
    for (let k = 0; k < e.queueLen; k++) { const s = e.queueSlot(k); put(s.x, s.y, 'q'); }
    put(e.service.x, e.service.y, 'k');
    for (const [x, y] of e.tiles) put(x, y, 'K');
  } else if (e.type === 'station') { put(e.pickup.x, e.pickup.y, 'g'); put(e.x, e.y, 'G'); }
  else if (e.type === 'table') { for (const s of e.seats) put(s.x, s.y, 's'); put(e.x, e.y, 'T'); }
  else if (e.type === 'bin') put(e.x, e.y, 'B');
  else if (e.type === 'decor') put(e.x, e.y, 'd');
  else if (e.type === 'hire') put(e.x, e.y, 'H');
}
for (const r of map.rooms) if (r.padPos) put(r.padPos.x, r.padPos.y, 'P');
put(def.start[0], def.start[1], '@');
for (const s of def.spawns) put(s[0], s[1], 'S');
console.log(`${i + 1}. ${def.name}  (${map.w}x${map.h})`);
console.log('    ' + Array.from({ length: map.w }, (_, x) => x % 10).join(''));
grid.forEach((row, y) => console.log(String(y).padStart(3) + ' ' + row.join('')));
console.log('rooms:', map.rooms.map((r) => `${r.id}=${r.name}(${r.cells.length})`).join(' '));
