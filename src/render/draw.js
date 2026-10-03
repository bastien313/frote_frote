// Procedural drawing primitives and sprites (no image assets).
// Conventions: (x, y) are screen pixels of the object's ground anchor,
// S = pixels per tile. Heights go upward (negative y).

export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif";

export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shadow(ctx, cx, cy, rx, ry, a = 0.22) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Shade a #rrggbb colour by factor (<1 darker, >1 lighter). */
const shadeCache = new Map();
export function shade(hex, f) {
  const k = hex + f;
  let v = shadeCache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 1) { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  else { r *= f; g *= f; b *= f; }
  v = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(k, v);
  return v;
}

/** Oblique block: footprint (x,y,w,h) in px, extruded upward by hpx. */
export function block(ctx, x, y, w, h, hpx, top, front, radius = 0) {
  // front face
  ctx.fillStyle = front;
  if (radius > 0) { rrect(ctx, x, y + h - hpx - 1, w, hpx + 1, radius); ctx.fill(); }
  else ctx.fillRect(x, y + h - hpx, w, hpx);
  // top face
  ctx.fillStyle = top;
  if (radius > 0) { rrect(ctx, x, y - hpx, w, h, radius); ctx.fill(); }
  else ctx.fillRect(x, y - hpx, w, h);
}

// ------------------------------------------------------------------ emoji cache

const emojiCache = new Map();
export function emoji(ch, size) {
  size = Math.max(8, Math.round(size));
  const key = ch + '|' + size;
  let c = emojiCache.get(key);
  if (c) return c;
  if (emojiCache.size > 400) emojiCache.clear();
  c = document.createElement('canvas');
  const pad = Math.ceil(size * 0.25);
  c.width = c.height = size + pad * 2;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",${FONT}`;
  x.fillText(ch, c.width / 2, c.height / 2 + size * 0.06);
  emojiCache.set(key, c);
  return c;
}

export function drawEmoji(ctx, ch, cx, cy, size) {
  const c = emoji(ch, size);
  ctx.drawImage(c, cx - c.width / 2, cy - c.height / 2);
}

export function outlinedText(ctx, str, x, y, size, fill = '#fff', stroke = 'rgba(0,0,0,0.75)', weight = 800) {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.22);
  ctx.strokeStyle = stroke;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

// ------------------------------------------------------------------ products

export const PRODUCT_EMOJI = {
  burger: '🍔', coffee: '☕', pizza: '🍕', sushi: '🍣', hotdog: '🌭', crepe: '🥞', taco: '🌮', cake: '🍰',
  icecream: '🍦', fries: '🍟', donut: '🍩', noodles: '🍜',
};

export function drawFood(ctx, product, cx, cy, size) {
  drawEmoji(ctx, PRODUCT_EMOJI[product] || '🍔', cx, cy, size);
}

// ------------------------------------------------------------------ trash

