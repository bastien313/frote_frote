// Unit tests for core systems: formatting, RLE, save model, game save/load, bot smoke test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney, fmtDuration } from '../src/util/math.js';
import { rleEncode, rleDecode } from '../src/game/dirt.js';
import { newSave, migrate, checkAchievements, buyTalent } from '../src/game/save.js';
import { Game } from '../src/game/game.js';
import { LEVELS } from '../src/data/levels/index.js';
import { findPath } from '../src/util/path.js';
import { Bot } from '../tools/sim.mjs';
import { Customer } from '../src/game/agents.js';

test('fmtMoney', () => {
  assert.equal(fmtMoney(0), '0');
  assert.equal(fmtMoney(950.7), '950');
  assert.equal(fmtMoney(1234), '1 234');
  assert.equal(fmtMoney(12345), '12,3K');
  assert.equal(fmtMoney(4560000), '4,56M');
  assert.equal(fmtMoney(1e9), '1B');
  assert.equal(fmtDuration(65), '1m 05s');
});

test('RLE roundtrip', () => {
  const a = new Uint8Array(5000);
  for (let i = 0; i < a.length; i++) a[i] = i % 700 < 300 ? 0 : (i * 7) & 255;
  const b = rleDecode(rleEncode(a), a.length);
  assert.deepEqual(Array.from(b), Array.from(a));
});

test('migrate fills missing fields and keeps data', () => {
  const s = migrate({ meta: { stars: 3, talents: { t_bag: 1 } }, levels: { snack: { money: 5 } } });
  assert.equal(s.meta.stars, 3);
  assert.equal(s.meta.talents.t_bag, 1);
  assert.ok(s.meta.settings && s.meta.cosmetics.unlocked.includes('hat_cap'));
  assert.equal(s.levels.snack.money, 5);
  assert.deepEqual(Object.keys(migrate(null)), Object.keys(newSave()));
});

test('achievements give stars once', () => {
  const s = newSave();
  s.meta.stats.trash = 150;
  const done = checkAchievements(s.meta);
  assert.ok(done.some((a) => a.id === 'trash_100'));
  const stars = s.meta.stars;
  assert.equal(checkAchievements(s.meta).length, 0);
  assert.equal(s.meta.stars, stars);
  assert.ok(buyTalent(s.meta, 't_bag'));
  assert.equal(s.meta.talents.t_bag, 1);
});

test('pathfinding finds a route around walls', () => {
  const grid = ['.....', '.###.', '...#.', '.#...'];
  const free = (x, y) => grid[y] && grid[y][x] === '.';
  const p = findPath(5, 4, free, 0, 0, 2, 2);
  assert.ok(p && p.length > 0);
  assert.deepEqual(p[p.length - 1], { x: 2, y: 2 });
});

test('game state survives a save/load roundtrip', () => {
  const meta = newSave().meta;
  const g = new Game(LEVELS[0], 0, meta, null);
  g.state.money = 1234.5;
  g.state.upgrades.bag = 3;
  g.dirt.clean(8.5, 12.5, 1, 5, 4, 1, () => true);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = new Game(LEVELS[0], 0, meta, s);
  assert.equal(g2.state.money, 1234.5);
  assert.equal(g2.state.upgrades.bag, 3);
  assert.equal(g2.trash.length, g.trash.length);
  assert.ok(Math.abs(g2.dirt.roomNow[0] - g.dirt.roomNow[0]) / g.dirt.roomNow[0] < 0.02, 'dirt amount preserved');
});

test('bot cleans the first room and buys the counter quickly (level 1)', () => {
  const g = new Game(LEVELS[0], 0, newSave().meta, null);
  const bot = new Bot(g);
  for (let t = 0; t < 6 * 60 && !g.entityById.counter1.built; t += 0.05) { bot.update(0.05); g.update(0.05); }
  assert.ok(g.map.roomById.A.cleaned, 'room A should be cleaned within 6 minutes');
  assert.ok(g.entityById.counter1.built, 'counter should be bought');
});

test('save export code roundtrip (with accents and emoji)', async () => {
  const { exportCode, importCode } = await import('../src/engine/storage.js');
  const s = newSave();
  s.meta.cosmetics.hat = 'hat_crown';
  s.levels.snack = { money: 42, note: 'Crêperie ☕' };
  const code = exportCode(s);
  assert.ok(code.startsWith('FF1:'));
  assert.deepEqual(importCode(code), JSON.parse(JSON.stringify(s)));
  assert.throws(() => importCode('nope'));
});

test('emote bubble scale stays in range and the player emote expires', () => {
  // regression: an angry customer leaving the queue (2.5 s emote) gave a negative
  // bubble radius, the canvas threw and the main loop stopped (game frozen)
  const g = new Game(LEVELS[0], 0, newSave().meta, null);
  const counter = g.counters[0];
  const cu = new Customer(8, 12, counter, 2, { x: 0.5, y: 16.5 });
  counter.queue.push(cu);
  g.customers.push(cu);
  g.customerGivesUp(cu);
  g.player.setEmote('🎒', 1.2);
  for (const a of [cu, g.player]) {
    const s = a.emoteScale();
    assert.ok(s >= 0.3 && s <= 1, `scale ${s}`);
  }
  for (let i = 0; i < 40; i++) g.update(0.1);
  assert.ok(g.player.emoteT <= 0, 'player emote should disappear');
});
