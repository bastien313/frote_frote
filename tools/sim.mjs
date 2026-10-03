#!/usr/bin/env node
// Headless balancing simulator: a simple bot plays a location with the real
// game logic (no rendering) and reports how long each milestone takes.
//
//   node tools/sim.mjs [levelIndex|all] [--minutes=90] [--verbose]
//
// The bot is an efficient player; humans typically need 1.3x - 2x longer.
// See docs/BALANCING.md.

import { Game } from '../src/game/game.js';
import { LEVELS } from '../src/data/levels/index.js';
import { findPath, smoothPath } from '../src/util/path.js';
import { UPGRADES } from '../src/data/upgrades.js';
import { fmtMoney, fmtDuration } from '../src/util/math.js';
import { newMeta } from '../src/game/save.js';

// Node has no atob/btoa before v16 in some contexts; they exist in Node 18+.
const args = process.argv.slice(2);
const levelArg = args.find((a) => !a.startsWith('--')) ?? '0';
const maxMin = parseFloat((args.find((a) => a.startsWith('--minutes=')) || '--minutes=120').split('=')[1]);
const verbose = args.includes('--verbose');
const talentsArg = (args.find((a) => a.startsWith('--talents=')) || '').split('=')[1];

export class Bot {
  constructor(game) {
    this.g = game;
    this.path = null;
    this.goal = null;
    this.repathT = 0;
    this.stayT = 0;
    this.mode = '';
  }

  isFree = (x, y) => this.g.map.isFree(x, y);

