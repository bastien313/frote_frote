// Static game catalogs: dirt types, cleaning tools, trash and junk kinds, floors.
// Everything here is plain data so it can be tuned without touching logic.

/**
 * Dirt types. Index in this array is stored in the dirt grid (0 = clean).
 * - tier: minimum tool tier able to clean it at full speed (below: 6% speed)
 * - hardness: divides the cleaning speed
 * - color: [r,g,b] base colour, alpha: max opacity
 */
export const DIRT_TYPES = [
  null,
  { id: 'dust', name: 'Poussière', color: [150, 134, 108], alpha: 0.95, hardness: 0.55, tier: 1 },
  { id: 'mud', name: 'Boue', color: [112, 78, 46], alpha: 0.98, hardness: 0.9, tier: 1 },
  { id: 'spill', name: 'Tache de soda', color: [170, 62, 44], alpha: 0.95, hardness: 0.6, tier: 1 },
  { id: 'grease', name: 'Graisse', color: [118, 96, 34], alpha: 0.98, hardness: 1.5, tier: 2 },
  { id: 'slime', name: 'Moisissure', color: [74, 120, 52], alpha: 0.97, hardness: 2.0, tier: 3 },
  { id: 'grime', name: 'Crasse incrustée', color: [52, 46, 40], alpha: 0.99, hardness: 2.6, tier: 3 },
  { id: 'oil', name: 'Huile de vidange', color: [26, 26, 34], alpha: 0.99, hardness: 3.2, tier: 4 },
  { id: 'sand', name: 'Sable', color: [214, 188, 128], alpha: 0.95, hardness: 0.7, tier: 1 },
  { id: 'paint', name: 'Peinture', color: [70, 110, 190], alpha: 0.97, hardness: 2.4, tier: 3 },
  { id: 'soot', name: 'Suie', color: [36, 34, 36], alpha: 0.98, hardness: 1.8, tier: 2 },
  { id: 'ketchup', name: 'Ketchup', color: [196, 30, 28], alpha: 0.96, hardness: 0.8, tier: 1 },
  { id: 'coffee', name: 'Café renversé', color: [84, 52, 32], alpha: 0.95, hardness: 0.75, tier: 1 },
  { id: 'chalk', name: 'Craie', color: [232, 232, 226], alpha: 0.9, hardness: 0.6, tier: 1 },
];

export const DIRT_INDEX = Object.fromEntries(DIRT_TYPES.map((d, i) => [d ? d.id : 'none', i]));

/** Cleaning tools, bought as the 'tool' upgrade. Index = tier - 1. */
export const TOOLS = [
  { id: 'sponge', tier: 1, name: 'Éponge', icon: '🧽', radius: 0.5, power: 1.0, fx: 'bubbles' },
  { id: 'mop', tier: 2, name: 'Serpillière', icon: '🧹', radius: 0.62, power: 1.7, fx: 'water' },
  { id: 'washer', tier: 3, name: 'Nettoyeur haute pression', icon: '🔫', radius: 0.82, power: 2.8, fx: 'spray' },
  { id: 'scrubber', tier: 4, name: 'Autolaveuse', icon: '🚜', radius: 1.1, power: 4.2, fx: 'foam' },
];

/** Floor trash. `value` multiplies the level's trashValue. */
export const TRASH_KINDS = {
  bag: { name: 'Sac poubelle', value: 2, draw: 'bag' },
  box: { name: 'Carton', value: 1, draw: 'box' },
  can: { name: 'Canette', value: 1, draw: 'can' },
  paper: { name: 'Papier', value: 1, draw: 'paper' },
  bottle: { name: 'Bouteille', value: 1, draw: 'bottle' },
  banana: { name: 'Peau de banane', value: 1, draw: 'banana' },
  cup: { name: 'Gobelet', value: 1, draw: 'cup' },
  bone: { name: 'Os', value: 1, draw: 'bone' },
  leaf: { name: 'Feuilles', value: 1, draw: 'leaf' },
  shell: { name: 'Coquillage', value: 1, draw: 'shell' },
  plate: { name: 'Assiette sale', value: 1, draw: 'plate' },
};

/** Bulky junk that must be smashed into trash. hp = number of hits. */
export const JUNK_KINDS = {
  crate: { name: 'Caisse cassée', hp: 4, drops: 3, size: 0.8, draw: 'crate' },
  tire: { name: 'Vieux pneu', hp: 5, drops: 3, size: 0.75, draw: 'tire' },
  sofa: { name: 'Vieux canapé', hp: 8, drops: 5, size: 1.1, draw: 'sofa' },
  fridge: { name: 'Frigo rouillé', hp: 10, drops: 6, size: 0.95, draw: 'fridge' },
  mattress: { name: 'Matelas', hp: 7, drops: 4, size: 1.05, draw: 'mattress' },
  tv: { name: 'Vieille télé', hp: 5, drops: 4, size: 0.75, draw: 'tv' },
  barrel: { name: 'Baril', hp: 6, drops: 4, size: 0.75, draw: 'barrel' },
  boat: { name: 'Épave de barque', hp: 12, drops: 7, size: 1.3, draw: 'boat' },
};

