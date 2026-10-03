// Characters: the player, customers and staff, with path following and AI.

import { findPath, smoothPath } from '../util/path.js';
import { dist, pick } from '../util/math.js';
import { BASE } from './economy.js';

export const SHIRTS = ['#e85d5d', '#f0a43a', '#f2d54b', '#6cc56c', '#4fb3d9', '#6f7bd9', '#b46fd9', '#e57fb8', '#8a8a8a', '#3d9c8c', '#ffffff', '#2f3542'];
export const SKINS = ['#f6d3b3', '#eab68e', '#c98e62', '#a26a45', '#7a4a2e', '#f2c6a0'];
export const HAIRS = ['#2b1d14', '#5a3a22', '#a8662f', '#e3c26b', '#1b1b1b', '#9a9a9a', '#c4462f', '#6b3fa0'];

let NEXT_ID = 1;

export class Agent {
  constructor(kind, x, y) {
    this.uid = NEXT_ID++;
    this.kind = kind;
    this.x = x; this.y = y;
    this.r = 0.24;
    this.face = { x: 0, y: 1 };
    this.moving = false;
    this.walkT = 0;
    this.path = null;
    this.goalX = NaN; this.goalY = NaN;
    this.navV = -1;
    this.stuck = 0; this.stuckCount = 0;
    this.bag = []; // trash values carried
    this.food = 0; // products carried
    this.squash = 0;
    this.look = randomLook();
    this.emote = null; this.emoteT = 0;
    this.cool = {}; // interaction cooldowns
  }

  setEmote(e, t = 1.6) { this.emote = e; this.emoteT = t; }

  repath(game, gx, gy) {
    const map = game.map;
    const isFree = (x, y) => map.isFree(x, y);
    const tiles = findPath(map.w, map.h, isFree, Math.floor(this.x), Math.floor(this.y), Math.floor(gx), Math.floor(gy));
    this.path = tiles ? smoothPath(isFree, this.x, this.y, tiles, gx, gy) : [{ x: gx, y: gy }];
    if (this.path.length === 0) this.path = [{ x: gx, y: gy }];
    this.goalX = gx; this.goalY = gy;
    this.navV = map.version;
  }

  /** Walk toward a world point. Returns true once within `tol`. */
  walkTo(game, gx, gy, speed, dt, tol = 0.1) {
    const dx0 = gx - this.x, dy0 = gy - this.y;
    if (dx0 * dx0 + dy0 * dy0 <= tol * tol) { this.moving = false; return true; }
    const map = game.map;
    if (!this.path || this.goalX !== gx || this.goalY !== gy || this.navV !== map.version) this.repath(game, gx, gy);
    let wp = this.path[0] || { x: gx, y: gy };
    let dx = wp.x - this.x, dy = wp.y - this.y;
    let d = Math.hypot(dx, dy);
    while (d < 0.1 && this.path.length > 1) {
      this.path.shift();
      wp = this.path[0];
      dx = wp.x - this.x; dy = wp.y - this.y; d = Math.hypot(dx, dy);
    }
    const step = Math.min(d, speed * dt);
    if (d > 1e-5) {
      const p = map.moveCircle(this.x, this.y, (dx / d) * step, (dy / d) * step, this.r);
      const moved = Math.hypot(p.x - this.x, p.y - this.y);
      this.x = p.x; this.y = p.y;
      this.turnToward(dx, dy, dt);
      this.moving = true;
      this.walkT += dt * speed * 3.2;
      if (moved < step * 0.3 && step > 1e-3) {
        this.stuck += dt;
        if (this.stuck > 0.5) {
          this.stuck = 0;
          this.stuckCount++;
          this.repath(game, gx, gy);
          if (this.stuckCount > 3) {
            const t = map.nearestFreeTile(this.x, this.y);
            if (t) { this.x = t.x + 0.5; this.y = t.y + 0.5; }
            this.stuckCount = 0;
          }
        }
      } else { this.stuck = 0; }
    }
    return false;
  }

  turnToward(dx, dy, dt) {
    const d = Math.hypot(dx, dy);
    if (d < 1e-5) return;
    const k = Math.min(1, dt * 14);
    this.face.x += (dx / d - this.face.x) * k;
    this.face.y += (dy / d - this.face.y) * k;
    const n = Math.hypot(this.face.x, this.face.y) || 1;
    this.face.x /= n; this.face.y /= n;
  }