  steer(tx, ty, dt, tol = 0.3) {
    const p = this.g.player;
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d < tol) { this.g.input.x = 0; this.g.input.y = 0; return true; }
    this.repathT -= dt;
    if (!this.path || !this.goal || this.goal.x !== tx || this.goal.y !== ty || this.repathT <= 0) {
      const tiles = findPath(this.g.map.w, this.g.map.h, this.isFree, Math.floor(p.x), Math.floor(p.y), Math.floor(tx), Math.floor(ty));
      this.path = tiles ? smoothPath(this.isFree, p.x, p.y, tiles, tx, ty) : [{ x: tx, y: ty }];
      this.goal = { x: tx, y: ty };
      this.repathT = 0.7;
    }
    let wp = this.path[0] || { x: tx, y: ty };
    while (this.path.length > 1 && Math.hypot(wp.x - p.x, wp.y - p.y) < 0.2) { this.path.shift(); wp = this.path[0]; }
    const dx = wp.x - p.x, dy = wp.y - p.y, dd = Math.hypot(dx, dy) || 1;
    const slow = d < 0.6 ? Math.max(0.3, d / 0.6) : 1;
    this.g.input.x = (dx / dd) * slow; this.g.input.y = (dy / dd) * slow;
    return false;
  }

  buyUpgrades() {
    const g = this.g;
    const prio = ['tool', 'bag', 'speed', 'price', 'tray', 'cook', 'ads', 'scrub', 'staffSpeed', 'staffCap'];
    for (const k of prio) {
      const inf = g.upgradeInfo(k);
      if (inf.cost === null) continue;
      if (UPGRADES[k].needsStaff && g.staff.length === 0) continue;
      // keep money for pads: only buy cheap upgrades, or the tool when blocked
      const blocked = k === 'tool' && this.blockedTool;
      const cheapest = g.pads.length ? Math.min(...g.pads.map((pd) => pd.cost - g.padPaid(pd))) : Infinity;
      if (g.state.money >= inf.cost && (blocked || inf.cost < g.state.money * 0.35 || (g.pads.length === 0 && inf.cost <= g.state.money) || inf.cost < cheapest * 0.3)) {
        if (g.buyUpgrade(k)) { if (k === 'tool') this.blockedTool = false; return k; }
      }
    }
    return null;
  }

  dirtyRooms() { return this.g.map.rooms.filter((r) => r.unlocked && !r.cleaned); }

  update(dt) {
    const g = this.g, p = g.player;
    const st = g.stats;
    if (this.stayT > 0) { this.stayT -= dt; g.input.x = g.input.y = 0; return; }
    const bagFull = p.bag.length >= st.bagCap;
    const dirty = this.dirtyRooms();
    // 1. empty bag
    if (bagFull || (p.bag.length > 0 && this.mode === 'bin')) {
      this.mode = 'bin';
      const b = g.bins.find((x) => x.built);
      if (this.steer(b.access.x, b.access.y, dt, 0.25)) { if (p.bag.length === 0) this.mode = ''; }
      return;
    }
    // 2. buy affordable pads
    let pad = null;
    for (const pd of g.pads) {
      const rem = pd.cost - g.padPaid(pd);
      if (g.state.money >= rem && (!pad || rem < pad.rem)) pad = { pd, rem };
    }
    if (pad) { this.mode = 'pad'; this.steer(pad.pd.x, pad.pd.y, dt, 0.15); return; }
    // 3. cleaning
    if (dirty.length) {
      const allowed = (r) => dirty.includes(r);
      const t = g.nearestTrash(p.x, p.y, allowed);
      if (t) { this.mode = 'trash'; this.steer(t.x, t.y, dt, 0.25); return; }
      for (const r of dirty) {
        const j = g.nearestJunk(p.x, p.y, r);
        if (j) { this.mode = 'junk'; this.steer(j.x, j.y, dt, 0.5); return; }
      }
      const tier = st.toolTier;
      const canClean = (ri) => dirty.some((r) => r.index === ri);
      const tile = g.dirt.nearestDirtyTile(p.x, p.y, canClean, 0.3);
      if (tile) {
        // is this dirt cleanable with the current tool?
        const dt0 = g.dirt.type[(Math.floor(tile.y) * g.dirt.res + 4) * g.dirt.w + Math.floor(tile.x) * g.dirt.res + 4];
        if (dt0 && this.g.dirt && tier < (globalThis.__DIRT_TYPES[dt0]?.tier || 1)) this.blockedTool = true;
        if (!this.blockedTool) {
          this.mode = 'scrub';
          if (this.steer(tile.x, tile.y, dt, 0.15)) this.stayT = 0.25;
          return;
        }
      }
    }
    if (p.bag.length > 0 && (!dirty.length || this.blockedTool) && p.bag.length > st.bagCap * 0.5) { this.mode = 'bin'; return; }
    this.buyUpgrades();
    // 4. business loop
    const counter = g.counters.find((c) => c.built);
    if (!counter) { this.mode = 'idle'; g.input.x = g.input.y = 0; return; }
    if (counter.cash > 20 * g.def.economy.costScale || (counter.cash > 0 && this.mode === 'cash')) {
      this.mode = 'cash';
      if (this.steer(counter.cashPos.x, counter.cashPos.y - 0.9, dt, 0.4)) this.mode = '';
      return;
    }
    const seat = g.nearestDirtySeat(p.x, p.y);
    const cleanerCount = g.staff.filter((s) => s.role === 'cleaner').length;
    if (seat && cleanerCount === 0 && p.bag.length < st.bagCap - 2) { this.mode = 'table'; this.steer(seat.x, seat.y, dt, 0.2); return; }
    const hasCashier = g.staff.some((s) => s.role === 'cashier' && s.post === counter);
    const servers = g.staff.filter((s) => s.role === 'server').length;
    if (p.food > 0) { this.mode = 'deliver'; this.steer(counter.service.x, counter.service.y, dt, 0.2); return; }
    if (!hasCashier && counter.queue.length > 0 && counter.stock > 0) { this.mode = 'serve'; this.steer(counter.service.x, counter.service.y, dt, 0.2); return; }
    if (servers < 2 || counter.stock < 4) {
      const stn = g.stations.filter((s) => s.built).sort((a, b) => b.stock - a.stock)[0];
      if (stn && stn.stock > 0) { this.mode = 'fetch'; this.steer(stn.pickup.x, stn.pickup.y, dt, 0.2); return; }
    }
    if (!hasCashier) { this.mode = 'serve'; this.steer(counter.service.x, counter.service.y, dt, 0.2); return; }
    if (counter.cash > 0) { this.mode = 'cash'; return; }
    g.input.x = g.input.y = 0;
  }
}

import { DIRT_TYPES } from '../src/data/catalog.js';
globalThis.__DIRT_TYPES = DIRT_TYPES;