/**
 * Floor styles referenced by rooms (`floor: 'checker_red'`).
 * kind: checker | tiles | wood | concrete | grass | deck | marble | tatami | carpet | sand | cobble
 */
export const FLOORS = {
  checker_red: { kind: 'checker', c1: '#f7f0e4', c2: '#e2675c' },
  checker_bw: { kind: 'checker', c1: '#f3f1ec', c2: '#3b3f4a' },
  checker_blue: { kind: 'checker', c1: '#eef4f7', c2: '#7fb2d6' },
  checker_green: { kind: 'checker', c1: '#eef3e6', c2: '#86b26b' },
  tiles_white: { kind: 'tiles', c1: '#e9eef0', c2: '#c9d3d8' },
  tiles_blue: { kind: 'tiles', c1: '#cfe6ef', c2: '#9fc6d6' },
  tiles_terra: { kind: 'tiles', c1: '#d98c5f', c2: '#b86f48' },
  tiles_mint: { kind: 'tiles', c1: '#cdeee0', c2: '#9fd2bd' },
  wood_light: { kind: 'wood', c1: '#d9b184', c2: '#c69a6b' },
  wood_dark: { kind: 'wood', c1: '#8c5e3c', c2: '#7a5134' },
  wood_red: { kind: 'wood', c1: '#b5694a', c2: '#a05a3e' },
  concrete: { kind: 'concrete', c1: '#b9b6ae', c2: '#a9a59c' },
  concrete_dark: { kind: 'concrete', c1: '#8f8d88', c2: '#83817c' },
  grass: { kind: 'grass', c1: '#7cc36a', c2: '#6db35c' },
  deck: { kind: 'deck', c1: '#c4925d', c2: '#a97a49' },
  marble: { kind: 'marble', c1: '#f4f1ea', c2: '#ddd6c8' },
  marble_dark: { kind: 'marble', c1: '#3a3a44', c2: '#50505c' },
  tatami: { kind: 'tatami', c1: '#d8cf8e', c2: '#b9ae6c' },
  carpet_red: { kind: 'carpet', c1: '#a8323b', c2: '#932a32' },
  carpet_blue: { kind: 'carpet', c1: '#3c5a9a', c2: '#334f88' },
  sand: { kind: 'sand', c1: '#ecd9a6', c2: '#e0ca92' },
  cobble: { kind: 'cobble', c1: '#a29a8e', c2: '#8d8579' },
  asphalt: { kind: 'concrete', c1: '#5d6066', c2: '#55585e' },
  pavement: { kind: 'tiles', c1: '#c8c4bb', c2: '#b4afa5' },
};

/** Staff roles hired with 'hire' pads. */
export const ROLES = {
  cashier: { name: 'Caissier·ère', icon: '🧑‍💼', color: '#2e9e5b', desc: 'Encaisse les clients au comptoir' },
  server: { name: 'Serveur·se', icon: '🧑‍🍳', color: '#d6453d', desc: 'Apporte la nourriture au comptoir' },
  cleaner: { name: 'Agent d\'entretien', icon: '🧹', color: '#7b4fc9', desc: 'Débarrasse les tables et nettoie' },
};

/** Decorations (bought with pads) add a little reputation. */
export const DECOR_KINDS = {
  plant: { name: 'Plante', icon: '🪴', rating: 0.08, blocks: true },
  bigplant: { name: 'Palmier', icon: '🌴', rating: 0.12, blocks: true },
  flowers: { name: 'Fleurs', icon: '💐', rating: 0.08, blocks: true },
  jukebox: { name: 'Juke-box', icon: '🎵', rating: 0.15, blocks: true, draw: 'jukebox' },
  arcade: { name: 'Borne d\'arcade', icon: '🕹️', rating: 0.15, blocks: true, draw: 'arcade' },
  aquarium: { name: 'Aquarium', icon: '🐠', rating: 0.18, blocks: true, draw: 'aquarium' },
  lamp: { name: 'Lampadaire', icon: '💡', rating: 0.06, blocks: true, draw: 'lamp' },
  fountain: { name: 'Fontaine', icon: '⛲', rating: 0.2, blocks: true },
  piano: { name: 'Piano', icon: '🎹', rating: 0.2, blocks: true, draw: 'piano' },
  statue: { name: 'Statue', icon: '🗿', rating: 0.15, blocks: true },
  umbrella: { name: 'Parasol', icon: '⛱️', rating: 0.1, blocks: true },
  sign: { name: 'Enseigne lumineuse', icon: '✨', rating: 0.3, blocks: true, draw: 'sign' },
  rug: { name: 'Tapis', icon: '🟥', rating: 0.08, blocks: false, draw: 'rug' },
  lantern: { name: 'Lanterne', icon: '🏮', rating: 0.1, blocks: true },
  tree: { name: 'Arbre', icon: '🌳', rating: 0.12, blocks: true },
  cactus: { name: 'Cactus', icon: '🌵', rating: 0.08, blocks: true },
  bonsai: { name: 'Bonsaï', icon: '🎍', rating: 0.12, blocks: true },
  candle: { name: 'Chandelier', icon: '🕯️', rating: 0.12, blocks: true },
  trophy: { name: 'Trophée', icon: '🏆', rating: 0.2, blocks: true },
};
