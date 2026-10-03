// Objectives shown in the HUD. A level can script a list of quests
// (tutorial); afterwards objectives are generated automatically from the
// level state (clean dirty rooms, then buy the cheapest available pad...).

import { fmtMoney, dist } from '../util/math.js';

/** Scripted quest kinds driven by game events: kind -> event name. */
const EVENT_KINDS = {
  collect: 'collect', deposit: 'deposit', scrub: 'scrub', smash: 'smash', pickFood: 'pickFood',
  serve: 'serve', collectCash: 'collectCash', cleanTable: 'cleanTable', upgrade: 'upgrade', earn: 'earn',
};

export class Quests {
  constructor(game, saved) {
    this.game = game;
    this.list = game.def.quests || [];
    this.i = saved?.i ?? 0;
    this.prog = saved?.p ?? 0;
    this.current = null;
    this.refreshT = 0;
    this.doneFlash = 0;
    this.select();
  }

  serialize() { return { i: this.i, p: Math.round(this.prog * 100) / 100 }; }

  select() {
    const g = this.game;
    while (this.i < this.list.length) {
      const q = this.list[this.i];
      // skip scripted quests already satisfied by the state (e.g. after loading)
      if (q.kind === 'build' && g.entityById[q.id]?.built) { this.i++; this.prog = 0; continue; }
      if (q.kind === 'cleanRoom' && g.map.roomById[q.room]?.cleaned) { this.i++; this.prog = 0; continue; }
      if (q.kind === 'unlock' && g.map.roomById[q.room]?.unlocked) { this.i++; this.prog = 0; continue; }
      this.current = { ...q, scripted: true };
      return;
    }
    this.current = this.auto();
  }

  auto() {
    const g = this.game;
    const p = g.player;
    const dirty = g.map.rooms.filter((r) => r.unlocked && !r.cleaned);
    if (dirty.length) {
      dirty.sort((a, b) => dist(p.x, p.y, a.cx, a.cy) - dist(p.x, p.y, b.cx, b.cy));
      const r = dirty[0];
      return { kind: 'cleanRoom', room: r.id, text: `Nettoie entièrement : ${r.name}`, auto: true };
    }
    if (g.pads.length) {
      let best = null;
      for (const pad of g.pads) {
        const rem = pad.cost - g.padPaid(pad);
        if (!best || rem < best.rem) best = { pad, rem };
      }
      const can = g.state.money >= best.rem;
      return {
        kind: 'pad', pad: best.pad, auto: true,
        text: can ? `Achète : ${best.pad.label}` : `Gagne ${fmtMoney(best.rem)} pour : ${best.pad.label}`,
      };
    }
    const goal = g.servedGoal();
    if (g.state.served < goal) {
      return { kind: 'serveGoal', auto: true, text: `Sers ${goal} clients pour la 3ᵉ étoile` };
    }
    return { kind: 'done', auto: true, text: '🎉 Lieu terminé ! Ouvre la carte 🗺️ pour le lieu suivant' };
  }

  onEvent(type, n = 1) {
    const q = this.current;
    if (!q || !q.scripted) return;
    if (EVENT_KINDS[q.kind] === type) {
      this.prog += n;
      if (this.prog >= (q.n || 1) - 1e-6) this.complete();
    }
  }

