// The Game: owns one location (level) and runs all gameplay rules.
// It never touches the DOM: it emits events (sfx, toasts, stars...) that the
// app/UI/audio layers listen to, so it can also run headless (tests, sim).

import { LevelMap } from './level.js';
import { DirtLayer } from './dirt.js';
import { createEntity } from './entities.js';
import { Player, Customer, Staff, updateCustomer, updateStaff } from './agents.js';
import { Quests } from './quests.js';
import { computeStats, productPrice, upgradeMax, BASE } from './economy.js';
import { Particles } from '../engine/particles.js';
import { TRASH_KINDS, JUNK_KINDS, DIRT_TYPES, ROLES } from '../data/catalog.js';
import { UPGRADES, upgradeCost } from '../data/upgrades.js';
import { mulberry32, hashString } from '../util/rng.js';
import { dist, dist2, clamp, fmtMoney, weightedPick, pick } from '../util/math.js';
import { talentEffects } from '../data/meta.js';

const TRASH_KEYS = Object.keys(TRASH_KINDS);
const JUNK_KEYS = Object.keys(JUNK_KINDS);
export const ROOM_CLEAN_THRESHOLD = 0.035;

export class Game {
  /**
   * @param {object} def level definition (src/data/levels/*.js)
   * @param {number} index level index
   * @param {object} meta shared meta save (talents, stats, settings)
   * @param {object|null} saved previously serialized level state
   */
  constructor(def, index, meta, saved = null, opts = {}) {
    this.def = def;
    this.index = index;
    this.meta = meta;
    this.opts = opts;
    this.listeners = {};
    this.time = 0;
    this.map = new LevelMap(def);
    this.dirt = new DirtLayer(this.map);
    this.fx = new Particles();
    this.k = def.economy.costScale || 1; // every cost/price in level files is multiplied by this
    this.entities = def.entities.map((d) => createEntity(d, def));
    for (const e of this.entities) e.cost = (e.def.cost || 0) * this.k;
    this.entityById = Object.fromEntries(this.entities.map((e) => [e.id, e]));
    this.counters = this.entities.filter((e) => e.type === 'counter');
    this.stations = this.entities.filter((e) => e.type === 'station');
    this.tables = this.entities.filter((e) => e.type === 'table');
    this.bins = this.entities.filter((e) => e.type === 'bin');
    this.decors = this.entities.filter((e) => e.type === 'decor');
    this.hires = this.entities.filter((e) => e.type === 'hire');
    this.trash = [];
    this.junk = [];
    this.customers = [];
    this.staff = [];
    this.flyers = [];
    this.pads = [];
    this.padOn = null; this.padT = 0; this.padCoinT = 0;
    this.spawnT = 2;
    this.roomT = 0; this.ratingT = 0; this.hintT = 0; this.hintCache = null;
    this.scrubCash = 0; this.scrubCashT = 0; this.scrubTiles = 0;
    this.blockedT = 0;
    this.autoAcc = 0; this.autoT = 0;
    this.input = { x: 0, y: 0 };
    this.nextItemId = 1;
    this.rnd = mulberry32(hashString(def.id) ^ 0x5eed);
    const start = def.start || [this.map.w / 2, this.map.h / 2];
    this.player = new Player(start[0], start[1]);

    this.state = {
      money: 0, earned: 0, upgrades: {}, served: 0, rating: 2.5, lost: 0, autoRate: 0,
      stars: [0, 0, 0], completed: false, playTime: 0,
    };
    for (const r of this.map.rooms) { r.unlocked = false; r.cleaned = false; r.paid = 0; r.reveal = 0; r.cost = (r.def.cost || 0) * this.k; }

    if (saved) this.load(saved); else this.fresh();
    this.stats = computeStats(this);
    this.recomputeRoomTotals();
    this.refreshPads();
    this.quests = new Quests(this, saved?.quest);
    this.updateRating(true);
  }

