// Furniture / interactive objects built from level `entities` definitions.
// Each object knows its footprint (blocking tiles), pad position, label and
// its interaction points. Behaviour that needs the whole game lives in game.js.

import { DECOR_KINDS, ROLES } from '../data/catalog.js';

export const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

class Base {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.type = def.type;
    this.x = def.x;
    this.y = def.y;
    this.cost = def.cost || 0;
    this.built = !!def.built;
    this.paid = 0;
    this.tiles = [[def.x, def.y]];
    this.pad = { x: def.x + 0.5, y: def.y + 0.5 };
    this.pop = 0; // build animation timer (1 -> 0)
    this.after = def.after || [];
  }
  get cx() { return this.x + 0.5; }
  get cy() { return this.y + 0.5; }
  /** Bottom y used for depth sorting. */
  get sortY() { return this.y + 1; }
  get blocks() { return true; }
  update() {}
  serialize() { return null; }
  deserialize() {}
}

export class Counter extends Base {
  constructor(def) {
    super(def);
    const [fx, fy] = DIRS[def.face || 'down'];
    this.f = { x: fx, y: fy };
    this.p = { x: Math.abs(fy), y: Math.abs(fx) };
    this.w = def.w || 2;
    this.tiles = [];
    for (let i = 0; i < this.w; i++) this.tiles.push([def.x + this.p.x * i, def.y + this.p.y * i]);
    this.ccx = def.x + 0.5 + (this.p.x * (this.w - 1)) / 2;
    this.ccy = def.y + 0.5 + (this.p.y * (this.w - 1)) / 2;
    this.service = { x: this.ccx - fx, y: this.ccy - fy };
    this.dropPos = { x: this.service.x - this.p.x * 0.6, y: this.service.y - this.p.y * 0.6 };
    this.cashPos = { x: def.x + 0.5 + this.p.x * (this.w - 1), y: def.y + 0.5 + this.p.y * (this.w - 1) };
    this.stockPos = { x: def.x + 0.5, y: def.y + 0.5 };
    this.pad = { x: this.ccx, y: this.ccy };
    this.queueLen = def.queueLen || 5;
    this.queue = [];
    this.stock = 0;
    this.cash = 0;
    this.serveT = 0;
    this.servedBy = null;
    this.label = 'Comptoir';
    this.icon = '🛎️';
  }
  get cx() { return this.ccx; }
  get cy() { return this.ccy; }
  get sortY() { return Math.max(...this.tiles.map((t) => t[1])) + 1; }
  queueSlot(i) { return { x: this.ccx + this.f.x * (1 + i), y: this.ccy + this.f.y * (1 + i) }; }
  serialize() { return { s: this.stock, c: Math.round(this.cash * 100) / 100 }; }
  deserialize(d) { if (d) { this.stock = d.s || 0; this.cash = d.c || 0; } }
}

export class Station extends Base {
  constructor(def, levelDef) {
    super(def);
    const [fx, fy] = DIRS[def.face || 'down'];
    this.f = { x: fx, y: fy };
    this.pickup = { x: def.x + 0.5 + fx, y: def.y + 0.5 + fy };
    this.stock = 0;
    this.t = 0;
    this.label = levelDef.station?.name || 'Machine';
    this.icon = levelDef.icon || '🍔';
    this.draw = levelDef.station?.draw || 'grill';
    this.bump = 0;
  }
  serialize() { return { s: this.stock }; }
  deserialize(d) { if (d) this.stock = d.s || 0; }
}

const SEAT_LAYOUTS = {
  lr: [[-1, 0], [1, 0]],
  ud: [[0, -1], [0, 1]],
  '4': [[-1, 0], [1, 0], [0, -1], [0, 1]],
  l: [[-1, 0]],
  r: [[1, 0]],
};

export class Table extends Base {
  constructor(def) {
    super(def);
    const layout = SEAT_LAYOUTS[def.seats || 'lr'];
    this.seats = layout.map(([dx, dy], i) => ({
      i, table: this, x: def.x + 0.5 + dx, y: def.y + 0.5 + dy,
      face: { x: -dx, y: -dy }, occupant: null, reserved: null, mess: null, claimed: null,
    }));
    this.label = 'Table';
    this.icon = '🪑';
  }
  get dirty() { return this.seats.some((s) => s.mess); }
  serialize() {
    return this.seats.map((s) => (s.mess ? [s.mess.n, Math.round(s.mess.tip * 100) / 100, s.mess.kinds || []] : 0));
  }
  deserialize(d) {
    if (!Array.isArray(d)) return;
    d.forEach((m, i) => {
      if (m && this.seats[i]) this.seats[i].mess = { n: m[0], tip: m[1], kinds: m[2] || [] };
    });
  }
}

export class Bin extends Base {
  constructor(def) {
    super(def);
    this.label = 'Benne';
    this.icon = '🗑️';
    this.lid = 0;
  }
}

export class Decor extends Base {
  constructor(def) {
    super(def);
    this.kind = DECOR_KINDS[def.kind] || DECOR_KINDS.plant;
    this.label = this.kind.name;
    this.icon = this.kind.icon;
    if (!this.kind.blocks) this.tiles = [];
  }
  get blocks() { return this.kind.blocks; }
}

export class HirePoint extends Base {
  constructor(def) {
    super(def);
    this.role = def.role;
    this.tiles = [];
    const r = ROLES[def.role];
    this.label = 'Embaucher : ' + r.name;
    this.icon = r.icon;
  }
  get blocks() { return false; }
}

export function createEntity(def, levelDef) {
  switch (def.type) {
    case 'counter': return new Counter(def);
    case 'station': return new Station(def, levelDef);
    case 'table': return new Table(def);
    case 'bin': return new Bin(def);
    case 'decor': return new Decor(def);
    case 'hire': return new HirePoint(def);
    default: throw new Error('Unknown entity type ' + def.type);
  }
}