  stopWalking() { this.moving = false; }
}

export function randomLook(rnd = Math.random) {
  return {
    shirt: pick(SHIRTS, rnd), skin: pick(SKINS, rnd), hair: pick(HAIRS, rnd),
    hairStyle: Math.floor(rnd() * 4), pants: pick(['#3b4a6b', '#2f2f37', '#5b4636', '#476b4a', '#6b6b78'], rnd),
    hat: null,
  };
}

// ------------------------------------------------------------------ player

export class Player extends Agent {
  constructor(x, y) {
    super('player', x, y);
    this.r = 0.28;
    this.isPlayer = true;
    this.scrubbing = 0; // smoothed scrub intensity for audio/fx
    this.vx = 0; this.vy = 0;
  }
}

// ------------------------------------------------------------------ customers

export class Customer extends Agent {
  constructor(x, y, counter, order, exit) {
    super('customer', x, y);
    this.state = 'queue';
    this.counter = counter;
    this.order = order;
    this.got = 0;
    this.seat = null;
    this.wait = 0;
    this.patience = BASE.seatPatience;
    this.exit = exit;
    this.t = 0;
    this.checkT = 0;
    this.paidAmount = 0;
    this.speedMul = 0.85 + Math.random() * 0.3;
    this.angry = false;
  }
}

export function updateCustomer(game, c, dt) {
  const speed = BASE.customerSpeed * c.speedMul;
  if (c.emoteT > 0) c.emoteT -= dt;
  switch (c.state) {
    case 'queue': {
      const q = c.counter.queue;
      const i = q.indexOf(c);
      if (i < 0) { c.state = 'leave'; break; }
      const slot = c.counter.queueSlot(i);
      const arrived = c.walkTo(game, slot.x, slot.y, speed, dt, 0.1);
      c.atFront = arrived && i === 0;
      if (arrived) c.turnToward(-c.counter.f.x, -c.counter.f.y, dt);
      c.wait += dt;
      if (c.wait > BASE.queuePatience && c.got === 0) {
        game.customerGivesUp(c);
      } else if (c.wait > BASE.queuePatience * 0.6 && c.emoteT <= 0 && Math.random() < dt * 0.3) {
        c.setEmote('⏳');
      }
      break;
    }
    case 'toSeat': {
      const s = c.seat;
      if (c.walkTo(game, s.x, s.y, speed, dt, 0.08)) {
        c.state = 'eat';
        const [a, b] = game.def.economy.eatTime || [6, 9];
        c.t = a + Math.random() * (b - a);
        s.occupant = c;
        s.reserved = null;
        c.x = s.x; c.y = s.y;
        c.face = { x: s.face.x, y: s.face.y };
        c.moving = false;
      }
      break;
    }
    case 'eat': {
      c.t -= dt;
      if (c.t <= 0) game.customerDoneEating(c);
      else if (c.emoteT <= 0 && Math.random() < dt * 0.08) c.setEmote(pick(['😋', '😊', '👍', '❤️']), 1.2);
      break;
    }
    case 'waitSeat': {
      c.patience -= dt;
      c.checkT -= dt;
      if (c.waitSpot) c.walkTo(game, c.waitSpot.x, c.waitSpot.y, speed, dt, 0.15);
      if (c.checkT <= 0) {
        c.checkT = 0.5;
        const seat = game.findFreeSeat(c);
        if (seat) {
          seat.reserved = c;
          c.seat = seat;
          c.state = 'toSeat';
          break;
        }
        if (c.emoteT <= 0) c.setEmote('🪑', 1.2);
      }
      if (c.patience <= 0) game.customerGivesUp(c);
      break;
    }
    case 'leave': {
      if (c.walkTo(game, c.exit.x, c.exit.y, speed * (c.angry ? 1.3 : 1), dt, 0.3)) game.removeCustomer(c);
      break;
    }
  }
}

// ------------------------------------------------------------------ staff

