// Canvas renderer: camera, tile floors, dirt overlay, depth-sorted objects,
// fog over locked rooms, particles, flyers and in-world UI (arrow, bag gauge).

import { CELL, WALL_LIKE } from '../game/level.js';
import { FLOORS, JUNK_KINDS } from '../data/catalog.js';
import {
  rrect, shadow, shade, block, drawEmoji, outlinedText, drawFood, drawTrash, drawJunk, drawCharacter,
  drawTable, drawChair, drawCounter, drawRegister, drawBills, drawBill, drawCoin, drawStation, drawBin, drawDecor,
} from './draw.js';
import { clamp, fmtMoney } from '../util/math.js';
import { mulberry32 } from '../util/rng.js';

const WALL_H = 0.62;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, shake: 0, zoom: 1 };
    this.tileCache = new Map();
    this.maskCanvas = null;
    this.maskCtx = null;
    this.maskImage = null;
    this.quality = 'high';
    this.dprCap = 2;
    this.zoomPref = 1;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    this.W = w; this.H = h;
    // ~7.5 tiles across the smallest screen dimension
    this.S = clamp(Math.min(w, h) / 7.2, 38, 96) * this.zoomPref;
    this.tileCache.clear();
  }

  attach(game) {
    this.game = game;
    const d = game.dirt;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = d.w;
    this.maskCanvas.height = d.h;
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.maskImage = new ImageData(d.pixels, d.w, d.h);
    d.markAllDirty();
    this.cam.x = game.player.x;
    this.cam.y = game.player.y;
    this.theme = { counterTop: '#f4efe4', counterFront: game.def.theme.accent || '#c0563c', ...game.def.theme };
    this.decoRnd = mulberry32(7);
  }

  // ---------------------------------------------------------------- helpers

  sx(wx) { return (wx - this.cam.x) * this.S + this.W / 2 + this.shakeX; }
  sy(wy, wz = 0) { return (wy - this.cam.y) * this.S + this.H * 0.52 - wz * this.S + this.shakeY; }

  floorTile(styleKey, variant) {
    const S = this.S * this.dpr;
    const key = styleKey + '|' + variant + '|' + Math.round(S);
    let c = this.tileCache.get(key);
    if (c) return c;
    const size = Math.ceil(S) + 1;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    paintFloor(x, FLOORS[styleKey] || FLOORS.concrete, size, variant);
    this.tileCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- main render

  render(game, dt, input) {
    const ctx = this.ctx;
    const S = this.S;
    const map = game.map;
    // camera
    const p = game.player;
    const k = 1 - Math.exp(-dt * 6);
    this.cam.x += (p.x - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;
    const halfW = this.W / 2 / S, halfH = this.H / 2 / S;
    this.cam.x = map.w > halfW * 2 - 1 ? clamp(this.cam.x, halfW - 1.5, map.w - halfW + 1.5) : map.w / 2;
    this.cam.y = map.h > halfH * 2 - 1 ? clamp(this.cam.y, halfH - 1.5, map.h - halfH + 2.5) : map.h / 2;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.5);
    const sh = this.cam.shake * S * 0.3;
    this.shakeX = sh ? (Math.random() - 0.5) * sh : 0;
    this.shakeY = sh ? (Math.random() - 0.5) * sh : 0;

    const x0 = Math.max(0, Math.floor(this.cam.x - halfW - 1)), x1 = Math.min(map.w - 1, Math.ceil(this.cam.x + halfW + 1));
    const y0 = Math.max(0, Math.floor(this.cam.y - halfH - 1)), y1 = Math.min(map.h - 1, Math.ceil(this.cam.y + halfH + 2));
    game.view = { x0: x0 - 0.5, x1: x1 + 0.5, y0: y0 - 0.5, y1: y1 + 0.5 };

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = game.def.theme.void || '#55606e';
    ctx.fillRect(0, 0, this.W, this.H);

    this.drawFloors(game, x0, x1, y0, y1);
    this.drawDirt(game, x0, x1, y0, y1);
    this.drawPads(game);
    this.drawSorted(game, x0, x1, y0, y1);
    this.drawFog(game, x0, x1, y0, y1);
    this.drawFlyers(game);
    this.drawParticles(game);
    this.drawOverlay(game, dt);
    if (input) this.drawJoystick(input);
  }

  drawFloors(game, x0, x1, y0, y1) {
    const ctx = this.ctx, S = this.S, map = game.map;
    const ext = game.def.theme.ext || 'pavement';
    const step = S;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = map.cell[map.idx(tx, ty)];
        let style = null;
        if (c === CELL.FLOOR) style = map.rooms[map.roomIdx[map.idx(tx, ty)]].def.floor || 'concrete';
        else if (c === CELL.DOOR) style = map.rooms[map.roomIdx[map.idx(tx, ty)]].def.floor || 'concrete';
        else if (c === CELL.PAVEMENT || c === CELL.ENTRANCE) style = ext;
        else if (c === CELL.GRASS || c === CELL.TREE || c === CELL.HEDGE) style = 'grass';
        else if (c === CELL.FENCE) style = 'grass';
        else if (c === CELL.SANDX) style = 'sand';
        else if (c === CELL.WATER) {
          const t = game.time;
          ctx.fillStyle = '#3d9ad1';
          ctx.fillRect(this.sx(tx), this.sy(ty), step + 1, step + 1);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          const ox = Math.sin(t * 1.5 + tx * 0.7 + ty) * S * 0.15;
          ctx.fillRect(this.sx(tx) + S * 0.2 + ox, this.sy(ty) + S * 0.3, S * 0.3, S * 0.05);
          ctx.fillRect(this.sx(tx) + S * 0.5 - ox, this.sy(ty) + S * 0.7, S * 0.25, S * 0.05);
          continue;
        }
        if (!style) continue;
        const v = (tx * 7 + ty * 13) & 3;
        const img = this.floorTile(style, v);
        ctx.drawImage(img, this.sx(tx), this.sy(ty), step + 0.6, step + 0.6);
        if (c === CELL.ENTRANCE) {
          ctx.fillStyle = '#7a4e2d';
          rrect(ctx, this.sx(tx) + S * 0.08, this.sy(ty) + S * 0.15, S * 0.84, S * 0.7, S * 0.08); ctx.fill();
          ctx.fillStyle = '#a06a3c';
          rrect(ctx, this.sx(tx) + S * 0.14, this.sy(ty) + S * 0.21, S * 0.72, S * 0.58, S * 0.06); ctx.fill();
        }
      }
    }
  }

  drawDirt(game, x0, x1, y0, y1) {
    const d = game.dirt;
    if (d.dirty.any) {
      const r = d.dirty;
      this.maskCtx.putImageData(this.maskImage, 0, 0, r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1);
      r.any = false;
    }
    const ctx = this.ctx;
    const res = d.res;
    ctx.imageSmoothingEnabled = true;
    const sx0 = x0 * res, sy0 = y0 * res;
    const sw = (x1 - x0 + 1) * res, sh = (y1 - y0 + 1) * res;
    ctx.drawImage(this.maskCanvas, sx0, sy0, sw, sh, this.sx(x0), this.sy(y0), (x1 - x0 + 1) * this.S, (y1 - y0 + 1) * this.S);
  }

  drawPads(game) {
    const ctx = this.ctx, S = this.S;
    const t = game.time;
    for (const pad of game.pads) {
      const x = this.sx(pad.x), y = this.sy(pad.y);
      if (x < -S || y < -S || x > this.W + S || y > this.H + S) continue;
      const paid = game.padPaid(pad);
      const prog = pad.cost > 0 ? paid / pad.cost : 1;
      const on = game.padOn === pad;
      const afford = game.state.money >= pad.cost - paid;
      const pulse = afford ? 1 + Math.sin(t * 5) * 0.04 : 1;
      const sz = S * 0.9 * pulse * (on ? 1.08 : 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(20,30,40,0.45)';
      rrect(ctx, -sz / 2, -sz / 2, sz, sz, S * 0.14); ctx.fill();
      if (prog > 0) {
        ctx.save();
        rrect(ctx, -sz / 2, -sz / 2, sz, sz, S * 0.14); ctx.clip();
        ctx.fillStyle = 'rgba(80,220,120,0.75)';
        ctx.fillRect(-sz / 2, sz / 2 - sz * prog, sz, sz * prog);
        ctx.restore();
      }
      ctx.setLineDash([S * 0.1, S * 0.07]);
      ctx.lineDashOffset = -t * S * 0.3;
      ctx.lineWidth = Math.max(2, S * 0.05);
      ctx.strokeStyle = afford ? '#ffffff' : 'rgba(255,255,255,0.6)';
      rrect(ctx, -sz / 2, -sz / 2, sz, sz, S * 0.14); ctx.stroke();
      ctx.setLineDash([]);
      drawEmoji(ctx, pad.icon, 0, -S * 0.1, S * 0.38);
      outlinedText(ctx, fmtMoney(Math.ceil(pad.cost - paid)), 0, S * 0.24, S * 0.22, afford ? '#ffffff' : '#ffb3b3');
      ctx.restore();
    }
  }

  drawSorted(game, x0, x1, y0, y1) {
    const ctx = this.ctx, S = this.S, map = game.map;
    const list = [];
    const add = (y, fn) => list.push({ y, fn });
    const p = game.player;
    // static map objects
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = map.idx(tx, ty);
        const c = map.cell[i];
        if (WALL_LIKE.has(c)) {
          const below = map.cellAt(tx, ty + 1);
          const showFront = !WALL_LIKE.has(below);
          const fade = p.x > tx - 0.4 && p.x < tx + 1.4 && p.y < ty + 0.1 && p.y > ty - 1.3;
          add(ty + 1, () => this.drawWall(tx, ty, c, showFront, fade, game));
        } else if (c === CELL.DOOR && map.locked[i]) {
          add(ty + 1, () => this.drawBarrier(tx, ty, map));
        } else if (c === CELL.TREE) {
          add(ty + 0.9, () => this.drawTree(tx, ty));
        } else if (c === CELL.HEDGE) {
          add(ty + 1, () => { block(ctx, this.sx(tx), this.sy(ty), S + 0.5, S, S * 0.45, '#4f9a45', '#3d7d36', S * 0.12); });
        } else if (c === CELL.FENCE) {
          add(ty + 0.7, () => this.drawFence(tx, ty, map));
        }
      }
    }
    // entities
    const inView = (x, y) => x > x0 - 2 && x < x1 + 2 && y > y0 - 2 && y < y1 + 3;
    for (const e of game.entities) {
      if (!e.built || !inView(e.x, e.y)) continue;
      const pop = e.pop > 0 ? 1 + Math.sin(e.pop * Math.PI) * 0.18 : 1;
      if (e.type === 'table') {
        for (const s of e.seats) add(s.y - 0.02, () => drawChair(ctx, this.sx(s.x), this.sy(s.y), S, this.theme.chair || '#c27a4a', s.face));
        add(e.y + 0.5, () => this.withPop(e, pop, () => this.drawTableObj(e, game)));
      } else if (e.type === 'counter') {
        add(e.sortY, () => this.withPop(e, pop, () => this.drawCounterObj(e, game)));
      } else if (e.type === 'station') {
        add(e.y + 1, () => this.withPop(e, pop, () => this.drawStationObj(e, game)));
      } else if (e.type === 'bin') {
        add(e.y + 1, () => this.withPop(e, pop, () => drawBin(ctx, e, this.sx(e.x), this.sy(e.y), S)));
      } else if (e.type === 'decor') {
        add(e.kind.blocks ? e.y + 0.9 : e.y - 0.4, () => this.withPop(e, pop, () => drawDecor(ctx, e, this.sx(e.cx), this.sy(e.cy), S, game.time)));
      }
    }
    // floor items
    for (const t of game.trash) {
      if (t.gone || !inView(t.x, t.y)) continue;
      add(t.y - 0.25, () => {
        let x = t.x, y = t.y, z = 0;
        if (t.pop > 0 && t.popFrom) {
          const u = 1 - t.pop;
          x = t.popFrom.x + (t.x - t.popFrom.x) * u; y = t.popFrom.y + (t.y - t.popFrom.y) * u;
          z = Math.sin(u * Math.PI) * 0.8;
        }
        drawTrash(ctx, t.kind, this.sx(x), this.sy(y, z), S, t.rot);
      });
    }
    for (const j of game.junk) {
      if (!inView(j.x, j.y)) continue;
      add(j.y + 0.15, () => drawJunk(ctx, j, this.sx(j.x), this.sy(j.y), S, JUNK_KINDS[j.kind]));
    }
    // characters
    const hat = game.meta.cosmetics?.hat || 'hat_cap';
    const color = (game.meta.cosmetics?.colorValue) || '#2f6fd6';
    add(p.y, () => {
      p.look.shirt = color;
      p.look.skin = game.meta.cosmetics?.skin || '#f6d3b3';
      p.look.hair = '#5a3a22';
      p.look.pants = '#2c3e66';
      const tool = game.stats.tool.id;
      const behind = p.face.y < -0.2;
      if (behind) this.drawCarryStack(p, game);
      drawCharacter(ctx, p, this.sx(p.x), this.sy(p.y), S, {
        hat, hatColor: '#ffcc33', bag: Math.min(1, p.bag.length / game.stats.bagCap), bagFull: p.bag.length >= game.stats.bagCap,
        tool: tool === 'scrubber' ? null : tool, ride: tool === 'scrubber',
      });
      if (!behind) this.drawCarryStack(p, game);
    });
    for (const c of game.customers) {
      if (!inView(c.x, c.y)) continue;
      add(c.y, () => {
        drawCharacter(ctx, c, this.sx(c.x), this.sy(c.y), S, { sitting: c.state === 'eat', angry: c.angry, tray: c.food > 0 && c.state !== 'eat' });
        if (c.food > 0 && c.state !== 'eat') this.drawCarryStack(c, game, c.food);
      });
    }
    for (const s of game.staff) {
      if (!inView(s.x, s.y)) continue;
      add(s.y, () => {
        const o = { hat: 'hat_cap', hatColor: shade(s.look.shirt, 0.7), apron: s.role === 'server' ? '#ffffff' : null };
        if (s.role === 'cleaner') { o.bag = Math.min(1, s.bag.length / (game.stats.staffCap * 3)); o.tool = 'mop'; }
        if (s.role === 'cashier') { o.apron = '#e9f7ee'; o.hatColor = '#1f7a45'; }
        const behind = s.face.y < -0.2;
        if (s.food > 0 && behind) this.drawCarryStack(s, game);
        drawCharacter(ctx, s, this.sx(s.x), this.sy(s.y), S, o);
        if (s.food > 0 && !behind) this.drawCarryStack(s, game);
      });
    }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.fn();
  }

  withPop(e, pop, fn) {
    if (pop === 1) { fn(); return; }
    const ctx = this.ctx;
    const cx = this.sx(e.cx), cy = this.sy(e.cy + 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, 2 - pop);
    ctx.translate(-cx, -cy);
    fn();
    ctx.restore();
  }

  drawCarryStack(a, game, n = a.food) {
    const ctx = this.ctx, S = this.S;
    if (!n) return;
    const x = this.sx(a.x + a.face.x * 0.3), y = this.sy(a.y + a.face.y * 0.22, 0.42);
    const vis = Math.min(n, 10);
    ctx.fillStyle = '#c9ced6';
    rrect(ctx, x - S * 0.2, y - S * 0.02, S * 0.4, S * 0.07, S * 0.03); ctx.fill();
    for (let i = 0; i < vis; i++) drawFood(ctx, game.def.product.id, x, y - S * 0.06 - i * S * 0.1, S * 0.26);
  }

  drawWall(tx, ty, c, showFront, fade, game) {
    const ctx = this.ctx, S = this.S;
    const th = game.def.theme;
    const x = this.sx(tx), y = this.sy(ty);
    const h = S * WALL_H;
    if (fade) ctx.globalAlpha = 0.45;
    if (showFront) {
      ctx.fillStyle = th.wallFront;
      ctx.fillRect(x, y + S - h, S + 0.6, h);
      // bricks
      ctx.strokeStyle = th.wallLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 1; r < 3; r++) { ctx.moveTo(x, y + S - h + (h * r) / 3); ctx.lineTo(x + S, y + S - h + (h * r) / 3); }
      for (let r = 0; r < 3; r++) {
        const off = r % 2 ? S / 4 : 0;
        for (let k = off; k < S; k += S / 2) { ctx.moveTo(x + k, y + S - h + (h * r) / 3); ctx.lineTo(x + k, y + S - h + (h * (r + 1)) / 3); }
      }
      ctx.stroke();
      if (c === CELL.WINDOW) {
        ctx.fillStyle = '#9fd6f0';
        rrect(ctx, x + S * 0.15, y + S - h + h * 0.15, S * 0.7, h * 0.6, 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(x + S * 0.22, y + S - h + h * 0.22, S * 0.12, h * 0.4);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y + S - S * 0.05, S + 0.6, S * 0.05);
    }
    ctx.fillStyle = th.wallTop;
    ctx.fillRect(x, y - h, S + 0.6, S + 0.6);
    ctx.globalAlpha = 1;
  }

  drawBarrier(tx, ty, map) {
    const ctx = this.ctx, S = this.S;
    const x = this.sx(tx), y = this.sy(ty);
    block(ctx, x + S * 0.04, y + S * 0.3, S * 0.92, S * 0.4, S * 0.55, '#a87543', '#7a5230', 3);
    ctx.strokeStyle = '#5c3b1e'; ctx.lineWidth = Math.max(2, S * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + S * 0.1, y + S * 0.15); ctx.lineTo(x + S * 0.9, y + S * 0.6);
    ctx.moveTo(x + S * 0.9, y + S * 0.15); ctx.lineTo(x + S * 0.1, y + S * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#ffcf3a';
    ctx.fillRect(x + S * 0.04, y + S * 0.62, S * 0.92, S * 0.06);
  }

  drawTree(tx, ty) {
    const ctx = this.ctx, S = this.S;
    const x = this.sx(tx + 0.5), y = this.sy(ty + 0.7);
    shadow(ctx, x, y, S * 0.45, S * 0.18, 0.25);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(x - S * 0.07, y - S * 0.5, S * 0.14, S * 0.5);
    ctx.fillStyle = '#3f8f3a';
    ctx.beginPath(); ctx.arc(x, y - S * 0.85, S * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#56ab4b';
    ctx.beginPath(); ctx.arc(x - S * 0.12, y - S * 0.98, S * 0.27, 0, Math.PI * 2); ctx.fill();
  }

  drawFence(tx, ty, map) {
    const ctx = this.ctx, S = this.S;
    const x = this.sx(tx), y = this.sy(ty + 0.5);
    const h = S * 0.38;
    const horiz = map.cellAt(tx - 1, ty) === CELL.FENCE || map.cellAt(tx + 1, ty) === CELL.FENCE;
    ctx.fillStyle = '#e8dcc0';
    if (horiz) {
      ctx.fillRect(x, y - h * 0.8, S + 0.6, S * 0.07);
      ctx.fillRect(x, y - h * 0.4, S + 0.6, S * 0.07);
      for (const k of [0.15, 0.85]) { ctx.fillStyle = '#d6c7a3'; ctx.fillRect(x + S * k - S * 0.05, y - h, S * 0.1, h); }
    } else {
      ctx.fillStyle = '#d6c7a3';
      ctx.fillRect(x + S * 0.45, this.sy(ty) - h, S * 0.1, S + h * 0.3);
    }
  }

  drawTableObj(e, game) {
    const ctx = this.ctx, S = this.S;
    const x = this.sx(e.x), y = this.sy(e.y);
    drawTable(ctx, x, y, S, this.theme.table || '#e9d8b8', this.theme.tableLeg || '#6b4a2d');
    const topY = y + S * 0.06 - S * 0.21 - S * 0.06;
    for (const s of e.seats) {
      const ox = (s.x - e.cx) * S * 0.24, oy = (s.y - e.cy) * S * 0.18;
      if (s.mess) {
        drawTrash(ctx, (s.mess.kinds && s.mess.kinds[0]) || 'plate', x + S / 2 + ox, topY + S * 0.42 + oy, S * 0.85, s.i);
        if (s.mess.n > 1) drawTrash(ctx, s.mess.kinds[1] || 'cup', x + S / 2 + ox * 0.4, topY + S * 0.32 + oy, S * 0.7, s.i + 2);
      } else if (s.occupant && s.occupant.state === 'eat') {
        drawFood(ctx, game.def.product.id, x + S / 2 + ox, topY + S * 0.32 + oy, S * 0.3);
      }
    }
    if (e.dirty) {
      const bob = Math.sin(game.time * 4 + e.x) * S * 0.05;
      drawEmoji(ctx, '🧽', x + S / 2, y - S * 0.45 + bob, S * 0.3);
    }
  }

  drawCounterObj(e, game) {
    const ctx = this.ctx, S = this.S;
    const xs = e.tiles.map((t) => t[0]), ys = e.tiles.map((t) => t[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const x = this.sx(minx), y = this.sy(miny);
    const w = (maxx - minx + 1) * S, h = (maxy - miny + 1) * S;
    drawCounter(ctx, x, y, w, h, S, this.theme);
    const topY = -0.55;
    // stock of food on the counter
    const sp = e.stockPos;
    const n = Math.min(e.stock, 12);
    for (let i = 0; i < n; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      drawFood(ctx, game.def.product.id, this.sx(sp.x - 0.22 + col * 0.22), this.sy(sp.y + 0.05, -topY + row * 0.12) , S * 0.28);
    }
    // register + cash
    drawRegister(ctx, this.sx(e.cashPos.x), this.sy(e.cashPos.y - 0.1, -topY), S);
    if (e.cash > 0.5) drawBills(ctx, this.sx(e.cashPos.x + 0.1), this.sy(e.cashPos.y + 0.22, -topY), S, e.cash);
    if (e.cash > 0.5) {
      const bob = Math.sin(game.time * 5) * S * 0.04;
      outlinedText(ctx, fmtMoney(e.cash), this.sx(e.cashPos.x), this.sy(e.cashPos.y, 1.25) + bob, S * 0.22, '#9dffb0');
    }
  }

  drawStationObj(e, game) {
    const ctx = this.ctx, S = this.S;
    const x = this.sx(e.x), y = this.sy(e.y);
    drawStation(ctx, e, x, y, S, game.def.product.id, game.time);
    // output stack in front
    const n = Math.min(e.stock, 8);
    const fx = this.sx(e.cx + e.f.x * 0.42), fy = this.sy(e.cy + e.f.y * 0.42, 0.3);
    for (let i = 0; i < n; i++) drawFood(ctx, game.def.product.id, fx + ((i % 2) - 0.5) * S * 0.2, fy - Math.floor(i / 2) * S * 0.1, S * 0.26);
    // progress ring
    if (e.stock < game.stats.stationStock) {
      const cx = this.sx(e.cx), cy = this.sy(e.y, 1.25);
      ctx.lineWidth = Math.max(2, S * 0.05);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(cx, cy, S * 0.13, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#7dff8a';
      ctx.beginPath(); ctx.arc(cx, cy, S * 0.13, -Math.PI / 2, -Math.PI / 2 + e.t * Math.PI * 2); ctx.stroke();
    } else {
      outlinedText(ctx, 'MAX', this.sx(e.cx), this.sy(e.y, 1.2), S * 0.18, '#ffe066');
    }
  }

  drawFog(game, x0, x1, y0, y1) {
    const ctx = this.ctx, S = this.S, map = game.map;
    const fog = game.def.theme.fog || '#1d1a24';
    for (const r of map.rooms) {
      if (r.unlocked && r.reveal <= 0) continue;
      if (r.maxX < x0 - 1 || r.minX > x1 + 1 || r.maxY < y0 - 1 || r.minY > y1 + 1) continue;
      const a = r.unlocked ? 0.9 * r.reveal : 0.9;
      ctx.globalAlpha = a;
      ctx.fillStyle = fog;
      for (const i of r.cells) {
        const tx = i % map.w, ty = (i / map.w) | 0;
        if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
        ctx.fillRect(this.sx(tx) - 0.5, this.sy(ty) - 0.5 - (map.cellAt(tx, ty - 1) === CELL.WALL ? 0 : 0), S + 1.5, S + 1.5);
      }
      ctx.globalAlpha = 1;
      if (!r.unlocked) {
        const cx = this.sx(r.cx), cy = this.sy(r.cy);
        const bob = Math.sin(game.time * 2 + r.index) * S * 0.05;
        drawEmoji(ctx, '🔒', cx, cy - S * 0.35 + bob, S * 0.55);
        outlinedText(ctx, r.name, cx, cy + S * 0.25, S * 0.3, '#ffffff');
        outlinedText(ctx, fmtMoney(r.cost), cx, cy + S * 0.62, S * 0.24, '#ffe066');
      }
    }
  }

  drawFlyers(game) {
    const ctx = this.ctx, S = this.S;
    for (const f of game.flyers) {
      const to = typeof f.to === 'function' ? f.to() : f.to;
      const t = f.t;
      const e = t * t * (3 - 2 * t);
      const x = f.x0 + (to.x - f.x0) * e;
      const y = f.y0 + (to.y - f.y0) * e;
      const z = f.z0 + ((to.z ?? 0) - f.z0) * e + Math.sin(t * Math.PI) * f.arc;
      const px = this.sx(x), py = this.sy(y, z);
      const sc = f.type === 'trash' ? 1 - t * 0.35 : 1;
      if (f.type === 'trash') drawTrash(ctx, f.data.kind || 'paper', px, py, S * sc, (f.data.rot || 0) + t * 6);
      else if (f.type === 'food') drawFood(ctx, game.def.product.id, px, py, S * 0.28);
      else if (f.type === 'bill') drawBill(ctx, px, py, S, t * 8);
      else if (f.type === 'coin') drawCoin(ctx, px, py, S);
    }
  }

  drawParticles(game) {
    const ctx = this.ctx, S = this.S;
    for (const p of game.fx.list) {
      const x = this.sx(p.x), y = this.sy(p.y, p.z);
      const a = Math.max(0, p.life / p.max);
      const s = p.size * S;
      switch (p.type) {
        case 'bubble':
          ctx.globalAlpha = a;
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = 1.2;
          ctx.fillStyle = 'rgba(200,235,255,0.35)';
          ctx.beginPath(); ctx.arc(x + Math.sin(p.life * 12) * s * 0.5, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          break;
        case 'spark': {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          const r = s * (0.6 + Math.sin(p.life * 20) * 0.4);
          ctx.beginPath();
          ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.4, y - r * 0.4); ctx.lineTo(x + r * 2, y);
          ctx.lineTo(x + r * 0.4, y + r * 0.4); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.4, y + r * 0.4);
          ctx.lineTo(x - r * 2, y); ctx.lineTo(x - r * 0.4, y - r * 0.4); ctx.closePath(); ctx.fill();
          break;
        }
        case 'dust':
          ctx.globalAlpha = a * 0.7;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(x, y, s * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill();
          break;
        case 'confetti':
        case 'plank':
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-s, -s * (p.type === 'plank' ? 0.35 : 0.5), s * 2, s * (p.type === 'plank' ? 0.7 : 1));
          ctx.restore();
          break;
        case 'ring':
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(2, S * 0.06 * a);
          ctx.beginPath(); ctx.ellipse(x, y, s * S * (1 - a) * 0.8 + S * 0.1, s * S * (1 - a) * 0.5 + S * 0.06, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'drop':
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
          break;
        default:
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of game.fx.texts) {
      const a = Math.min(1, t.life / t.max * 2);
      ctx.globalAlpha = a;
      const pop = t.life > t.max - 0.15 ? 1 + (t.life - (t.max - 0.15)) * 3 : 1;
      outlinedText(ctx, t.str, this.sx(t.x), this.sy(t.y, t.z), S * 0.26 * t.size * pop, t.color);
    }
    ctx.globalAlpha = 1;
  }

  drawOverlay(game, dt) {
    const ctx = this.ctx, S = this.S;
    const p = game.player;
    // emotes
    for (const a of [...game.customers, ...game.staff, p]) {
      if (!a.emote || a.emoteT <= 0) continue;
      const x = this.sx(a.x), y = this.sy(a.y, 1.45);
      if (x < -S || x > this.W + S || y < -S || y > this.H + S) continue;
      const pop = Math.min(1, (1.6 - a.emoteT) * 6 + 0.3);
      ctx.globalAlpha = Math.min(1, a.emoteT * 3);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.arc(x, y, S * 0.22 * pop, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - S * 0.06, y + S * 0.18); ctx.lineTo(x, y + S * 0.3); ctx.lineTo(x + S * 0.08, y + S * 0.17); ctx.fill();
      drawEmoji(ctx, a.emote, x, y, S * 0.28 * pop);
      ctx.globalAlpha = 1;
    }
    // customers in queue show what they want
    for (const c of game.customers) {
      if (c.state !== 'queue' || !c.atFront) continue;
      const x = this.sx(c.x + 0.42), y = this.sy(c.y, 1.25);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      rrect(ctx, x - S * 0.22, y - S * 0.17, S * 0.48, S * 0.34, S * 0.1); ctx.fill();
      drawFood(ctx, game.def.product.id, x - S * 0.06, y, S * 0.22);
      outlinedText(ctx, `${c.order - c.got}`, x + S * 0.14, y + S * 0.02, S * 0.18, '#ffffff', '#333');
    }
    // bag gauge above the player
    const cap = game.stats.bagCap;
    const n = p.bag.length;
    if (n > 0) {
      const full = n >= cap;
      const x = this.sx(p.x), y = this.sy(p.y, 1.42 + (p.food > 0 ? 0.25 + Math.min(p.food, 10) * 0.1 : 0));
      const w = S * 0.9, h = S * 0.26;
      ctx.fillStyle = full ? 'rgba(210,50,50,0.92)' : 'rgba(25,30,40,0.75)';
      rrect(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = full ? '#ffb0a8' : '#7ddc8f';
      rrect(ctx, x - w / 2 + 2, y - h / 2 + 2, (w - 4) * (n / cap), h - 4, (h - 4) / 2); ctx.fill();
      outlinedText(ctx, full ? 'PLEIN' : `${n}/${cap}`, x, y + 1, S * 0.17, '#fff', 'rgba(0,0,0,0.6)');
    }
    // guidance arrow
    const hint = game.hint(dt);
    if (hint) this.drawHintArrow(hint, game);
  }

  drawHintArrow(h, game) {
    const ctx = this.ctx, S = this.S;
    const x = this.sx(h.x), y = this.sy(h.y, 0);
    const m = S * 0.6;
    const p = game.player;
    const onScreen = x > m && x < this.W - m && y > m + 60 && y < this.H - m;
    const t = game.time;
    if (onScreen) {
      if (Math.hypot(h.x - p.x, h.y - p.y) < 0.8) return;
      const bob = Math.abs(Math.sin(t * 5)) * S * 0.18;
      const ay = y - S * 0.9 - bob;
      ctx.fillStyle = '#ffdd33';
      ctx.strokeStyle = '#7a4b00';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, ay + S * 0.35);
      ctx.lineTo(x - S * 0.25, ay);
      ctx.lineTo(x - S * 0.1, ay);
      ctx.lineTo(x - S * 0.1, ay - S * 0.25);
      ctx.lineTo(x + S * 0.1, ay - S * 0.25);
      ctx.lineTo(x + S * 0.1, ay);
      ctx.lineTo(x + S * 0.25, ay);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (h.label) outlinedText(ctx, h.label, x, ay - S * 0.45, S * 0.22, '#ffdd33');
    } else {
      const px = this.sx(p.x), py = this.sy(p.y, 0.5);
      const ang = Math.atan2(y - py, x - px);
      const R = Math.min(this.W, this.H) * 0.36;
      let ax = px + Math.cos(ang) * R, ay = py + Math.sin(ang) * R;
      ax = clamp(ax, m, this.W - m); ay = clamp(ay, m + 70, this.H - m - 40);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffdd33';
      ctx.strokeStyle = '#7a4b00';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(S * 0.35, 0); ctx.lineTo(-S * 0.2, -S * 0.25); ctx.lineTo(-S * 0.08, 0); ctx.lineTo(-S * 0.2, S * 0.25);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  drawJoystick(input) {
    const j = input.joy;
    if (!j.active) return;
    const ctx = this.ctx;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(j.ox, j.oy, j.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(j.ox + j.dx * j.radius, j.oy + j.dy * j.radius, j.radius * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ floor painting

function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

function paintFloor(x, f, s, v) {
  const rnd = mulberry32(v * 977 + s);
  x.fillStyle = f.c1;
  x.fillRect(0, 0, s, s);
  const h = s / 2;
  switch (f.kind) {
    case 'checker':
      x.fillStyle = f.c2;
      x.fillRect(0, 0, h, h);
      x.fillRect(h, h, h, h);
      x.fillStyle = 'rgba(255,255,255,0.08)';
      x.fillRect(0, 0, s, 2);
      break;
    case 'tiles':
      x.strokeStyle = f.c2; x.lineWidth = Math.max(1, s * 0.03);
      x.strokeRect(0, 0, h, h); x.strokeRect(h, 0, h, h); x.strokeRect(0, h, h, h); x.strokeRect(h, h, h, h);
      x.fillStyle = 'rgba(255,255,255,0.1)';
      x.fillRect(s * 0.06, s * 0.06, h * 0.5, s * 0.03);
      break;
    case 'wood': {
      const n = 3;
      for (let i = 0; i < n; i++) {
        x.fillStyle = i % 2 ? f.c2 : f.c1;
        x.globalAlpha = 0.85 + rnd() * 0.15;
        x.fillRect(0, (i * s) / n, s, s / n);
        x.globalAlpha = 1;
        x.fillStyle = 'rgba(0,0,0,0.18)';
        x.fillRect(0, ((i + 1) * s) / n - 1, s, 1.2);
        const cut = (rnd() * 0.8 + 0.1) * s;
        x.fillRect(cut, (i * s) / n, 1.2, s / n);
      }
      break;
    }
    case 'deck': {
      const n = 4;
      for (let i = 0; i < n; i++) {
        x.fillStyle = i % 2 ? f.c2 : f.c1;
        x.fillRect((i * s) / n, 0, s / n, s);
        x.fillStyle = 'rgba(0,0,0,0.22)';
        x.fillRect(((i + 1) * s) / n - 1.5, 0, 1.5, s);
      }
      break;
    }
    case 'grass':
      for (let i = 0; i < 10; i++) {
        x.fillStyle = rnd() < 0.5 ? f.c2 : '#8fd07a';
        const gx = rnd() * s, gy = rnd() * s;
        x.fillRect(gx, gy, Math.max(1, s * 0.03), s * 0.08);
      }
      break;
    case 'marble':
      x.strokeStyle = f.c2; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, rnd() * s); x.bezierCurveTo(s * 0.3, rnd() * s, s * 0.6, rnd() * s, s, rnd() * s); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.08)'; x.strokeRect(0, 0, s, s);
      break;
    case 'tatami':
      x.fillStyle = f.c2;
      if (v % 2) { x.fillRect(0, 0, s, s * 0.06); x.fillRect(0, s * 0.94, s, s * 0.06); }
      else { x.fillRect(0, 0, s * 0.06, s); x.fillRect(s * 0.94, 0, s * 0.06, s); }
      x.strokeStyle = 'rgba(0,0,0,0.06)';
      for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(0, (i * s) / 8); x.lineTo(s, (i * s) / 8); x.stroke(); }
      break;
    case 'carpet':
      x.fillStyle = f.c2;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) { x.beginPath(); x.arc((i + 0.5) * s / 4, (j + 0.5) * s / 4, s * 0.04, 0, Math.PI * 2); x.fill(); }
      break;
    case 'sand':
      for (let i = 0; i < 14; i++) { x.fillStyle = rnd() < 0.5 ? f.c2 : '#f5e6bd'; x.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); }
      break;
    case 'cobble':
      x.fillStyle = f.c2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        x.beginPath(); x.ellipse((i + 0.5) * h + (j % 2) * s * 0.05, (j + 0.5) * h, h * 0.42, h * 0.36, rnd(), 0, Math.PI * 2); x.fill();
      }
      break;
    case 'concrete':
    default:
      for (let i = 0; i < 12; i++) { x.fillStyle = rnd() < 0.5 ? f.c2 : 'rgba(255,255,255,0.12)'; x.fillRect(rnd() * s, rnd() * s, 2, 2); }
      x.strokeStyle = 'rgba(0,0,0,0.07)'; x.strokeRect(0, 0, s, s);
      break;
  }
}

export { hash };