export function drawTrash(ctx, kind, x, y, S, rot = 0) {
  const s = S * 0.3;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 0, s * 0.25, s * 0.55, s * 0.22, 0.2);
  ctx.rotate(Math.sin(rot) * 0.5);
  switch (kind) {
    case 'bag':
      ctx.fillStyle = '#2b2d33';
      ctx.beginPath(); ctx.ellipse(0, -s * 0.15, s * 0.6, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d4049';
      ctx.beginPath(); ctx.ellipse(-s * 0.15, -s * 0.3, s * 0.25, s * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8c547';
      ctx.fillRect(-s * 0.1, -s * 0.72, s * 0.2, s * 0.14);
      break;
    case 'box':
      ctx.fillStyle = '#b8864f'; ctx.fillRect(-s * 0.45, -s * 0.5, s * 0.9, s * 0.6);
      ctx.fillStyle = '#d3a26a'; ctx.fillRect(-s * 0.45, -s * 0.72, s * 0.9, s * 0.25);
      ctx.fillStyle = '#8f6236'; ctx.fillRect(-s * 0.06, -s * 0.72, s * 0.12, s * 0.25);
      break;
    case 'can':
      ctx.fillStyle = '#d63a3a'; rrect(ctx, -s * 0.38, -s * 0.28, s * 0.76, s * 0.36, s * 0.12); ctx.fill();
      ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.ellipse(s * 0.38, -s * 0.1, s * 0.08, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.2, -s * 0.2, s * 0.25, s * 0.06);
      break;
    case 'paper':
      ctx.fillStyle = '#f2f2ec';
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, r = s * (0.3 + (i % 2) * 0.13);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8 - s * 0.15);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9c9c0'; ctx.lineWidth = 1; ctx.stroke();
      break;
    case 'bottle':
      ctx.fillStyle = 'rgba(60,160,90,0.95)'; rrect(ctx, -s * 0.5, -s * 0.28, s * 0.75, s * 0.3, s * 0.12); ctx.fill();
      ctx.fillRect(s * 0.2, -s * 0.2, s * 0.3, s * 0.14);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-s * 0.4, -s * 0.24, s * 0.45, s * 0.06);
      break;
    case 'banana':
      ctx.strokeStyle = '#f2cf3a'; ctx.lineWidth = s * 0.22; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.45, 0.4, Math.PI - 0.4); ctx.stroke();
      ctx.strokeStyle = '#6b4a1a'; ctx.lineWidth = s * 0.08;
      ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.45, 0.35, 0.45); ctx.stroke();
      break;
    case 'cup':
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.6); ctx.lineTo(s * 0.3, -s * 0.6); ctx.lineTo(s * 0.2, 0); ctx.lineTo(-s * 0.2, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e04848'; ctx.fillRect(-s * 0.27, -s * 0.4, s * 0.52, s * 0.14);
      break;
    case 'bone':
      ctx.fillStyle = '#efe6d2';
      ctx.fillRect(-s * 0.35, -s * 0.22, s * 0.7, s * 0.14);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * s * 0.38, -s * 0.15 + sy * s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'leaf':
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ['#b5762e', '#8c9a2e', '#c9532c'][i];
        ctx.beginPath(); ctx.ellipse((i - 1) * s * 0.25, -s * 0.12, s * 0.28, s * 0.12, i - 1, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'shell':
      ctx.fillStyle = '#f5d0c0';
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.35, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d29a86'; ctx.lineWidth = 1.2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(i * s * 0.15, -s * 0.42); ctx.stroke(); }
      break;
    case 'plate':
    default:
      ctx.fillStyle = '#f7f7f7'; ctx.beginPath(); ctx.ellipse(0, -s * 0.1, s * 0.42, s * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c7563a'; ctx.beginPath(); ctx.ellipse(s * 0.05, -s * 0.12, s * 0.16, s * 0.09, 0.4, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
}

// ------------------------------------------------------------------ junk

export function drawJunk(ctx, j, x, y, S, def) {
  const s = S * def.size;
  const sh = j.shake > 0 ? Math.sin(j.shake * 40) * j.shake * S * 0.05 : 0;
  ctx.save();
  ctx.translate(x + sh, y);
  shadow(ctx, 0, 0, s * 0.55, s * 0.22, 0.28);
  switch (def.draw) {
    case 'crate':
      block(ctx, -s * 0.42, -s * 0.42, s * 0.84, s * 0.84 * 0.6, s * 0.5, '#c89a5c', '#9c7140');
      ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.38); ctx.lineTo(s * 0.42, -s * 0.06); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.9); ctx.lineTo(-s * 0.2, -s * 0.4); ctx.stroke();
      break;
    case 'tire':
      ctx.fillStyle = '#26272b'; ctx.beginPath(); ctx.ellipse(0, -s * 0.18, s * 0.45, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a4c52'; ctx.beginPath(); ctx.ellipse(0, -s * 0.24, s * 0.4, s * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1b1e'; ctx.beginPath(); ctx.ellipse(0, -s * 0.24, s * 0.18, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'sofa':
      block(ctx, -s * 0.5, -s * 0.3, s, s * 0.45, s * 0.3, '#a8443d', '#7d302b', 4);
      block(ctx, -s * 0.5, -s * 0.55, s, s * 0.18, s * 0.5, '#bf544c', '#8f3832', 4);
      ctx.fillStyle = '#d9c2a0'; ctx.fillRect(s * 0.1, -s * 0.5, s * 0.15, s * 0.1);
      break;
    case 'fridge':
      block(ctx, -s * 0.35, -s * 0.3, s * 0.7, s * 0.5, s * 0.9, '#e8e6df', '#cfccc2', 3);
      ctx.fillStyle = '#9b6b3f'; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.4, s * 0.15, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.15, -s * 0.15, s * 0.1, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#888'; ctx.fillRect(s * 0.22, -s * 0.6, s * 0.05, s * 0.3);
      break;
    case 'mattress':
      block(ctx, -s * 0.5, -s * 0.35, s, s * 0.6, s * 0.18, '#e9e2cf', '#c9c0a8', 6);
      ctx.strokeStyle = '#9fb7d6'; ctx.lineWidth = 2;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.5 + i * s * 0.2, -s * 0.53); ctx.lineTo(-s * 0.5 + i * s * 0.2, -s * 0.0); ctx.stroke(); }
      ctx.fillStyle = 'rgba(140,110,50,0.5)'; ctx.beginPath(); ctx.ellipse(0, -s * 0.25, s * 0.2, s * 0.12, 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'tv':
      block(ctx, -s * 0.4, -s * 0.25, s * 0.8, s * 0.45, s * 0.55, '#5b4b3c', '#3f342a', 4);
      ctx.fillStyle = '#2a3b3f'; rrect(ctx, -s * 0.3, -s * 0.72 + s * 0.45, s * 0.6, s * 0.4, 4); ctx.fill();
      ctx.strokeStyle = '#8fd3d6'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.05); ctx.stroke();
      break;
    case 'barrel':
      ctx.fillStyle = '#3f6e8c'; rrect(ctx, -s * 0.3, -s * 0.8, s * 0.6, s * 0.8, s * 0.12); ctx.fill();
      ctx.fillStyle = '#5585a4'; ctx.beginPath(); ctx.ellipse(0, -s * 0.8, s * 0.3, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2d4f66'; ctx.fillRect(-s * 0.3, -s * 0.55, s * 0.6, s * 0.06); ctx.fillRect(-s * 0.3, -s * 0.25, s * 0.6, s * 0.06);
      ctx.fillStyle = '#ffcf3a'; ctx.font = `${Math.round(s * 0.25)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('☢', 0, -s * 0.35);
      break;
    case 'boat':
      ctx.fillStyle = '#8b5a2b';
      ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.4); ctx.lineTo(s * 0.6, -s * 0.4); ctx.lineTo(s * 0.4, 0); ctx.lineTo(-s * 0.45, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6b4423'; ctx.fillRect(-s * 0.55, -s * 0.42, s * 1.1, s * 0.08);
      ctx.fillStyle = '#3a6f6a'; ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.36, s * 0.3, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
  if (j.hp < j.maxHp) {
    const w = S * 0.7, h = S * 0.09;
    const bx = x - w / 2, by = y - s * 1.0 - S * 0.15;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rrect(ctx, bx - 1, by - 1, w + 2, h + 2, h); ctx.fill();
    ctx.fillStyle = '#ffb347'; rrect(ctx, bx, by, w * (j.hp / j.maxHp), h, h / 2); ctx.fill();
  }
}

// ------------------------------------------------------------------ characters

const HAT_EMOJI = {
  hat_chef: '👨‍🍳', hat_crown: '👑', hat_tophat: '🎩', hat_cowboy: '🤠', hat_party: '🥳', hat_halo: '😇',
  hat_helmet: '⛑️', hat_goggles: '🥽', hat_pirate: '🏴‍☠️', hat_headphones: '🎧',
};

/**
 * Draw a character at feet position (x,y).
 * a: agent ({face, moving, walkT, look, food, bag, squash, ...}); o: options
 */
export function drawCharacter(ctx, a, x, y, S, o = {}) {
  const look = a.look;
  const fx = a.face.x, fy = a.face.y;
  const sitting = o.sitting;
  const bob = a.moving ? Math.abs(Math.sin(a.walkT)) * S * 0.05 : 0;
  const sq = a.squash || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 0, 0, S * 0.26, S * 0.11, 0.25);
  if (o.ride) drawScrubberMachine(ctx, S, fx, fy);
  ctx.scale(1 + sq * 0.12, 1 - sq * 0.14);
  const backFirst = fy > 0.2 || Math.abs(fx) > 0.6; // backpack behind the body
  // legs
  if (!sitting && !o.ride) {
    const sw = a.moving ? Math.sin(a.walkT) * S * 0.07 : 0;
    ctx.fillStyle = look.pants;
    rrect(ctx, -S * 0.15, -S * 0.2 + sw * 0.5, S * 0.12, S * 0.2 - sw * 0.5, S * 0.05); ctx.fill();
    rrect(ctx, S * 0.03, -S * 0.2 - sw * 0.5, S * 0.12, S * 0.2 + sw * 0.5, S * 0.05); ctx.fill();
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(-S * 0.16, -S * 0.04 + sw * 0.5, S * 0.14, S * 0.05);
    ctx.fillRect(S * 0.02, -S * 0.04 - sw * 0.5, S * 0.14, S * 0.05);
  }
  const by = (sitting ? -S * 0.12 : o.ride ? -S * 0.3 : -S * 0.18) - bob;
  if (o.bag !== undefined && backFirst) drawBackpack(ctx, S, by, fx, fy, o.bag, o.bagFull);
  // body
  ctx.fillStyle = look.shirt;
  rrect(ctx, -S * 0.21, by - S * 0.38, S * 0.42, S * 0.4, S * 0.13); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rrect(ctx, -S * 0.17, by - S * 0.36, S * 0.14, S * 0.3, S * 0.07); ctx.fill();
  if (o.apron) { ctx.fillStyle = o.apron; rrect(ctx, -S * 0.15, by - S * 0.26, S * 0.3, S * 0.28, S * 0.06); ctx.fill(); }
  // arms
  ctx.fillStyle = shade(look.shirt.startsWith('#') ? look.shirt : '#888888', 0.85);
  const carrying = (a.food || 0) > 0 || o.tray;
  if (carrying && fy > -0.5) {
    ctx.beginPath(); ctx.arc(-S * 0.16, by - S * 0.16, S * 0.07, 0, Math.PI * 2); ctx.arc(S * 0.16, by - S * 0.16, S * 0.07, 0, Math.PI * 2); ctx.fill();
  } else {
    const sw = a.moving ? Math.sin(a.walkT) * S * 0.05 : 0;
    ctx.beginPath(); ctx.arc(-S * 0.24, by - S * 0.12 + sw, S * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(S * 0.24, by - S * 0.12 - sw, S * 0.07, 0, Math.PI * 2); ctx.fill();
  }
  // head
  const hy = by - S * 0.56;
  ctx.fillStyle = look.skin;
  ctx.beginPath(); ctx.arc(0, hy, S * 0.2, 0, Math.PI * 2); ctx.fill();
  // hair
  ctx.fillStyle = look.hair;
  if (fy < -0.3) {
    ctx.beginPath(); ctx.arc(0, hy, S * 0.205, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, hy - S * 0.02, S * 0.205, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    if (look.hairStyle === 1) { ctx.beginPath(); ctx.arc(-fx * S * 0.12, hy - S * 0.1, S * 0.1, 0, Math.PI * 2); ctx.fill(); }
    if (look.hairStyle === 2) { ctx.fillRect(-S * 0.2, hy - S * 0.05, S * 0.07, S * 0.2); ctx.fillRect(S * 0.13, hy - S * 0.05, S * 0.07, S * 0.2); }
    if (look.hairStyle === 3) { ctx.beginPath(); ctx.arc(0, hy - S * 0.2, S * 0.08, 0, Math.PI * 2); ctx.fill(); }
  }
  // face
  if (fy > -0.3) {
    const ex = fx * S * 0.08;
    const ey = hy + S * 0.02 + fy * S * 0.02;
    const blink = (Math.floor((a.uid * 7 + performance.now() / 100) % 40) === 0);
    ctx.fillStyle = '#1d1d22';
    if (blink) {
      ctx.fillRect(ex - S * 0.1, ey, S * 0.06, S * 0.015);
      ctx.fillRect(ex + S * 0.04, ey, S * 0.06, S * 0.015);
    } else {
      ctx.beginPath(); ctx.ellipse(ex - S * 0.07, ey, S * 0.03, S * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex + S * 0.07, ey, S * 0.03, S * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    ctx.beginPath(); ctx.arc(ex - S * 0.12, ey + S * 0.06, S * 0.035, 0, Math.PI * 2); ctx.arc(ex + S * 0.12, ey + S * 0.06, S * 0.035, 0, Math.PI * 2); ctx.fill();
    if (o.angry) {
      ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex - S * 0.1, ey - S * 0.07); ctx.lineTo(ex - S * 0.04, ey - S * 0.05); ctx.moveTo(ex + S * 0.1, ey - S * 0.07); ctx.lineTo(ex + S * 0.04, ey - S * 0.05); ctx.stroke();
    }
  }
  // hat
  if (o.hat) drawHat(ctx, o.hat, S, hy, fx, fy, o.hatColor);
  if (o.bag !== undefined && !backFirst) drawBackpack(ctx, S, by, fx, fy, o.bag, o.bagFull);
  if (o.tool) drawTool(ctx, o.tool, S, by, fx, fy, a);
  ctx.restore();
}

function drawBackpack(ctx, S, by, fx, fy, fill, full) {
  const s = S * (0.22 + fill * 0.16);
  const ox = -fx * S * 0.2, oy = by - S * 0.22 - fy * S * 0.04;
  ctx.fillStyle = full ? '#d2453c' : '#8a5a34';
  rrect(ctx, ox - s / 2, oy - s * 0.7, s, s * 1.05, s * 0.3); ctx.fill();
  ctx.fillStyle = full ? '#ee6a5e' : '#a8713f';
  rrect(ctx, ox - s * 0.35, oy - s * 0.2, s * 0.7, s * 0.4, s * 0.15); ctx.fill();
  if (fill > 0.05) {
    ctx.fillStyle = '#2b2d33';
    ctx.beginPath(); ctx.ellipse(ox, oy - s * 0.72, s * 0.35, s * 0.2 * Math.min(1, fill * 2), 0, Math.PI, 0); ctx.fill();
  }
}

function drawHat(ctx, hat, S, hy, fx, fy, color) {
  if (hat === 'hat_none') return;
  if (hat === 'hat_cap') {
    ctx.fillStyle = color || '#ffcc33';
    ctx.beginPath(); ctx.arc(0, hy - S * 0.04, S * 0.21, Math.PI, 0); ctx.fill();
    if (fy > -0.3) {
      ctx.beginPath(); ctx.ellipse(fx * S * 0.12, hy - S * 0.05 + fy * S * 0.03, S * 0.17, S * 0.06, fx * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (hat === 'hat_bandana') {
    ctx.fillStyle = '#d63a3a';
    ctx.beginPath(); ctx.arc(0, hy - S * 0.03, S * 0.21, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillRect(-S * 0.2, hy - S * 0.08, S * 0.4, S * 0.06);
    return;
  }
  if (hat === 'hat_beanie') {
    ctx.fillStyle = '#3d7bd9';
    ctx.beginPath(); ctx.arc(0, hy - S * 0.05, S * 0.21, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, hy - S * 0.27, S * 0.06, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const e = HAT_EMOJI[hat];
  if (e) drawEmoji(ctx, e, 0, hy - S * 0.2, S * 0.36);
}

function drawTool(ctx, tool, S, by, fx, fy, a) {
  const hx = fx * S * 0.28, hy = by - S * 0.1;
  if (tool === 'sponge') {
    ctx.fillStyle = '#ffd84a';
    rrect(ctx, hx - S * 0.08 + fx * S * 0.05, hy + S * 0.02, S * 0.16, S * 0.1, S * 0.03); ctx.fill();
    ctx.fillStyle = '#4fbf6a'; ctx.fillRect(hx - S * 0.08 + fx * S * 0.05, hy + S * 0.02, S * 0.16, S * 0.03);
  } else if (tool === 'mop') {
    const sw = a.moving ? Math.sin(a.walkT * 0.8) * S * 0.12 : 0;
    ctx.strokeStyle = '#a0703c'; ctx.lineWidth = S * 0.04;
    ctx.beginPath(); ctx.moveTo(hx, hy - S * 0.15); ctx.lineTo(hx + fx * S * 0.25 + sw, S * 0.06 - by * 0); ctx.stroke();
    ctx.fillStyle = '#dfe7ef';
    ctx.beginPath(); ctx.ellipse(hx + fx * S * 0.25 + sw, -by + by + S * 0.05, S * 0.13, S * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  } else if (tool === 'washer') {
    ctx.fillStyle = '#ffcf2e';
    rrect(ctx, hx - S * 0.07, hy - S * 0.05, S * 0.14, S * 0.12, S * 0.03); ctx.fill();
    ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = S * 0.035;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + fx * S * 0.32, hy + fy * S * 0.1 + S * 0.04); ctx.stroke();
    ctx.strokeStyle = '#2f6fd6'; ctx.lineWidth = S * 0.025;
    ctx.beginPath(); ctx.moveTo(hx, hy + S * 0.05); ctx.quadraticCurveTo(-fx * S * 0.2, S * 0.05, -fx * S * 0.3, -S * 0.2); ctx.stroke();
  }
}

function drawScrubberMachine(ctx, S, fx, fy) {
  block(ctx, -S * 0.36, -S * 0.3, S * 0.72, S * 0.46, S * 0.22, '#ffcf2e', '#d9a514', 6);
  ctx.fillStyle = '#2b2d33';
  ctx.beginPath(); ctx.ellipse(fx * S * 0.2, S * 0.1, S * 0.3, S * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a3a40'; ctx.fillRect(-S * 0.05, -S * 0.75, S * 0.1, S * 0.3);
}

// ------------------------------------------------------------------ furniture

export function drawTable(ctx, x, y, S, color, legColor) {
  // x,y = screen of tile top-left; table top at height 0.42
  const h = S * 0.42;
  const inset = S * 0.1;
  shadow(ctx, x + S / 2, y + S * 0.62, S * 0.42, S * 0.18, 0.2);
  ctx.fillStyle = legColor;
  ctx.fillRect(x + S * 0.2, y + S * 0.55 - h, S * 0.07, h + S * 0.1);
  ctx.fillRect(x + S * 0.73, y + S * 0.55 - h, S * 0.07, h + S * 0.1);
  block(ctx, x + inset, y + inset, S - inset * 2, S * 0.75, S * 0.07, color, shade(color, 0.75), S * 0.08);
}

export function drawChair(ctx, x, y, S, color, face) {
  // x,y = screen center of the seat tile
  shadow(ctx, x, y + S * 0.12, S * 0.2, S * 0.09, 0.18);
  const backX = -face.x * S * 0.2, backY = -face.y * S * 0.16;
  if (face.y > 0.5) { // chair above table: backrest on top
    block(ctx, x - S * 0.2 + backX, y - S * 0.2 + backY, S * 0.4, S * 0.08, S * 0.55, shade(color, 1.1), shade(color, 0.8), 3);
  }
  block(ctx, x - S * 0.19, y - S * 0.12, S * 0.38, S * 0.3, S * 0.22, color, shade(color, 0.75), 4);
  if (face.y <= 0.5 && Math.abs(face.x) > 0.5) {
    block(ctx, x - S * 0.04 + backX - S * 0.02, y - S * 0.15, S * 0.08, S * 0.32, S * 0.55, shade(color, 1.1), shade(color, 0.8), 3);
  } else if (face.y < -0.5) {
    block(ctx, x - S * 0.2, y + S * 0.12, S * 0.4, S * 0.07, S * 0.45, shade(color, 1.1), shade(color, 0.8), 3);
  }
}

export function drawCounter(ctx, x, y, w, h, S, theme) {
  // x,y,w,h = footprint px
  shadow(ctx, x + w / 2, y + h * 0.95, w * 0.55, S * 0.15, 0.2);
  block(ctx, x, y + S * 0.08, w, h - S * 0.08, S * 0.55, theme.counterTop || '#f2efe6', theme.counterFront || '#c0563c', S * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + S * 0.06, y + h - S * 0.45, w - S * 0.12, S * 0.05);
}

export function drawRegister(ctx, x, y, S) {
  block(ctx, x - S * 0.17, y - S * 0.1, S * 0.34, S * 0.2, S * 0.16, '#4a4f5c', '#30343d', 3);
  ctx.fillStyle = '#7dff9a'; ctx.fillRect(x - S * 0.1, y - S * 0.24, S * 0.2, S * 0.05);
}

export function drawBills(ctx, x, y, S, amount) {
  const n = Math.min(14, Math.ceil(Math.log2(1 + amount) * 1.3));
  for (let i = 0; i < n; i++) {
    const ox = ((i % 2) - 0.5) * S * 0.12, oy = -Math.floor(i / 2) * S * 0.05;
    ctx.fillStyle = '#2e9e4f';
    rrect(ctx, x - S * 0.17 + ox, y - S * 0.08 + oy, S * 0.34, S * 0.17, 2); ctx.fill();
    ctx.fillStyle = '#7ddc8f';
    rrect(ctx, x - S * 0.14 + ox, y - S * 0.06 + oy, S * 0.28, S * 0.12, 2); ctx.fill();
    ctx.fillStyle = '#2e9e4f';
    ctx.beginPath(); ctx.arc(x + ox, y + oy, S * 0.03, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawBill(ctx, x, y, S, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#2e9e4f'; rrect(ctx, -S * 0.15, -S * 0.07, S * 0.3, S * 0.14, 2); ctx.fill();
  ctx.fillStyle = '#86e39a'; rrect(ctx, -S * 0.12, -S * 0.05, S * 0.24, S * 0.1, 2); ctx.fill();
  ctx.restore();
}

export function drawCoin(ctx, x, y, S) {
  ctx.fillStyle = '#e8a91a'; ctx.beginPath(); ctx.ellipse(x, y, S * 0.09, S * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd95a'; ctx.beginPath(); ctx.ellipse(x - S * 0.01, y - S * 0.01, S * 0.06, S * 0.06, 0, 0, Math.PI * 2); ctx.fill();
}

const STATION_STYLE = {
  grill: { top: '#d8dde3', front: '#8f98a3', accent: '#2b2d33', glow: '#ff7a2e' },
  coffee: { top: '#c7b29a', front: '#5b4636', accent: '#2a2a2e', glow: '#ffe2b0' },
  oven: { top: '#c86a43', front: '#9b4a2c', accent: '#3a1e14', glow: '#ff8c2e' },
  sushi: { top: '#f1ece0', front: '#4a3b31', accent: '#2f6a5c', glow: '#ff9b9b' },
  hotdog: { top: '#e0e4e8', front: '#d14b3d', accent: '#ffcf3a', glow: '#ffb34d' },
  crepe: { top: '#d8dde3', front: '#3b6ea8', accent: '#1f2228', glow: '#ffcf8a' },
  taco: { top: '#e9d27a', front: '#3b8f5a', accent: '#c8462e', glow: '#ffb84d' },
  pastry: { top: '#f6e7ef', front: '#c26b9a', accent: '#6b3a55', glow: '#ffd1e8' },
};

export function drawStation(ctx, st, x, y, S, product, time) {
  const s = STATION_STYLE[st.draw] || STATION_STYLE.grill;
  const bump = st.bump > 0 ? Math.sin(st.bump * Math.PI) * S * 0.04 : 0;
  shadow(ctx, x + S / 2, y + S * 0.9, S * 0.5, S * 0.16, 0.22);
  block(ctx, x + S * 0.05, y + S * 0.1, S * 0.9, S * 0.82, S * 0.62 + bump, s.top, s.front, S * 0.06);
  const ty = y + S * 0.1 - S * 0.62 - bump;
  // working surface
  ctx.fillStyle = s.accent;
  rrect(ctx, x + S * 0.16, ty + S * 0.1, S * 0.68, S * 0.5, S * 0.05); ctx.fill();
  const flick = 0.6 + Math.sin(time * 12 + st.x) * 0.2;
  ctx.fillStyle = s.glow;
  ctx.globalAlpha = 0.45 * flick;
  rrect(ctx, x + S * 0.2, ty + S * 0.14, S * 0.6, S * 0.42, S * 0.05); ctx.fill();
  ctx.globalAlpha = 1;
  if (st.draw === 'grill') {
    ctx.strokeStyle = '#555b63'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + S * 0.18, ty + S * 0.1 + i * S * 0.1); ctx.lineTo(x + S * 0.82, ty + S * 0.1 + i * S * 0.1); ctx.stroke(); }
  }
  // cooking item on top while producing
  if (st.t > 0.05) drawFood(ctx, product, x + S * 0.5, ty + S * 0.32, S * (0.18 + st.t * 0.16));
  // front window / knobs
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + S * 0.12, y + S * 0.92 - S * 0.5, S * 0.76, S * 0.05);
  ctx.fillStyle = '#ffcf3a';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + S * (0.3 + i * 0.2), y + S * 0.92 - S * 0.25, S * 0.04, 0, Math.PI * 2); ctx.fill(); }
}

export function drawBin(ctx, b, x, y, S) {
  shadow(ctx, x + S / 2, y + S * 0.9, S * 0.55, S * 0.16, 0.25);
  block(ctx, x + S * 0.04, y + S * 0.15, S * 0.92, S * 0.78, S * 0.62, '#2f8f4e', '#24713d', S * 0.05);
  const ty = y + S * 0.15 - S * 0.62;
  ctx.fillStyle = '#1d4d2b';
  ctx.fillRect(x + S * 0.12, ty + S * 0.12, S * 0.76, S * 0.5);
  // lid
  const open = b.lid || 0;
  ctx.save();
  ctx.translate(x + S * 0.5, ty + S * 0.08);
  ctx.fillStyle = '#3aa65d';
  rrect(ctx, -S * 0.47, -S * 0.05 - open * S * 0.25, S * 0.94, S * 0.14 + (1 - open) * S * 0.25, S * 0.04); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#e8f5ea';
  ctx.font = `800 ${Math.round(S * 0.22)}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('♻', x + S * 0.5, y + S * 0.93 - S * 0.3);
}

export function drawDecor(ctx, d, x, y, S, time) {
  const k = d.kind;
  if (k.draw === 'rug') {
    ctx.fillStyle = '#b8323b'; rrect(ctx, x - S * 0.45, y - S * 0.35, S * 0.9, S * 0.7, S * 0.08); ctx.fill();
    ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 2; rrect(ctx, x - S * 0.38, y - S * 0.28, S * 0.76, S * 0.56, S * 0.06); ctx.stroke();
    return;
  }
  shadow(ctx, x, y + S * 0.3, S * 0.35, S * 0.13, 0.22);
  if (k.draw === 'sign') {
    const glow = 0.6 + Math.sin(time * 3) * 0.25;
    ctx.fillStyle = '#3a2d4f';
    ctx.fillRect(x - S * 0.05, y - S * 0.5, S * 0.1, S * 0.8);
    ctx.shadowColor = '#ffe066'; ctx.shadowBlur = S * 0.4 * glow;
    ctx.fillStyle = '#ff5fa2'; rrect(ctx, x - S * 0.45, y - S * 1.25, S * 0.9, S * 0.55, S * 0.12); ctx.fill();
    ctx.shadowBlur = 0;
    outlinedText(ctx, '★ OUVERT ★', x, y - S * 0.97, S * 0.17, '#fff8c4', '#7a1f4f');
    return;
  }
  drawEmoji(ctx, k.icon, x, y - S * 0.25, S * 0.85);
}