export class Staff extends Agent {
  constructor(role, x, y, home, post) {
    super('staff', x, y);
    this.role = role;
    this.home = home;
    this.post = post || null;
    this.task = null;
    this.thinkT = 0;
    this.r = 0.22;
  }
}

export function updateStaff(game, s, dt) {
  const speed = game.stats.staffSpeed;
  if (s.emoteT > 0) s.emoteT -= dt;
  if (s.role === 'cashier') return updateCashier(game, s, dt, speed);
  if (s.role === 'server') return updateServer(game, s, dt, speed);
  if (s.role === 'cleaner') return updateCleaner(game, s, dt, speed);
}

function updateCashier(game, s, dt, speed) {
  const c = s.post;
  if (!c || !c.built) { s.walkTo(game, s.home.x, s.home.y, speed, dt); return; }
  if (s.walkTo(game, c.service.x, c.service.y, speed, dt, 0.08)) {
    s.turnToward(c.f.x, c.f.y, dt);
  }
}

function updateServer(game, s, dt, speed) {
  const cap = game.stats.staffCap;
  s.thinkT -= dt;
  let t = s.task;
  if (!t || s.thinkT <= 0) {
    s.thinkT = 0.6;
    t = s.task = chooseServerTask(game, s, cap, t);
  }
  if (t.type === 'fetch') {
    const st = t.station;
    if (s.walkTo(game, st.pickup.x, st.pickup.y, speed, dt, 0.25)) {
      s.turnToward(-st.f.x, -st.f.y, dt);
      t.waitT = (t.waitT || 0) + dt;
      if (s.food >= cap || (s.food > 0 && st.stock === 0 && t.waitT > 1.2)) {
        s.task = null; s.thinkT = 0;
      }
    }
  } else if (t.type === 'deliver') {
    const c = t.counter;
    if (s.walkTo(game, c.dropPos.x, c.dropPos.y, speed, dt, 0.25)) {
      s.turnToward(c.f.x, c.f.y, dt);
      if (s.food === 0 || c.stock >= game.counterMax(c)) { s.task = null; s.thinkT = 0; }
    }
  } else {
    s.walkTo(game, s.home.x, s.home.y, speed, dt, 0.3);
  }
}

