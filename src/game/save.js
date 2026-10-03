// Save model: one JSON object holding the meta progression and the state of
// every location visited. See docs/SAVE_FORMAT.md.

import { ACHIEVEMENTS, COSMETICS, TALENTS } from '../data/meta.js';

export const SAVE_VERSION = 1;

export function newSave() {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    savedAt: 0,
    current: 0, // index of the location being played
    unlocked: 1, // number of locations unlocked
    levels: {}, // location id -> Game.serialize()
    meta: newMeta(),
  };
}

export function newMeta() {
  return {
    stars: 0, // spendable
    starsEarned: 0, // lifetime
    talents: {},
    stats: {},
    achievements: {},
    levelStars: {},
    completed: {},
    cosmetics: {
      hat: 'hat_cap',
      color: 'color_blue',
      colorValue: '#2f6fd6',
      skin: '#f6d3b3',
      unlocked: ['hat_cap', 'hat_none', 'color_blue', 'color_teal'],
    },
    settings: { music: 0.35, sfx: 0.8, vibration: true, quality: 'high', zoom: 1 },
    lastActive: Date.now(),
    introSeen: {},
  };
}

/** Bring an older/partial save up to date. Never throws on missing fields. */
export function migrate(save) {
  if (!save || typeof save !== 'object') return newSave();
  const base = newSave();
  const out = { ...base, ...save };
  out.meta = { ...base.meta, ...(save.meta || {}) };
  out.meta.cosmetics = { ...base.meta.cosmetics, ...(save.meta?.cosmetics || {}) };
  out.meta.settings = { ...base.meta.settings, ...(save.meta?.settings || {}) };
  for (const k of ['talents', 'stats', 'achievements', 'levelStars', 'completed', 'introSeen']) {
    out.meta[k] = { ...(save.meta?.[k] || {}) };
  }
  if (!Array.isArray(out.meta.cosmetics.unlocked)) out.meta.cosmetics.unlocked = base.meta.cosmetics.unlocked.slice();
  for (const id of base.meta.cosmetics.unlocked) if (!out.meta.cosmetics.unlocked.includes(id)) out.meta.cosmetics.unlocked.push(id);
  out.levels = save.levels || {};
  out.version = SAVE_VERSION;
  return out;
}

export function unlockCosmetic(meta, id) {
  if (!id || meta.cosmetics.unlocked.includes(id)) return false;
  meta.cosmetics.unlocked.push(id);
  return true;
}

export function cosmeticById(id) {
  return COSMETICS.hats.find((h) => h.id === id) || COSMETICS.colors.find((c) => c.id === id) || null;
}

/** Check achievements; returns the list of newly completed ones (and applies rewards). */
export function checkAchievements(meta) {
  const done = [];
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements[a.id]) continue;
    if ((meta.stats[a.stat] || 0) >= a.goal) {
      meta.achievements[a.id] = Date.now();
      meta.stars += a.stars;
      meta.starsEarned += a.stars;
      unlockCosmetic(meta, a.unlock);
      done.push(a);
    }
  }
  return done;
}

export function talentCost(meta, key) {
  const t = TALENTS[key];
  const lvl = meta.talents[key] || 0;
  return lvl < t.costs.length ? t.costs[lvl] : null;
}

export function buyTalent(meta, key) {
  const cost = talentCost(meta, key);
  if (cost === null || meta.stars < cost) return false;
  meta.stars -= cost;
  meta.talents[key] = (meta.talents[key] || 0) + 1;
  return true;
}
