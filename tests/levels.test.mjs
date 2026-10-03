// Validates every level definition: map parsing, entity placement, reachability.
// Run with `npm test` (node --test). Keep this green when editing levels!

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/data/levels/index.js';
import { LevelMap, CELL } from '../src/game/level.js';
import { createEntity } from '../src/game/entities.js';
import { DIRT_TYPES, TRASH_KINDS, JUNK_KINDS, FLOORS, DECOR_KINDS, ROLES } from '../src/data/catalog.js';
import { Game } from '../src/game/game.js';
import { newMeta } from '../src/game/save.js';

function reachableSet(map, sx, sy) {
  const seen = new Uint8Array(map.w * map.h);
  const q = [[Math.floor(sx), Math.floor(sy)]];
  seen[map.idx(q[0][0], q[0][1])] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!map.inBounds(nx, ny) || map.isSolid(nx, ny)) continue;
      const i = map.idx(nx, ny);
      if (seen[i]) continue;
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return (x, y) => map.inBounds(Math.floor(x), Math.floor(y)) && seen[map.idx(Math.floor(x), Math.floor(y))] === 1;
}

for (const [li, def] of LEVELS.entries()) {
  test(`level ${li + 1} (${def.id}) is valid`, () => {
    // ---- basic fields
    for (const k of ['id', 'name', 'intro', 'icon', 'product', 'station', 'theme', 'economy', 'start', 'spawns', 'map', 'rooms', 'entities']) {
      assert.ok(def[k] !== undefined, `missing field ${k}`);
    }
    const width = def.map[0].length;
    def.map.forEach((row, y) => assert.equal(row.length, width, `row ${y} has length ${row.length}, expected ${width}`));
    const map = new LevelMap(def);
    // ---- rooms
    for (const r of map.rooms) {
      assert.ok(r.cells.length > 0, `room ${r.id} has no floor cells`);
      assert.ok(FLOORS[r.def.floor], `room ${r.id} floor '${r.def.floor}' unknown`);
      if (r.def.cost) assert.ok(r.doorCells.length > 0, `room ${r.id} costs money but has no door`);
      for (const L of r.def.dirt || []) assert.ok(DIRT_TYPES.some((d) => d && d.id === L.type), `room ${r.id}: unknown dirt ${L.type}`);
      for (const k of Object.keys(r.def.trash?.kinds || {})) assert.ok(TRASH_KINDS[k], `room ${r.id}: unknown trash ${k}`);
      for (const j of r.def.junk || []) assert.ok(JUNK_KINDS[j], `room ${r.id}: unknown junk ${j}`);
      assert.ok(r.padPos || !r.def.cost, `room ${r.id} has no pad position`);
    }
    assert.ok(map.rooms.some((r) => !r.def.cost), 'needs at least one free starting room');
    // ---- entities
    const ids = new Set();
    const ents = def.entities.map((d) => {
      assert.ok(!ids.has(d.id), `duplicate entity id ${d.id}`);
      ids.add(d.id);
      return createEntity(d, def);
    });
    const occupied = new Map();
    for (const e of ents) {
      for (const a of e.after) assert.ok(ids.has(a) || map.roomById[a], `${e.id}: unknown dependency ${a}`);
      if (e.type === 'decor') assert.ok(DECOR_KINDS[e.def.kind], `${e.id}: unknown decor ${e.def.kind}`);
      if (e.type === 'hire') {
        assert.ok(ROLES[e.role], `${e.id}: unknown role`);
        if (e.role === 'cashier') assert.ok(e.def.post && ents.find((x) => x.id === e.def.post && x.type === 'counter'), `${e.id}: cashier needs a valid post counter`);
      }
      const tilesToCheck = e.tiles.length ? e.tiles : [[Math.floor(e.pad.x), Math.floor(e.pad.y)]];
      for (const [x, y] of tilesToCheck) {
        assert.ok(map.inBounds(x, y), `${e.id} out of bounds`);
        const c = map.cellAt(x, y);
        assert.ok(c === CELL.FLOOR || c === CELL.PAVEMENT || c === CELL.GRASS, `${e.id} at ${x},${y} is not on floor (cell ${c})`);
        const k = x + ',' + y;
        if (e.tiles.length) {
          assert.ok(!occupied.has(k), `${e.id} overlaps ${occupied.get(k)} at ${k}`);
          occupied.set(k, e.id);
        }
      }
    }
    // pads / interaction points must not sit on another entity's footprint
    const points = [];
    for (const e of ents) {
      points.push([e.id + ' pad', e.pad.x, e.pad.y, e.tiles.length === 0]);
      if (e.type === 'counter') {
        points.push([e.id + ' service', e.service.x, e.service.y, true], [e.id + ' drop', e.dropPos.x, e.dropPos.y, true]);
        for (let i = 0; i < e.queueLen; i++) { const s = e.queueSlot(i); points.push([e.id + ' queue' + i, s.x, s.y, true]); }
      }
      if (e.type === 'station') points.push([e.id + ' pickup', e.pickup.x, e.pickup.y, true]);
      if (e.type === 'table') e.seats.forEach((s, i) => points.push([e.id + ' seat' + i, s.x, s.y, true]));
    }
    const spots = new Map();
    for (const [name, x, y, mustBeFree] of points) {
      if (!mustBeFree) continue;
      const k = Math.floor(x) + ',' + Math.floor(y);
      assert.ok(!occupied.has(k), `${name} (${k}) is blocked by ${occupied.get(k)}`);
      // seats and queue slots must not share a tile with another interaction spot
      if (/seat|queue/.test(name)) {
        assert.ok(!spots.has(k), `${name} shares tile ${k} with ${spots.get(k)}`);
      }
      if (!/ pad$/.test(name)) {
        if (spots.has(k) && /seat|queue/.test(spots.get(k))) assert.fail(`${name} shares tile ${k} with ${spots.get(k)}`);
        if (!spots.has(k)) spots.set(k, name);
      }
    }
    for (const r of map.rooms) {
      if (!r.padPos) continue;
      const k = Math.floor(r.padPos.x) + ',' + Math.floor(r.padPos.y);
      assert.ok(!occupied.has(k), `room ${r.id} pad (${k}) is blocked by ${occupied.get(k)}`);
      for (const e of ents) {
        if (Math.floor(e.pad.x) + ',' + Math.floor(e.pad.y) === k) assert.fail(`room ${r.id} pad overlaps pad of ${e.id}`);
      }
    }
    // ---- reachability with everything unlocked and built
    for (const r of map.rooms) map.setRoomUnlocked(r, true);
    for (const e of ents) map.addFurniture(e.tiles, 1);
    const sp = def.spawns[0];
    assert.ok(!map.isSolid(Math.floor(sp[0]), Math.floor(sp[1])), 'spawn is solid');
    const reach = reachableSet(map, sp[0], sp[1]);
    for (const s of def.spawns) assert.ok(reach(s[0], s[1]), `spawn ${s} not reachable from first spawn`);
    assert.ok(reach(def.start[0], def.start[1]), 'player start not reachable from spawn');
    for (const [name, x, y, mustBeFree] of points) {
      if (!mustBeFree) continue;
      assert.ok(reach(x, y), `${name} (${x},${y}) is not reachable when everything is built`);
    }
    for (const e of ents.filter((x) => x.type === 'bin')) {
      const ok = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => reach(e.x + dx + 0.5, e.y + dy + 0.5));
      assert.ok(ok, `${e.id} has no reachable side`);
    }
    // every floor cell of every room reachable (no sealed pockets)
    for (const r of map.rooms) {
      const unreachable = r.cells.filter((i) => map.furniture[i] === 0 && !reach((i % map.w) + 0.5, Math.floor(i / map.w) + 0.5));
      assert.equal(unreachable.length, 0, `room ${r.id} has ${unreachable.length} unreachable free cells, e.g. ${unreachable.slice(0, 3).map((i) => `${i % map.w},${Math.floor(i / map.w)}`)}`);
    }
    // ---- game can be instantiated and serialized
    const g = new Game(def, li, newMeta(), null);
    const s = g.serialize();
    const g2 = new Game(def, li, newMeta(), JSON.parse(JSON.stringify(s)));
    assert.equal(g2.trash.length, g.trash.length);
    assert.ok(g.counters.length > 0 && g.stations.length > 0 && g.tables.length > 0 && g.bins.length > 0, 'level needs counter, station, table and bin');
    assert.ok(ents.some((e) => e.def.final), 'level should flag one entity as final (the last purchase)');
  });
}