function chooseServerTask(game, s, cap, current) {
  // keep fetching if not full and the station still has stock
  if (current && current.type === 'fetch' && s.food < cap && current.station.built &&
      (current.station.stock > 0 || s.food === 0)) {
    if (current.station.stock > 0 || !anyStationStock(game)) return current;
  }
  if (current && current.type === 'deliver' && s.food > 0) return current;
  const counters = game.counters.filter((c) => c.built);
  if (s.food > 0 && (s.food >= cap || !anyStationStock(game))) {
    if (!counters.length) return { type: 'idle' };
    let best = null, bestScore = Infinity;
    for (const c of counters) {
      const max = game.counterMax(c);
      if (c.stock >= max) continue;
      const score = c.stock / max * 6 + dist(s.x, s.y, c.dropPos.x, c.dropPos.y) * 0.2;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best ? { type: 'deliver', counter: best } : { type: 'idle' };
  }
  const stations = game.stations.filter((st) => st.built);
  if (!stations.length) return { type: 'idle' };
  // only fetch when some counter needs food
  const needs = counters.some((c) => c.stock < game.counterMax(c) - 1);
  if (!needs) return s.food > 0 ? { type: 'idle' } : { type: 'idle' };
  let best = null, bestScore = -Infinity;
  for (const st of stations) {
    const claim = game.staff.filter((o) => o !== s && o.task && o.task.type === 'fetch' && o.task.station === st).length;
    const score = st.stock - claim * 2 - dist(s.x, s.y, st.pickup.x, st.pickup.y) * 0.15 + st.t * 0.5;
    if (score > bestScore) { bestScore = score; best = st; }
  }
  return { type: 'fetch', station: best };
}

const anyStationStock = (game) => game.stations.some((st) => st.built && st.stock > 0);

function updateCleaner(game, s, dt, speed) {
  const cap = game.stats.staffCap * 3;
  s.thinkT -= dt;
  let t = s.task;
  if (!t || s.thinkT <= 0 || t.done) {
    s.thinkT = t && t.type === 'scrub' ? 1.5 : 0.8;
    const next = chooseCleanerTask(game, s, cap, t);
    if (t && t !== next) releaseClaim(t, s);
    t = s.task = next;
  }
  switch (t.type) {
    case 'bin': {
      const b = t.bin;
      const ax = b.access ? b.access.x : b.cx, ay = b.access ? b.access.y : b.cy + 1;
      if (s.walkTo(game, ax, ay, speed, dt, 0.5)) {
        if (s.bag.length === 0) t.done = true;
      }
      break;
    }
    case 'table': {
      const seat = t.seat;
      if (!seat.mess || s.bag.length + seat.mess.n > cap) { t.done = true; break; }
      s.walkTo(game, seat.x, seat.y, speed, dt, 0.5);
      break;
    }
    case 'trash': {
      const it = t.item;
      if (it.gone) { t.done = true; break; }
      s.walkTo(game, it.x, it.y, speed, dt, 0.25);
      break;
    }
    case 'scrub': {
      if (s.walkTo(game, t.x, t.y, speed * 0.8, dt, 0.35)) {
        t.t = (t.t || 0) + dt;
        // wander a little around the dirty tile while scrubbing
        const a = t.t * 3;
        s.x += Math.cos(a) * dt * 0.6; s.y += Math.sin(a * 1.3) * dt * 0.6;
        const p = game.map.resolveCircle(s.x, s.y, s.r); s.x = p.x; s.y = p.y;
        s.moving = true; s.walkT += dt * 4;
        const ti = game.map.idx(Math.floor(t.x), Math.floor(t.y));
        if (game.dirt.tileSum[ti] < 0.5 || t.t > 6) t.done = true;
      }
      game.staffScrub(s, dt);
      break;
    }
    default:
      s.walkTo(game, s.home.x, s.home.y, speed, dt, 0.3);
  }
}

function releaseClaim(t, s) {
  if (t.type === 'table' && t.seat.claimed === s) t.seat.claimed = null;
  if (t.type === 'trash' && t.item.claimed === s) t.item.claimed = null;
}

function chooseCleanerTask(game, s, cap, current) {
  const bins = game.bins.filter((b) => b.built);
  if (s.bag.length >= cap - 2 && bins.length) return { type: 'bin', bin: nearest(bins, s, (b) => [b.cx, b.cy]) };
  if (current && !current.done && (current.type === 'table' || current.type === 'trash' || current.type === 'bin')) return current;
  // dirty seats
  let best = null, bestD = Infinity;
  for (const tb of game.tables) {
    if (!tb.built) continue;
    for (const seat of tb.seats) {
      if (!seat.mess || seat.occupant || (seat.claimed && seat.claimed !== s)) continue;
      const d = dist(s.x, s.y, seat.x, seat.y);
      if (d < bestD) { bestD = d; best = seat; }
    }
  }
  if (best && s.bag.length < cap) { best.claimed = s; return { type: 'table', seat: best }; }
  // floor trash in maintained rooms
  let bt = null; bestD = Infinity;
  for (const it of game.trash) {
    if (it.gone || it.flying || (it.claimed && it.claimed !== s)) continue;
    const room = game.map.roomAtWorld(it.x, it.y);
    if (!room || !room.cleaned) continue;
    const d = dist(s.x, s.y, it.x, it.y);
    if (d < bestD) { bestD = d; bt = it; }
  }
  if (bt && s.bag.length < cap) { bt.claimed = s; return { type: 'trash', item: bt }; }
  if (current && current.type === 'scrub' && !current.done) return current;
  const target = game.dirt.nearestDirtyTile(s.x, s.y, (ri) => game.map.rooms[ri].cleaned, 2.5);
  if (target && !game.staff.some((o) => o !== s && o.task && o.task.type === 'scrub' && o.task.x === target.x && o.task.y === target.y)) {
    return { type: 'scrub', x: target.x, y: target.y, t: 0 };
  }
  if (s.bag.length > 0 && bins.length) return { type: 'bin', bin: nearest(bins, s, (b) => [b.cx, b.cy]) };
  return { type: 'idle' };
}

function nearest(list, a, pos) {
  let best = null, bestD = Infinity;
  for (const o of list) {
    const [x, y] = pos(o);
    const d = dist(a.x, a.y, x, y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
