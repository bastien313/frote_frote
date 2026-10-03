// Per-location upgrades (bought with the location's money in the "Améliorations" menu).
// Cost of level L (0-based, i.e. buying L -> L+1) = round(base * growth^L * location.costScale).
// `effect(level)` returns the stat value used by the game for that level.

import { TOOLS } from './catalog.js';

export const UPGRADE_GROUPS = [
  { id: 'player', name: 'Patron', icon: '🧑' },
  { id: 'shop', name: 'Restaurant', icon: '🏪' },
  { id: 'staff', name: 'Personnel', icon: '👥' },
];

export const UPGRADES = {
  speed: {
    group: 'player', name: 'Baskets', icon: '👟', max: 8, base: 25, growth: 1.6,
    desc: (v) => `Vitesse de déplacement ×${v.toFixed(2)}`,
    effect: (l) => 1 + 0.08 * l,
  },
  bag: {
    group: 'player', name: 'Sac à déchets', icon: '🎒', max: 10, base: 18, growth: 1.5,
    desc: (v) => `Capacité du sac : ${v}`,
    effect: (l) => 10 + 5 * l,
  },
  tray: {
    group: 'player', name: 'Plateau', icon: '🍽️', max: 8, base: 30, growth: 1.6,
    desc: (v) => `Plats portés : ${v}`,
    effect: (l) => 4 + l,
  },
  tool: {
    group: 'player', name: 'Outil de nettoyage', icon: '🧽', max: 3, base: 70, growth: 5.5,
    desc: (v) => `${TOOLS[v - 1].icon} ${TOOLS[v - 1].name}`,
    // level here is the number of tool upgrades bought; tier = startTier + level
    effect: (l) => l,
    special: 'tool',
  },
  scrub: {
    group: 'player', name: 'Huile de coude', icon: '💪', max: 8, base: 40, growth: 1.65,
    desc: (v) => `Puissance de nettoyage ×${v.toFixed(2)}`,
    effect: (l) => 1 + 0.15 * l,
  },
  price: {
    group: 'shop', name: 'Menu premium', icon: '💰', max: 10, base: 45, growth: 1.62,
    desc: (v) => `Prix de vente ×${v.toFixed(2)}`,
    effect: (l) => 1 + 0.22 * l,
  },
  ads: {
    group: 'shop', name: 'Publicité', icon: '📣', max: 8, base: 60, growth: 1.7,
    desc: (v) => `Clients ×${v.toFixed(2)}`,
    effect: (l) => 1 + 0.16 * l,
  },
  cook: {
    group: 'shop', name: 'Cuisine rapide', icon: '🔥', max: 8, base: 50, growth: 1.62,
    desc: (v) => `Vitesse de cuisine ×${v.toFixed(2)}`,
    effect: (l) => 1 + 0.2 * l,
  },
  staffSpeed: {
    group: 'staff', name: 'Personnel rapide', icon: '🏃', max: 6, base: 120, growth: 1.75,
    desc: (v) => `Vitesse du personnel ×${v.toFixed(2)}`,
    effect: (l) => 1 + 0.15 * l,
    needsStaff: true,
  },
  staffCap: {
    group: 'staff', name: 'Personnel costaud', icon: '🏋️', max: 6, base: 120, growth: 1.75,
    desc: (v) => `Charge du personnel : ${v}`,
    effect: (l) => 3 + l,
    needsStaff: true,
  },
};

export function upgradeCost(key, level, costScale) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, level) * costScale);
}