export function run(index) {
  const def = LEVELS[index];
  const meta = newMeta();
  if (talentsArg) for (const kv of talentsArg.split(',')) { const [k, v] = kv.split(':'); meta.talents[k] = +v; }
  const g = new Game(def, index, meta, null);
  const bot = new Bot(g);
  const log = [];
  const t0 = Date.now();
  const mark = (txt) => { log.push(`${fmtDuration(g.time).padStart(8)}  ${txt}`); if (verbose) console.log(log[log.length - 1]); };
  g.on('roomCleaned', (r) => mark(`🧽 pièce propre : ${r.name}`));
  g.on('roomUnlocked', (r) => mark(`🔓 pièce ouverte : ${r.name}`));
  g.on('built', (e) => mark(`🔨 ${e.label} (${fmtMoney(e.cost)})  argent=${fmtMoney(g.state.money)}`));
  g.on('star', (i) => mark(`⭐ étoile ${i + 1}`));
  let lastUp = {};
  const dt = 1 / 20;
  let completeAt = null;
  const maxT = maxMin * 60;
  let stuckT = 0, lastProgress = 0;
  while (g.time < maxT) {
    bot.update(dt);
    g.update(dt);
    const traceFrom = parseFloat((args.find((a) => a.startsWith('--trace=')) || '--trace=0').split('=')[1]) * 60;
    if (args.some((a) => a.startsWith('--trace')) && g.time >= traceFrom && Math.floor(g.time * 20) % 200 === 0) {
      const states = {};
      for (const c of g.customers) states[c.state] = (states[c.state] || 0) + 1;
      console.log('   customers', JSON.stringify(states), 'counters', g.counters.map((c) => `${c.id}:b${+c.built} q${c.queue.length} s${c.stock} cash${c.cash.toFixed(0)} by=${c.servedBy ? (c.servedBy.role || 'P') : '-'}`).join(' '), 'stations', g.stations.filter((x) => x.built).map((x) => x.stock).join(','), 'staff', g.staff.map((x) => x.role[0] + ':' + (x.task?.type || '') + '@' + x.x.toFixed(1) + ',' + x.y.toFixed(1)).join(' '), 'rating', g.state.rating.toFixed(2), 'lost', g.state.lost.toFixed(1));
      const p = g.player;
      console.log(`t=${g.time.toFixed(0)} mode=${bot.mode} pos=${p.x.toFixed(1)},${p.y.toFixed(1)} in=${g.input.x.toFixed(2)},${g.input.y.toFixed(2)} bag=${p.bag.length} food=${p.food} $=${g.state.money.toFixed(0)} pads=${g.pads.map((x) => x.label).join('|')}`);
    }
    for (const k of Object.keys(UPGRADES)) {
      const l = g.state.upgrades[k] || 0;
      if (l !== (lastUp[k] || 0)) { if (verbose) mark(`⬆️ ${k} → ${l}`); lastUp[k] = l; }
    }
    if (g.state.completed && completeAt === null) completeAt = g.time;
    if (completeAt !== null && g.state.stars[2]) break;
    const prog = g.completionRatio;
    if (prog > lastProgress) { lastProgress = prog; stuckT = 0; } else stuckT += dt;
    if (stuckT > 20 * 60) { mark('⚠️ aucun progrès depuis 20 min, arrêt'); break; }
  }
  const s = g.state;
  console.log(`\n=== ${index + 1}. ${def.name} ===`);
  if (!verbose) console.log(log.join('\n'));
  console.log(`Terminé (tout construit) : ${completeAt !== null ? fmtDuration(completeAt) : 'NON (' + Math.round(g.completionRatio * 100) + ' %)'}`);
  console.log(`Temps simulé : ${fmtDuration(g.time)}  · clients servis : ${s.served}  · gagné : ${fmtMoney(s.earned)}  · note : ${s.rating.toFixed(2)}`);
  console.log(`Upgrades : ${JSON.stringify(s.upgrades)}  · personnel : ${g.staff.length}  · calcul : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return completeAt;
}

const isMain = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isMain) {
  const which = levelArg === 'all' ? LEVELS.map((_, i) => i) : [parseInt(levelArg, 10)];
  let total = 0;
  for (const i of which) total += run(i) || 0;
  if (which.length > 1) console.log(`\nTOTAL (bot) : ${fmtDuration(total)}`);
}