  // ---------------------------------------------------------------- events
  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, ...args) { const l = this.listeners[evt]; if (l) for (const fn of l) fn(...args); }

  // ---------------------------------------------------------------- setup

  fresh() {
    for (const r of this.map.rooms) if (!r.def.cost) this.map.setRoomUnlocked(r, true);
    this.dirt.generate(this.def);
    for (const e of this.entities) if (e.built) this.applyBuilt(e, true);
    this.generateTrash();
    const startCash = talentEffects.startCash(this.meta.talents.t_start || 0) * this.def.economy.costScale;
    this.state.money = startCash;
  }

  /** Floor cells of a room usable for trash/junk (not under any entity footprint). */
  freeRoomTiles(room) {
    const reserved = new Set();
    for (const e of this.entities) {
      for (const [x, y] of e.tiles) reserved.add(this.map.idx(x, y));
      reserved.add(this.map.idx(Math.floor(e.pad.x), Math.floor(e.pad.y)));
    }
    return room.cells.filter((i) => !reserved.has(i) && this.map.furniture[i] === 0);
  }

  generateTrash() {
    const rnd = mulberry32(hashString(this.def.id + ':trash'));
    for (const room of this.map.rooms) {
      const tiles = this.freeRoomTiles(room);
      if (!tiles.length) continue;
      const tdef = room.def.trash || { count: 0 };
      const kinds = Object.entries(tdef.kinds || { box: 1, paper: 1, can: 1 });
      for (let k = 0; k < (tdef.count || 0); k++) {
        const ti = tiles[Math.floor(rnd() * tiles.length)];
        const x = (ti % this.map.w) + 0.2 + rnd() * 0.6;
        const y = Math.floor(ti / this.map.w) + 0.2 + rnd() * 0.6;
        this.addTrash(x, y, weightedPick(kinds, rnd), rnd() * Math.PI * 2);
      }
      for (const jk of room.def.junk || []) {
        const ti = tiles[Math.floor(rnd() * tiles.length)];
        this.addJunk((ti % this.map.w) + 0.5, Math.floor(ti / this.map.w) + 0.5, jk);
      }
    }
  }

  addTrash(x, y, kind, rot = Math.random() * 6.28) {
    const k = TRASH_KINDS[kind] ? kind : 'paper';
    const item = {
      id: this.nextItemId++, x, y, kind: k, rot,
      value: TRASH_KINDS[k].value * (this.def.economy.trashValue ?? 1) * this.k, gone: false, claimed: null, pop: 0,
    };
    this.trash.push(item);
    return item;
  }

  addJunk(x, y, kind, hp) {
    const k = JUNK_KINDS[kind] ? kind : 'crate';
    const j = { id: this.nextItemId++, x, y, kind: k, hp: hp ?? JUNK_KINDS[k].hp, maxHp: JUNK_KINDS[k].hp, shake: 0, hitT: 0 };
    this.junk.push(j);
    return j;
  }

  load(s) {
    const st = this.state;
    Object.assign(st, {
      money: s.money || 0, earned: s.earned || 0, upgrades: s.upgrades || {}, served: s.served || 0,
      rating: s.rating ?? 2.5, lost: s.lost || 0, autoRate: s.autoRate || 0, stars: s.stars || [0, 0, 0],
      completed: !!s.completed, playTime: s.playTime || 0,
    });
    for (const r of this.map.rooms) {
      const rs = s.rooms?.[r.id];
      const unlocked = rs ? !!rs.u : !r.def.cost;
      if (unlocked) this.map.setRoomUnlocked(r, true);
      r.cleaned = !!rs?.c;
      r.paid = rs?.p || 0;
      r.reveal = 0;
      r.trashInit = rs?.ti;
    }
    if (s.dirt) this.dirt.deserialize(s.dirt); else this.dirt.generate(this.def);
    for (const e of this.entities) {
      const es = s.ents?.[e.id];
      if (es) {
        e.built = !!es.b || !!e.def.built;
        e.paid = es.p || 0;
        e.deserialize(es.s);
      }
      if (e.built) this.applyBuilt(e, true);
    }
    for (const t of s.trash || []) this.addTrash(t[0], t[1], TRASH_KEYS[t[2]] || 'paper', t[3] || 0);
    for (const j of s.junk || []) this.addJunk(j[0], j[1], JUNK_KEYS[j[2]] || 'crate', j[3]);
    if (s.player) {
      const p = this.map.resolveCircle(s.player.x, s.player.y, this.player.r);
      this.player.x = p.x; this.player.y = p.y;
      this.player.bag = (s.player.bag || []).slice();
      this.player.food = s.player.food || 0;
    }
  }

  serialize() {
    const rooms = {};
    for (const r of this.map.rooms) rooms[r.id] = { u: r.unlocked ? 1 : 0, c: r.cleaned ? 1 : 0, p: Math.round(r.paid), ti: r.trashInit };
    const ents = {};
    for (const e of this.entities) ents[e.id] = { b: e.built ? 1 : 0, p: Math.round(e.paid), s: e.serialize() };
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      v: 1, id: this.def.id, t: Date.now(),
      money: r2(this.state.money), earned: r2(this.state.earned), upgrades: { ...this.state.upgrades },
      served: this.state.served, rating: r2(this.state.rating), lost: r2(this.state.lost),
      autoRate: r2(this.state.autoRate), stars: this.state.stars.slice(), completed: this.state.completed,
      playTime: Math.round(this.state.playTime),
      rooms, ents, dirt: this.dirt.serialize(),
      trash: this.trash.filter((t) => !t.gone).map((t) => [r2(t.x), r2(t.y), TRASH_KEYS.indexOf(t.kind), r2(t.rot)]),
      junk: this.junk.map((j) => [r2(j.x), r2(j.y), JUNK_KEYS.indexOf(j.kind), j.hp]),
      player: { x: r2(this.player.x), y: r2(this.player.y), bag: this.player.bag.slice(), food: this.player.food },
      quest: this.quests.serialize(),
    };
  }

  recomputeRoomTotals() {
    for (const r of this.map.rooms) {
      if (r.trashInit === undefined) {
        const t = this.trash.filter((it) => this.map.roomAtWorld(it.x, it.y) === r).length;
        const j = this.junk.filter((it) => this.map.roomAtWorld(it.x, it.y) === r).length;
        r.trashInit = t + j * 3;
      }
      const init = this.dirt.roomInitial[r.index];
      r.rewardRate = init > 0 ? (r.def.reward ?? 20) * this.k / init : 0;
    }
  }

  // ---------------------------------------------------------------- stats & money

  recomputeStats() {
    this.stats = computeStats(this);
    if (this.stats.toolTier >= 3) this.setStat('washer', 1);
  }

  addMoney(v, source) {
    if (v <= 0) return;
    this.state.money += v;
    this.state.earned += v;
    this.addStat('earned', v);
    this.emit('money', v, source);
  }

  addStat(key, n = 1) {
    const s = this.meta.stats;
    s[key] = (s[key] || 0) + n;
  }

  setStat(key, v) {
    if ((this.meta.stats[key] || 0) < v) this.meta.stats[key] = v;
  }

  /** A counter accepts customers if it is the first one, or if a cashier works there. */
  counterOpen(c) {
    if (!c.built) return false;
    if (c === this.counters.find((x) => x.built)) return true;
    return this.staff.some((s) => s.role === 'cashier' && s.post === c);
  }

  counterMax(c) { return BASE.counterStock + (this.state.upgrades.cook || 0) * 2; }

  servedGoal() { return this.def.goals?.served ?? 350 + 200 * this.index; }

  // ---------------------------------------------------------------- building

  applyBuilt(e, silent) {
    e.built = true;
    if (e.tiles.length) {
      this.map.addFurniture(e.tiles, 1);
      this.dirt.clearTiles(e.tiles);
      // move floor items out of the new footprint
      const occupied = new Set(e.tiles.map(([x, y]) => x + ',' + y));
      for (const it of [...this.trash, ...this.junk]) {
        if (occupied.has(Math.floor(it.x) + ',' + Math.floor(it.y))) {
          const t = this.map.nearestFreeTile(it.x, it.y);
          if (t) { it.x = t.x + 0.5; it.y = t.y + 0.5; }
        }
      }
    }
    if (e.tiles.length) {
      // push characters standing inside the new footprint out of it
      const inside = (a) => e.tiles.some(([x, y]) => Math.floor(a.x) === x && Math.floor(a.y) === y);
      for (const a of [this.player, ...this.staff, ...this.customers]) {
        if (!inside(a)) continue;
        const t = this.map.nearestFreeTile(a.x, a.y);
        if (t) { a.x = t.x + 0.5; a.y = t.y + 0.5; a.path = null; }
      }
    }
    if (e.type === 'bin') {
      const room = this.map.roomAt(e.x, e.y);
      let acc = null;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = e.x + dx, y = e.y + dy;
        if (this.map.isFree(x, y) && this.map.roomAt(x, y) === room) { acc = { x: x + 0.5, y: y + 0.5 }; break; }
      }
      if (!acc) {
        const t = this.map.nearestFreeTile(e.cx, e.cy + 1);
        acc = t ? { x: t.x + 0.5, y: t.y + 0.5 } : { x: e.cx, y: e.cy + 1 };
      }
      e.access = acc;
    }
    if (e.type === 'hire') this.spawnStaff(e);
    if (!silent) {
      e.pop = 1;
      this.fx.ring(e.pad.x, e.pad.y, '#ffffff', 1.4);
      this.fx.confetti(e.pad.x, e.pad.y, 26);
      this.emit('sfx', 'build');
      this.emit('haptic', 40);
      this.emit('built', e);
      if (e.type === 'hire') this.addStat('hired', 1);
    }
  }

  spawnStaff(e) {
    const post = e.def.post ? this.entityById[e.def.post] : null;
    const s = new Staff(e.role, e.pad.x, e.pad.y, { x: e.pad.x, y: e.pad.y }, post);
    s.look.shirt = ROLES[e.role].color;
    s.hireId = e.id;
    this.staff.push(s);
  }

  padPaid(pad) { return pad.kind === 'room' ? pad.room.paid : pad.ent.paid; }

  depsMet(after) {
    for (const id of after || []) {
      const e = this.entityById[id];
      if (e) { if (!e.built) return false; continue; }
      const r = this.map.roomById[id];
      if (r) { if (!r.unlocked) return false; continue; }
    }
    return true;
  }

  areaReady(x, y) {
    const room = this.map.roomAt(Math.floor(x), Math.floor(y));
    if (!room) return true;
    return room.unlocked && room.cleaned;
  }

  refreshPads() {
    const pads = [];
    for (const r of this.map.rooms) {
      if (r.unlocked || !r.padPos) continue;
      if (!this.areaReady(r.padPos.x, r.padPos.y) || !this.depsMet(r.def.after)) continue;
      pads.push({ kind: 'room', room: r, x: r.padPos.x, y: r.padPos.y, cost: r.cost, label: 'Ouvrir : ' + r.name, icon: '🔓' });
    }
    for (const e of this.entities) {
      if (e.built) continue;
      if (!this.areaReady(e.x, e.y) || !this.depsMet(e.after)) continue;
      if (e.def.post && !this.entityById[e.def.post]?.built) continue;
      pads.push({ kind: 'entity', ent: e, x: e.pad.x, y: e.pad.y, cost: e.cost, label: e.label, icon: e.icon });
    }
    this.pads = pads;
  }

  completePad(pad) {
    if (pad.kind === 'room') this.unlockRoom(pad.room);
    else this.applyBuilt(pad.ent, false);
    this.padOn = null;
    this.refreshPads();
    this.checkLevelStars();
  }

  unlockRoom(r) {
    this.map.setRoomUnlocked(r, true);
    r.reveal = 1;
    for (const di of r.doorCells) {
      const x = (di % this.map.w) + 0.5, y = Math.floor(di / this.map.w) + 0.5;
      this.fx.burst(x, y, 8, { type: 'plank', color: ['#8b5a2b', '#a0522d', '#6b4423'], size: 0.14, up: 3, speed: 2.5, life: 1 });
      this.fx.dust(x, y, 5);
    }
    this.emit('sfx', 'unlock');
    this.emit('shake', 0.25);
    this.emit('haptic', 60);
    this.emit('roomUnlocked', r);
    this.emit('toast', `🔓 ${r.name} débloquée ! Nettoie-la pour l'aménager.`);
  }

  // ---------------------------------------------------------------- upgrades (menu)

  upgradeInfo(key) {
    const level = this.state.upgrades[key] || 0;
    const max = upgradeMax(this, key);
    const cost = level < max ? upgradeCost(key, level, this.def.economy.costScale) : null;
    return { key, level, max, cost, def: UPGRADES[key] };
  }

  buyUpgrade(key) {
    const info = this.upgradeInfo(key);
    if (info.cost === null || this.state.money < info.cost) return false;
    if (UPGRADES[key].needsStaff && this.staff.length === 0) return false;
    this.state.money -= info.cost;
    this.state.upgrades[key] = info.level + 1;
    this.recomputeStats();
    this.emit('sfx', 'upgrade');
    this.emit('haptic', 30);
    this.quests.onEvent('upgrade', 1);
    this.fx.ring(this.player.x, this.player.y, '#7dfcff', 1.2);
    this.fx.sparkle(this.player.x, this.player.y, 10, 0.5);
    return true;
  }

  // ---------------------------------------------------------------- main update

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.state.playTime += dt;
    this.updatePlayer(dt);
    for (const s of this.staff) {
      updateStaff(this, s, dt);
      this.agentInteract(s, dt);
    }
    for (let i = this.customers.length - 1; i >= 0; i--) updateCustomer(this, this.customers[i], dt);
    this.updateStations(dt);
    this.updateCounters(dt);
    this.updateSpawning(dt);
    this.updateFlyers(dt);
    this.updatePads(dt);
    for (const e of this.entities) if (e.pop > 0) e.pop = Math.max(0, e.pop - dt * 1.8);
    for (const r of this.map.rooms) if (r.reveal > 0) r.reveal = Math.max(0, r.reveal - dt * 0.8);
    for (const t of this.trash) if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 2.2);
    for (const j of this.junk) if (j.shake > 0) j.shake = Math.max(0, j.shake - dt * 4);
    for (const b of this.bins) if (b.lid > 0) b.lid = Math.max(0, b.lid - dt * 2.5);
    for (const st of this.stations) if (st.bump > 0) st.bump = Math.max(0, st.bump - dt * 4);
    this.fx.update(dt);
    this.roomT -= dt;
    if (this.roomT <= 0) { this.roomT = 0.4; this.checkRooms(); }
    this.ratingT -= dt;
    if (this.ratingT <= 0) { this.ratingT = 1; this.updateRating(); this.trackAutoIncome(1); }
    this.quests.update(dt);
    if (this.blockedT > 0) this.blockedT -= dt;
  }

  // ---------------------------------------------------------------- player

  updatePlayer(dt) {
    const p = this.player;
    const st = this.stats;
    let ix = this.input.x, iy = this.input.y;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const tvx = ix * st.speed, tvy = iy * st.speed;
    const k = Math.min(1, dt * 18);
    p.vx += (tvx - p.vx) * k;
    p.vy += (tvy - p.vy) * k;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0.05) {
      const np = this.map.moveCircle(p.x, p.y, p.vx * dt, p.vy * dt, p.r);
      p.x = np.x; p.y = np.y;
      p.moving = sp > 0.3;
      p.walkT += dt * sp * 3.2;
      if (mag > 0.1) p.turnToward(ix, iy, dt);
    } else {
      p.moving = false;
      const np = this.map.resolveCircle(p.x, p.y, p.r);
      p.x = np.x; p.y = np.y;
    }
    if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 5);
    this.playerScrub(dt);
    this.agentInteract(p, dt);
    this.junkSmash(dt);
  }

  playerScrub(dt) {
    const p = this.player;
    const tool = this.stats.tool;
    const tx = p.x + p.face.x * 0.18, ty = p.y + p.face.y * 0.18;
    const res = this.dirt.clean(tx, ty, tool.radius, tool.power * this.stats.scrubMul, tool.tier, dt,
      (ri) => this.map.rooms[ri].unlocked);
    const intensity = res.removed > 0.02 ? Math.min(1, res.removed * 6) : 0;
    p.scrubbing += (intensity - p.scrubbing) * Math.min(1, dt * 10);
    if (res.removed > 0) {
      let cash = 0;
      for (const [ri, v] of res.perRoom) cash += v * this.map.rooms[ri].rewardRate;
      this.scrubCash += cash;
      const tiles = res.removed / (this.dirt.res * this.dirt.res);
      this.scrubTiles += tiles;
      this.addStat('scrubbed', tiles);
      this.quests.onEvent('scrub', tiles);
      this.scrubFx(tx, ty, tool, res);
    }
    this.scrubCashT -= dt;
    if (this.scrubCashT <= 0 && this.scrubCash >= 0.5) {
      this.scrubCashT = 0.45;
      const v = this.scrubCash;
      this.scrubCash = 0;
      this.addMoney(v, 'scrub');
      this.fx.text(p.x, p.y, '+' + fmtMoney(Math.max(1, v)), '#7dff8a', 0.8, 1.0);
    }
    if (res.blocked > 6 && this.blockedT <= 0) {
      this.blockedT = 4;
      const dtp = DIRT_TYPES[res.blockedType];
      this.emit('blockedTool', dtp);
      this.emit('toast', `🧪 ${dtp.name} : ton outil est trop faible ! Améliore-le dans ⬆️`);
      p.setEmote('😣', 1.5);
      this.emit('sfx', 'error');
    }
  }

  scrubFx(x, y, tool, res) {
    const f = this.fx;
    const p = this.player;
    const amt = Math.min(1, res.removed * 3);
    if (tool.fx === 'bubbles') { if (Math.random() < 0.15 + amt * 0.4) f.bubbles(x, y, 1, tool.radius * 0.8); }
    else if (tool.fx === 'water') { if (Math.random() < 0.25) f.bubbles(x, y, 1, tool.radius); if (Math.random() < 0.3) f.spray(x, y, p.face.x, p.face.y, 1, '#9fd9ff'); }
    else if (tool.fx === 'spray') { f.spray(p.x + p.face.x * 0.3, p.y + p.face.y * 0.3, p.face.x, p.face.y, 2, '#b5e6ff'); if (Math.random() < 0.3) f.bubbles(x, y, 1, tool.radius); }
    else { if (Math.random() < 0.5) f.bubbles(x, y, 1, tool.radius); if (Math.random() < 0.3) f.spray(x, y, p.face.x, p.face.y, 1, '#e0f6ff'); }
    if (res.cleared > 2 && Math.random() < 0.35) f.sparkle(x, y, 1, tool.radius);
  }

  /** Cleaner staff scrubbing around itself (only maintained rooms). */
  staffScrub(s, dt) {
    const res = this.dirt.clean(s.x, s.y, 0.5, 1.6 * (this.stats.staffSpeed / BASE.staffSpeed), 4, dt,
      (ri) => this.map.rooms[ri].cleaned);
    if (res.removed > 0 && Math.random() < 0.4) this.fx.bubbles(s.x, s.y, 1, 0.4);
  }

  junkSmash(dt) {
    const p = this.player;
    const tier = this.stats.toolTier;
    for (let i = this.junk.length - 1; i >= 0; i--) {
      const j = this.junk[i];
      const room = this.map.roomAtWorld(j.x, j.y);
      if (room && !room.unlocked) continue;
      const reach = JUNK_KINDS[j.kind].size * 0.5 + 0.45;
      if (dist2(p.x, p.y, j.x, j.y) > reach * reach) { j.hitT = 0; continue; }
      j.hitT += dt;
      const interval = 0.3 / (1 + 0.25 * (tier - 1));
      if (j.hitT >= interval) {
        j.hitT = 0;
        j.hp -= 1;
        j.shake = 1;
        p.squash = 0.6;
        p.turnToward(j.x - p.x, j.y - p.y, 1);
        this.fx.dust(j.x, j.y, 3);
        this.fx.burst(j.x, j.y, 3, { color: ['#8b5a2b', '#666', '#aaa'], size: 0.05, up: 2.5 });
        this.emit('sfx', 'hit', { pitch: 1 + (1 - j.hp / j.maxHp) * 0.5 });
        this.emit('haptic', 12);
        if (j.hp <= 0) this.breakJunk(j, i);
      }
      break; // one junk at a time
    }
  }

  breakJunk(j, i) {
    this.junk.splice(i, 1);
    const def = JUNK_KINDS[j.kind];
    this.fx.dust(j.x, j.y, 12, 'rgba(150,140,120,0.8)');
    this.fx.burst(j.x, j.y, 12, { type: 'plank', color: ['#8b5a2b', '#777', '#a0522d'], size: 0.1, up: 4, speed: 2.5, life: 0.9 });
    this.emit('sfx', 'break');
    this.emit('shake', 0.18);
    this.emit('haptic', 35);
    this.addStat('junk', 1);
    this.quests.onEvent('smash', 1);
    const room = this.map.roomAtWorld(j.x, j.y);
    const kinds = Object.entries(room?.def.trash?.kinds || { box: 1, paper: 1, can: 1 });
    for (let k = 0; k < def.drops; k++) {
      const a = (k / def.drops) * Math.PI * 2 + Math.random() * 0.5;
      const r = 0.5 + Math.random() * 0.6;
      let x = j.x + Math.cos(a) * r, y = j.y + Math.sin(a) * r;
      if (!this.map.isFreeFloor(Math.floor(x), Math.floor(y)) || this.map.roomAtWorld(x, y) !== room) { x = j.x; y = j.y; }
      const it = this.addTrash(x, y, weightedPick(kinds));
      it.pop = 1; it.popFrom = { x: j.x, y: j.y };
    }
  }

  // ---------------------------------------------------------------- interactions

  /** Proximity interactions shared by the player and staff. */
  agentInteract(a, dt) {
    const isP = !!a.isPlayer;
    const role = a.role;
    for (const k in a.cool) a.cool[k] -= dt;
    const bagCap = isP ? this.stats.bagCap : this.stats.staffCap * 3;
    const trayCap = isP ? this.stats.trayCap : this.stats.staffCap;

    // trash pickup
    if (isP || role === 'cleaner') {
      const rad = isP ? this.stats.magnet : 0.5;
      if (a.bag.length < bagCap) {
        for (const it of this.trash) {
          if (it.gone || it.pop > 0) continue;
          if (a.bag.length >= bagCap) break;
          if (dist2(a.x, a.y, it.x, it.y) > rad * rad) continue;
          const room = this.map.roomAtWorld(it.x, it.y);
          if (room && !room.unlocked) continue;
          if (!isP && it.claimed && it.claimed !== a) continue;
          this.pickTrash(a, it);
        }
      } else if (isP && !a.cool.full) {
        // bag full feedback when walking over trash
        const near = this.trash.some((it) => !it.gone && dist2(a.x, a.y, it.x, it.y) < rad * rad);
        if (near) {
          a.cool.full = 2.5;
          a.setEmote('🎒', 1.2);
          this.fx.text(a.x, a.y, 'Sac plein !', '#ff6b6b', 0.9, 1.6);
          this.emit('sfx', 'error');
        }
      }
    }

    // bin deposit
    if ((isP || role === 'cleaner') && a.bag.length > 0) {
      for (const b of this.bins) {
        if (!b.built) continue;
        if (dist2(a.x, a.y, b.cx, b.cy) > 1.6 * 1.6) continue;
        if ((a.cool.dep || 0) > 0) break;
        a.cool.dep = isP ? 0.045 : 0.09;
        const v = a.bag.pop();
        b.lid = 1;
        this.flyer('trash', a.x, a.y, 0.9, { x: b.cx, y: b.cy, z: 0.9 }, 0.28, 0.8, { kind: 'bag' });
        this.addMoney(v, 'trash');
        if (isP) {
          this.quests.onEvent('deposit', 1);
          this.fx.text(b.cx, b.cy, '+' + fmtMoney(Math.max(1, v)), '#7dff8a', 0.9, 1.4);
          this.emit('sfx', 'deposit', { pitch: 1 + Math.min(1, (this.depositCombo = (this.depositCombo || 0) + 1) * 0.03) });
          this.emit('haptic', 8);
        } else if (this.isVisible(b.cx, b.cy)) {
          this.fx.text(b.cx, b.cy, '+' + fmtMoney(Math.max(1, v)), '#a4ffb0', 0.7, 1.4);
        }
        break;
      }
    } else if (isP) this.depositCombo = 0;

    // station pickup
    if (isP || role === 'server') {
      for (const st of this.stations) {
        if (!st.built || st.stock <= 0 || a.food >= trayCap) continue;
        if (dist2(a.x, a.y, st.pickup.x, st.pickup.y) > 0.8 * 0.8) continue;
        if ((a.cool.pick || 0) > 0) break;
        a.cool.pick = isP ? 0.1 : 0.16;
        st.stock--;
        a.food++;
        this.flyer('food', st.cx, st.cy, 0.8, () => ({ x: a.x, y: a.y, z: 1.0 + a.food * 0.09 }), 0.22, 0.4);
        if (isP) { this.quests.onEvent('pickFood', 1); this.emit('sfx', 'pick', { pitch: 1 + a.food * 0.05 }); }
        break;
      }
    }

    // counter drop
    if ((isP || role === 'server') && a.food > 0) {
      for (const c of this.counters) {
        if (!c.built || c.stock >= this.counterMax(c)) continue;
        const near = dist2(a.x, a.y, c.service.x, c.service.y) < 1.1 * 1.1 || dist2(a.x, a.y, c.dropPos.x, c.dropPos.y) < 0.8 * 0.8;
        if (!near) continue;
        if ((a.cool.drop || 0) > 0) break;
        a.cool.drop = isP ? 0.08 : 0.14;
        a.food--;
        c.stock++;
        this.flyer('food', a.x, a.y, 1.0, { x: c.stockPos.x, y: c.stockPos.y, z: 0.7 }, 0.2, 0.4);
        if (isP) this.emit('sfx', 'drop', { pitch: 1.2 - a.food * 0.04 });
        break;
      }
    }

    // cash pickup (player only)
    if (isP) {
      for (const c of this.counters) {
        if (!c.built || c.cash < 0.5) continue;
        if (dist2(a.x, a.y, c.cashPos.x, c.cashPos.y) > 1.5 * 1.5) continue;
        const v = c.cash;
        c.cash = 0;
        const n = Math.min(10, 2 + Math.floor(Math.log2(1 + v)));
        for (let k = 0; k < n; k++) {
          this.flyer('bill', c.cashPos.x + (Math.random() - 0.5) * 0.3, c.cashPos.y, 0.6 + k * 0.03,
            () => ({ x: a.x, y: a.y, z: 1 }), 0.25 + k * 0.03, 0.7);
        }
        this.addMoney(v, 'sales');
        this.fx.text(a.x, a.y, '+' + fmtMoney(v), '#7dff8a', 1.2, 1.6);
        this.quests.onEvent('collectCash', 1);
        this.emit('sfx', 'cash');
        this.emit('haptic', 20);
      }
    }

    // table clearing
    if (isP || role === 'cleaner') {
      for (const tb of this.tables) {
        if (!tb.built) continue;
        if (dist2(a.x, a.y, tb.cx, tb.cy) > 1.5 * 1.5) continue;
        for (const seat of tb.seats) {
          if (!seat.mess || seat.occupant) continue;
          if (a.bag.length + seat.mess.n > bagCap) {
            if (isP && !a.cool.full) {
              a.cool.full = 2.5; a.setEmote('🎒', 1.2);
              this.fx.text(a.x, a.y, 'Sac plein !', '#ff6b6b', 0.9, 1.6);
              this.emit('sfx', 'error');
            }
            continue;
          }
          this.clearSeat(a, seat, isP);
        }
      }
    }
  }

  pickTrash(a, it) {
    it.gone = true;
    a.bag.push(it.value);
    const idx = this.trash.indexOf(it);
    if (idx >= 0) this.trash.splice(idx, 1);
    this.flyer('trash', it.x, it.y, 0.1, () => ({ x: a.x - a.face.x * 0.25, y: a.y - a.face.y * 0.25, z: 0.8 }), 0.22, 0.6, { kind: it.kind, rot: it.rot });
    if (a.isPlayer) {
      a.squash = 0.4;
      this.combo = (this.time - (this.lastPickT || 0) < 0.6) ? (this.combo || 0) + 1 : 0;
      this.lastPickT = this.time;
      this.emit('sfx', 'pop', { pitch: 1 + Math.min(this.combo, 14) * 0.06 });
      this.emit('haptic', 6);
      this.addStat('trash', 1);
      this.quests.onEvent('collect', 1);
    }
  }

  clearSeat(a, seat, isP) {
    const m = seat.mess;
    seat.mess = null;
    seat.claimed = null;
    for (let k = 0; k < m.n; k++) {
      a.bag.push((this.def.economy.trashValue ?? 1) * this.k);
      this.flyer('trash', seat.table.cx, seat.table.cy, 0.6, () => ({ x: a.x, y: a.y, z: 0.8 }), 0.22 + k * 0.05, 0.6, { kind: (m.kinds && m.kinds[k]) || 'plate' });
    }
    if (m.tip > 0) {
      this.addMoney(m.tip, 'tip');
      if (isP || this.isVisible(seat.x, seat.y)) this.fx.text(seat.table.cx, seat.table.cy, '+' + fmtMoney(Math.max(1, m.tip)), '#ffe066', 0.8, 1.2);
    }
    this.fx.sparkle(seat.table.cx, seat.table.cy, 4, 0.4);
    this.addStat('tables', 1);
    if (isP) {
      this.quests.onEvent('cleanTable', 1);
      this.emit('sfx', 'clear');
      this.emit('haptic', 10);
    }
  }

  isVisible(x, y) {
    const v = this.view;
    if (!v) return true;
    return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1;
  }

  // ---------------------------------------------------------------- flyers (visual transfers)

  flyer(type, x, y, z, to, dur, arc, data = {}) {
    if (this.flyers.length > 160) this.flyers.shift();
    this.flyers.push({ type, x0: x, y0: y, z0: z, to, t: 0, dur, arc, data });
  }

  updateFlyers(dt) {
    let w = 0;
    for (const f of this.flyers) {
      f.t += dt / f.dur;
      if (f.t < 1) this.flyers[w++] = f;
    }
    this.flyers.length = w;
  }

  // ---------------------------------------------------------------- pads

  updatePads(dt) {
    const p = this.player;
    let on = null;
    for (const pad of this.pads) {
      if (dist2(p.x, p.y, pad.x, pad.y) < 0.55 * 0.55) { on = pad; break; }
    }
    if (on !== this.padOn) { this.padOn = on; this.padT = 0; }
    if (!on) return;
    this.padT += dt;
    if (this.padT < 0.3) return;
    const paidNow = this.padPaid(on);
    const remaining = on.cost - paidNow;
    if (remaining <= 1e-6) { this.completePad(on); return; }
    if (this.state.money <= 0.001) {
      if (!p.cool.broke) { p.cool.broke = 3; this.fx.text(p.x, p.y, 'Pas assez d\'argent', '#ff8a8a', 0.8, 1.6); }
      return;
    }
    const rate = Math.max(on.cost / 1.3, 12 * this.k);
    const pay = Math.min(rate * dt, this.state.money, remaining);
    this.state.money -= pay;
    if (on.kind === 'room') on.room.paid += pay; else on.ent.paid += pay;
    this.padCoinT -= dt;
    if (this.padCoinT <= 0) {
      this.padCoinT = 0.06;
      this.flyer('coin', p.x, p.y, 1.0, { x: on.x, y: on.y, z: 0.05 }, 0.25, 0.8);
      this.emit('sfx', 'tick', { pitch: 0.8 + (paidNow / on.cost) * 0.8 });
    }
    if (this.padPaid(on) >= on.cost - 1e-6) this.completePad(on);
  }

  // ---------------------------------------------------------------- stations & counters

  updateStations(dt) {
    const time = BASE.stationTime * (this.def.station?.time ?? 1) / this.stats.cookMul;
    const max = this.stats.stationStock;
    for (const st of this.stations) {
      if (!st.built) continue;
      if (st.stock >= max) { st.t = 0; continue; }
      st.t += dt / time;
      if (st.t >= 1) {
        st.t = 0;
        st.stock++;
        st.bump = 1;
        if (this.isVisible(st.cx, st.cy) && Math.random() < 0.5) this.fx.burst(st.cx, st.cy, 2, { color: '#fff', size: 0.04, up: 2, z: 0.8 });
      }
    }
  }

  updateCounters(dt) {
    const p = this.player;
    for (const c of this.counters) {
      if (!c.built) continue;
      let server = null;
      if (dist2(p.x, p.y, c.service.x, c.service.y) < 0.8 * 0.8) server = p;
      else {
        for (const s of this.staff) {
          if (s.role === 'cashier' && s.post === c && dist2(s.x, s.y, c.service.x, c.service.y) < 0.35 * 0.35) { server = s; break; }
        }
      }
      c.servedBy = server;
      const front = c.queue[0];
      if (!server || !front || !front.atFront || front.got >= front.order || c.stock <= 0) {
        c.serveT = Math.max(0, c.serveT - dt);
        continue;
      }
      const t = server.isPlayer ? BASE.serveTimePlayer : BASE.serveTimeCashier * BASE.staffSpeed / this.stats.staffSpeed;
      c.serveT += dt;
      if (c.serveT < t) continue;
      c.serveT = 0;
      c.stock--;
      front.got++;
      this.flyer('food', c.stockPos.x, c.stockPos.y, 0.7, () => ({ x: front.x, y: front.y, z: 1 }), 0.2, 0.4);
      if (server.isPlayer || this.isVisible(c.cx, c.cy)) this.emit('sfx', 'serve', { quiet: !server.isPlayer });
      if (front.got >= front.order) this.customerPaid(front, c, server);
    }
  }

  customerPaid(cu, c, server) {
    const price = productPrice(this);
    const amount = price * cu.got;
    c.cash += amount;
    cu.paidAmount = amount;
    cu.food = cu.got;
    this.state.served++;
    this.addStat('served', 1);
    this.quests.onEvent('serve', 1);
    if (!server.isPlayer) this.autoAcc += amount;
    this.flyer('bill', cu.x, cu.y, 1, { x: c.cashPos.x, y: c.cashPos.y, z: 0.7 }, 0.3, 0.6);
    const qi = c.queue.indexOf(cu);
    if (qi >= 0) c.queue.splice(qi, 1);
    cu.atFront = false;
    const seat = this.findFreeSeat(cu);
    if (seat) {
      seat.reserved = cu;
      cu.seat = seat;
      cu.state = 'toSeat';
      cu.setEmote('😀', 1);
    } else {
      cu.state = 'waitSeat';
      cu.patience = BASE.seatPatience;
      cu.waitSpot = this.waitSpotFor(c);
      cu.setEmote('🪑', 1.5);
    }
    this.checkLevelStars();
  }

  waitSpotFor(c) {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 1.8;
      const x = c.cx + Math.cos(a) * r + c.f.x * 2, y = c.cy + Math.sin(a) * r + c.f.y * 2;
      if (this.map.isFreeFloor(Math.floor(x), Math.floor(y))) return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
    }
    return { x: c.queueSlot(1).x + 1, y: c.queueSlot(1).y };
  }

  findFreeSeat() {
    const free = [];
    for (const tb of this.tables) {
      if (!tb.built) continue;
      for (const s of tb.seats) if (!s.occupant && !s.reserved && !s.mess) free.push(s);
    }
    return free.length ? pick(free) : null;
  }

  customerDoneEating(cu) {
    const seat = cu.seat;
    seat.occupant = null;
    const price = productPrice(this);
    const tip = price * cu.got * BASE.tipRate * (this.state.rating / 5);
    const kinds = [];
    const n = Math.min(3, 1 + Math.floor(cu.got / 2));
    for (let k = 0; k < n; k++) kinds.push(pick(this.def.messKinds || ['plate', 'cup', 'paper']));
    seat.mess = { n, tip, kinds };
    cu.food = 0;
    cu.state = 'leave';
    cu.seat = null;
    cu.setEmote(this.state.rating > 3.5 ? '😍' : '🙂', 1.2);
    const spill = this.def.economy.spill || 'spill';
    if (Math.random() < BASE.spillChance) {
      const a = Math.random() * Math.PI * 2;
      this.dirt.addStain(seat.x + Math.cos(a) * 0.35, seat.y + Math.sin(a) * 0.35, 0.28 + Math.random() * 0.18, spill, 0.8, Math.floor(Math.random() * 999));
    }
    if (Math.random() < BASE.floorTrashChance) {
      const x = seat.x + (Math.random() - 0.5) * 0.8, y = seat.y + (Math.random() - 0.5) * 0.8;
      if (this.map.isFreeFloor(Math.floor(x), Math.floor(y))) this.addTrash(x, y, pick(this.def.messKinds || ['paper', 'cup', 'can']));
    }
  }

  customerGivesUp(cu) {
    const qi = cu.counter.queue.indexOf(cu);
    if (qi >= 0) cu.counter.queue.splice(qi, 1);
    if (cu.seat && cu.seat.reserved === cu) cu.seat.reserved = null;
    cu.seat = null;
    cu.state = 'leave';
    cu.angry = true;
    cu.setEmote('😡', 2.5);
    this.state.lost += 1;
    if (this.isVisible(cu.x, cu.y)) this.emit('sfx', 'angry');
  }

  removeCustomer(cu) {
    const i = this.customers.indexOf(cu);
    if (i >= 0) this.customers.splice(i, 1);
    const qi = cu.counter.queue.indexOf(cu);
    if (qi >= 0) cu.counter.queue.splice(qi, 1);
  }

  updateSpawning(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const ratingMul = 0.55 + 0.13 * this.state.rating;
    const base = this.def.economy.customerInterval / (this.stats.adsMul * ratingMul);
    this.spawnT = base * (0.7 + Math.random() * 0.6);
    const counters = this.counters.filter((c) => this.counterOpen(c));
    if (!counters.length || !this.stations.some((s) => s.built)) return;
    let seats = 0;
    for (const t of this.tables) if (t.built) seats += t.seats.length;
    if (seats === 0) return;
    const queueCap = counters.reduce((s, c) => s + c.queueLen, 0);
    if (this.customers.length >= seats + queueCap) return;
    let best = null;
    for (const c of counters) if (c.queue.length < c.queueLen && (!best || c.queue.length < best.queue.length)) best = c;
    if (!best) return;
    const spawns = this.def.spawns || [[0.5, this.map.h - 1.5]];
    const sp = pick(spawns);
    const exit = pick(spawns);
    const order = 1 + Math.floor(Math.random() * (this.def.economy.orderMax || 2));
    const cu = new Customer(sp[0], sp[1], best, order, { x: exit[0], y: exit[1] });
    best.queue.push(cu);
    this.customers.push(cu);
  }

  // ---------------------------------------------------------------- rooms, rating, stars

  roomProgress(r) {
    if (r.cleaned) return 1;
    const ratio = this.dirt.roomDirtRatio(r.index);
    const dirtProg = clamp(1 - (ratio - ROOM_CLEAN_THRESHOLD) / (1 - ROOM_CLEAN_THRESHOLD), 0, 1);
    const trashLeft = this.trash.filter((t) => !t.gone && this.map.roomAtWorld(t.x, t.y) === r).length +
      this.junk.filter((j) => this.map.roomAtWorld(j.x, j.y) === r).length * 3;
    const tp = r.trashInit > 0 ? clamp(1 - trashLeft / r.trashInit, 0, 1) : 1;
    return Math.min(0.99, dirtProg * 0.7 + tp * 0.3);
  }

  checkRooms() {
    for (const r of this.map.rooms) {
      if (!r.unlocked || r.cleaned) continue;
      const ratio = this.dirt.roomDirtRatio(r.index);
      if (ratio > ROOM_CLEAN_THRESHOLD) continue;
      if (this.trash.some((t) => !t.gone && this.map.roomAtWorld(t.x, t.y) === r)) continue;
      if (this.junk.some((j) => this.map.roomAtWorld(j.x, j.y) === r)) continue;
      this.roomCleaned(r);
    }
  }

  roomCleaned(r) {
    r.cleaned = true;
    const pts = this.dirt.wipeRoom(r.index);
    for (const pt of pts) this.fx.sparkle(pt.x, pt.y, 1, 0.3);
    const bonus = (r.def.bonus ?? 15) * this.k;
    this.addMoney(bonus, 'room');
    this.fx.confetti(this.player.x, this.player.y, 50);
    this.fx.text(this.player.x, this.player.y, `✨ ${r.name} propre ! +${fmtMoney(bonus)}`, '#ffe066', 1.3, 1.8);
    for (let k = 0; k < 8; k++) this.flyer('bill', r.cx + (Math.random() - 0.5) * 3, r.cy + (Math.random() - 0.5) * 2, 0.5, () => ({ x: this.player.x, y: this.player.y, z: 1 }), 0.5 + k * 0.06, 1.5);
    this.addStat('rooms', 1);
    this.emit('sfx', 'fanfare');
    this.emit('haptic', 80);
    this.emit('roomCleaned', r);
    this.refreshPads();
    this.checkLevelStars();
  }

  updateRating(initial) {
    let seats = 0, dirty = 0;
    for (const t of this.tables) {
      if (!t.built) continue;
      for (const s of t.seats) { seats++; if (s.mess) dirty++; }
    }
    const tableScore = seats ? 1 - dirty / seats : 0.5;
    let floor = 0, nRooms = 0, bonus = 0;
    for (const r of this.map.rooms) {
      if (!r.unlocked) continue;
      nRooms++;
      if (r.cleaned) {
        const area = r.cells.length * 64;
        floor += clamp(1 - (this.dirt.roomNow[r.index] / area) * 25, 0, 1);
        bonus += r.def.ratingBonus || 0;
      }
    }
    const floorScore = nRooms ? floor / nRooms : 0;
    const floorTrash = this.trash.filter((t) => { const r = this.map.roomAtWorld(t.x, t.y); return r && r.cleaned; }).length;
    for (const d of this.decors) if (d.built) bonus += d.kind.rating;
    const lostPenalty = Math.min(1.5, this.state.lost * 0.15);
    const target = clamp(1 + 2 * tableScore + 1.5 * floorScore + Math.min(1, bonus) - lostPenalty - Math.min(0.6, floorTrash * 0.06), 0, 5);
    this.state.rating = initial ? target : this.state.rating + (target - this.state.rating) * 0.15;
    this.state.lost *= 0.97;
    if (this.state.rating >= 4.9) this.setStat('rating5', 1);
  }

  trackAutoIncome(dt) {
    this.autoT += dt;
    if (this.autoT >= 15) {
      const rate = this.autoAcc / this.autoT;
      this.state.autoRate = this.state.autoRate * 0.7 + rate * 0.3;
      this.autoAcc = 0; this.autoT = 0;
    }
  }

  checkLevelStars() {
    const st = this.state.stars;
    const award = (i) => { if (!st[i]) { st[i] = 1; this.emit('star', i); } };
    if (this.map.rooms.every((r) => r.unlocked && r.cleaned)) award(0);
    if (this.map.rooms.every((r) => r.unlocked) && this.entities.every((e) => e.built)) {
      award(1);
      if (!this.state.completed) {
        this.state.completed = true;
        this.emit('levelComplete');
      }
    }
    if (this.state.served >= this.servedGoal()) award(2);
  }

  // ---------------------------------------------------------------- queries for hints/quests

  nearestTrash(x, y, roomPred) {
    let best = null, bd = Infinity;
    for (const t of this.trash) {
      if (t.gone) continue;
      const r = this.map.roomAtWorld(t.x, t.y);
      if (roomPred && r && !roomPred(r)) continue;
      if (roomPred && !r) continue;
      const d = dist2(x, y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  nearestJunk(x, y, room) {
    let best = null, bd = Infinity;
    for (const j of this.junk) {
      const r = this.map.roomAtWorld(j.x, j.y);
      if (room ? r !== room : (r && !r.unlocked)) continue;
      const d = dist2(x, y, j.x, j.y);
      if (d < bd) { bd = d; best = j; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  nearestBin(x, y) {
    let best = null, bd = Infinity;
    for (const b of this.bins) {
      if (!b.built) continue;
      const d = dist2(x, y, b.cx, b.cy);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { x: best.cx, y: best.cy } : null;
  }

  nearestDirtySeat(x, y) {
    let best = null, bd = Infinity;
    for (const t of this.tables) {
      if (!t.built) continue;
      for (const s of t.seats) {
        if (!s.mess) continue;
        const d = dist2(x, y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }

  /** Guidance arrow target (cached a few times per second). */
  hint(dt) {
    this.hintT -= dt;
    if (this.hintT > 0) return this.hintCache;
    this.hintT = 0.25;
    const p = this.player;
    let h = null;
    if (p.bag.length >= this.stats.bagCap) {
      const b = this.nearestBin(p.x, p.y);
      if (b) h = { ...b, label: 'Sac plein !' };
    }
    if (!h) {
      const t = this.quests.target();
      if (t) h = { x: t.x, y: t.y };
    }
    this.hintCache = h;
    return h;
  }

  /** Is any part of the current location unlockable/buyable? Used by the map screen. */
  get completionRatio() {
    const total = this.entities.length + this.map.rooms.length;
    const done = this.entities.filter((e) => e.built).length + this.map.rooms.filter((r) => r.unlocked).length;
    return done / total;
  }
}
