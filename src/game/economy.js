// Derived gameplay stats: combines location upgrades (state.upgrades),
// permanent talents (meta.talents) and level economy settings.

import { UPGRADES } from '../data/upgrades.js';
import { TOOLS } from '../data/catalog.js';
import { talentEffects } from '../data/meta.js';

export const BASE = {
  playerSpeed: 3.1, // tiles / second
  staffSpeed: 2.2,
  customerSpeed: 2.0,
  pickupRadius: 0.75,
  stationTime: 2.4, // seconds per product
  stationStock: 5,
  counterStock: 14,
  serveTimePlayer: 0.32,
  serveTimeCashier: 0.5,
  queuePatience: 75,
  seatPatience: 30,
  spillChance: 0.3,
  floorTrashChance: 0.12,
  tipRate: 0.3, // tip = price * tipRate * rating/5 per item
};

export function computeStats(game) {
  const up = game.state.upgrades;
  const tal = game.meta.talents;
  const eco = game.def.economy;
  const lv = (k) => up[k] || 0;
  const tl = (k) => tal[k] || 0;
  const startTier = Math.min(4, (eco.startTool || 1) + talentEffects.toolAdd(tl('t_tool')));
  const tier = Math.min(4, startTier + lv('tool'));
  return {
    speed: BASE.playerSpeed * UPGRADES.speed.effect(lv('speed')) * talentEffects.speedMul(tl('t_speed')),
    bagCap: UPGRADES.bag.effect(lv('bag')) + talentEffects.bagAdd(tl('t_bag')),
    trayCap: UPGRADES.tray.effect(lv('tray')),
    startTier,
    toolTier: tier,
    tool: TOOLS[tier - 1],
    toolMaxLevel: 4 - startTier,
    scrubMul: UPGRADES.scrub.effect(lv('scrub')) * talentEffects.scrubMul(tl('t_scrub')),
    priceMul: UPGRADES.price.effect(lv('price')) * talentEffects.incomeMul(tl('t_income')),
    adsMul: UPGRADES.ads.effect(lv('ads')),
    cookMul: UPGRADES.cook.effect(lv('cook')),
    stationStock: BASE.stationStock + Math.floor(lv('cook') / 2),
    staffSpeed: BASE.staffSpeed * UPGRADES.staffSpeed.effect(lv('staffSpeed')),
    staffCap: UPGRADES.staffCap.effect(lv('staffCap')),
    magnet: BASE.pickupRadius * talentEffects.magnetMul(tl('t_magnet')),
    offlineEff: talentEffects.offlineEff(tl('t_offline')),
    offlineCapH: talentEffects.offlineCapH(tl('t_offline')),
  };
}

/** Max level of an upgrade in the current location (tool depends on the start tier). */
export function upgradeMax(game, key) {
  if (key === 'tool') return game.stats.toolMaxLevel;
  return UPGRADES[key].max;
}

/** Price paid for one product. */
export function productPrice(game) {
  return game.def.product.price * (game.def.economy.costScale || 1) * game.stats.priceMul;
}