  update(dt) {
    const g = this.game;
    const q = this.current;
    if (this.doneFlash > 0) this.doneFlash -= dt;
    if (!q) return;
    if (q.scripted) {
      if (q.kind === 'build' && g.entityById[q.id]?.built) this.complete();
      else if (q.kind === 'cleanRoom' && g.map.roomById[q.room]?.cleaned) this.complete();
      else if (q.kind === 'unlock' && g.map.roomById[q.room]?.unlocked) this.complete();
      return;
    }
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.5;
      this.current = this.auto();
    }
  }

  complete() {
    const g = this.game;
    const q = this.current;
    if (q.reward) {
      const r = q.reward * g.k;
      g.addMoney(r, 'quest');
      g.fx.text(g.player.x, g.player.y, '+' + fmtMoney(r), '#ffe066', 1.2, 1.5);
    }
    g.emit('sfx', 'quest');
    g.emit('questDone', q);
    this.doneFlash = 1.2;
    this.i++;
    this.prog = 0;
    this.select();
  }

  /** Data for the HUD: text, progress 0..1, label. */
  view() {
    const g = this.game;
    const q = this.current;
    if (!q) return null;
    let progress = null, label = '';
    if (q.scripted && q.n) {
      progress = Math.min(1, this.prog / q.n);
      label = `${Math.min(q.n, Math.floor(this.prog))}/${q.n}`;
    }
    if (q.kind === 'cleanRoom') {
      const r = g.map.roomById[q.room];
      progress = g.roomProgress(r);
      label = Math.floor(progress * 100) + ' %';
    } else if (q.kind === 'pad' || q.kind === 'build') {
      const pad = q.kind === 'pad' ? q.pad : g.pads.find((p) => p.ent && p.ent.id === q.id);
      if (pad) {
        const rem = pad.cost - g.padPaid(pad);
        progress = rem > 0 ? Math.min(1, g.state.money / rem) : 1;
        label = fmtMoney(Math.min(g.state.money, rem)) + ' / ' + fmtMoney(rem);
      }
    } else if (q.kind === 'serveGoal') {
      const goal = g.servedGoal();
      progress = Math.min(1, g.state.served / goal);
      label = `${g.state.served}/${goal}`;
    }
    return { text: q.text, progress, label, reward: q.reward ? q.reward * g.k : 0, kind: q.kind };
  }

  /** World target for the guidance arrow, or null. */
  target() {
    const g = this.game;
    const q = this.current;
    if (!q) return null;
    const p = g.player;
    switch (q.kind) {
      case 'collect': return g.nearestTrash(p.x, p.y, (r) => r.unlocked);
      case 'deposit': return g.nearestBin(p.x, p.y);
      case 'scrub': return g.dirt.nearestDirtyTile(p.x, p.y, (ri) => g.map.rooms[ri].unlocked, 4);
      case 'smash': return g.nearestJunk(p.x, p.y);
      case 'cleanRoom': {
        const r = g.map.roomById[q.room];
        return g.nearestTrash(p.x, p.y, (rr) => rr === r) || g.nearestJunk(p.x, p.y, r) ||
          g.dirt.nearestDirtyTile(p.x, p.y, (ri) => ri === r.index, 1.2) || g.dirt.dirtiestTileInRoom(r.index);
      }
      case 'build': {
        const pad = g.pads.find((pp) => pp.ent && pp.ent.id === q.id);
        return pad ? { x: pad.x, y: pad.y } : null;
      }
      case 'pad': return g.state.money > 0 ? { x: q.pad.x, y: q.pad.y } : null;
      case 'pickFood': {
        const st = g.entityById[q.target] || g.stations.find((s) => s.built);
        if (!st) return null;
        return g.player.food > 0 ? null : { x: st.pickup.x, y: st.pickup.y };
      }
      case 'serve': {
        const c = g.entityById[q.target] || g.counters.find((s) => s.built);
        if (!c) return null;
        if (g.player.food === 0 && c.stock === 0) {
          const st = g.stations.find((s) => s.built && s.stock > 0);
          if (st) return { x: st.pickup.x, y: st.pickup.y };
        }
        return { x: c.service.x, y: c.service.y };
      }
      case 'collectCash': {
        const c = g.counters.find((s) => s.built && s.cash > 0) || g.entityById[q.target];
        return c ? { x: c.cashPos.x, y: c.cashPos.y } : null;
      }
      case 'cleanTable': {
        const s = g.nearestDirtySeat(p.x, p.y);
        return s ? { x: s.table.cx, y: s.table.cy } : null;
      }
      default: return null;
    }
  }
}
