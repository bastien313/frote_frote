// Meta progression shared by every location: talents (bought with stars),
// achievements (give stars) and cosmetics (unlocked by milestones).

/** Talents: permanent bonuses. costs[i] = stars to go from level i to i+1. */
export const TALENTS = {
  t_speed: { name: 'Baskets de pro', icon: '👟', desc: '+6 % de vitesse par niveau', costs: [1, 2, 2, 3] },
  t_bag: { name: 'Sac XXL', icon: '🎒', desc: '+4 places dans le sac par niveau', costs: [1, 1, 2, 3] },
  t_income: { name: 'Sens des affaires', icon: '💼', desc: '+10 % de revenus par niveau', costs: [1, 2, 2, 3, 3] },
  t_scrub: { name: 'Huile de coude', icon: '💪', desc: '+15 % de puissance de nettoyage', costs: [1, 1, 2, 3] },
  t_magnet: { name: 'Aimant à déchets', icon: '🧲', desc: '+25 % de rayon de ramassage', costs: [1, 2, 3] },
  t_start: { name: 'Héritage', icon: '🏦', desc: 'Commence chaque nouveau lieu avec un pécule', costs: [1, 2, 3] },
  t_offline: { name: 'Gérant de nuit', icon: '🌙', desc: '+15 % de gains hors-ligne et +2 h de durée max', costs: [1, 2, 3] },
  t_tool: { name: 'Outil fétiche', icon: '🧰', desc: 'Commence chaque lieu avec un outil de niveau supérieur', costs: [2, 4] },
};

export const talentEffects = {
  speedMul: (l) => 1 + 0.06 * l,
  bagAdd: (l) => 4 * l,
  incomeMul: (l) => 1 + 0.1 * l,
  scrubMul: (l) => 1 + 0.15 * l,
  magnetMul: (l) => 1 + 0.25 * l,
  startCash: (l) => [0, 60, 200, 600][l] || 0, // multiplied by location costScale
  offlineEff: (l) => 0.3 + 0.15 * l,
  offlineCapH: (l) => 2 + 2 * l,
  toolAdd: (l) => l,
};

/**
 * Achievements. `stat` refers to a key of save.stats; reaching `goal` gives
 * `stars` and optionally unlocks a cosmetic.
 */
export const ACHIEVEMENTS = [
  { id: 'trash_100', name: 'Ramasseur', desc: 'Ramasser 100 déchets', stat: 'trash', goal: 100, stars: 1, unlock: 'hat_bandana' },
  { id: 'trash_1000', name: 'Aspirateur humain', desc: 'Ramasser 1 000 déchets', stat: 'trash', goal: 1000, stars: 1, unlock: 'color_green' },
  { id: 'trash_5000', name: 'Roi des poubelles', desc: 'Ramasser 5 000 déchets', stat: 'trash', goal: 5000, stars: 1, unlock: 'hat_tophat' },
  { id: 'rooms_5', name: 'Rénovateur', desc: 'Nettoyer 5 pièces', stat: 'rooms', goal: 5, stars: 1, unlock: 'hat_beanie' },
  { id: 'rooms_20', name: 'Brillant !', desc: 'Nettoyer 20 pièces', stat: 'rooms', goal: 20, stars: 1, unlock: 'color_pink' },
  { id: 'serve_200', name: 'Service !', desc: 'Servir 200 clients', stat: 'served', goal: 200, stars: 1, unlock: 'hat_headphones' },
  { id: 'serve_2000', name: 'Restaurateur', desc: 'Servir 2 000 clients', stat: 'served', goal: 2000, stars: 1, unlock: 'color_red' },
  { id: 'serve_10000', name: 'Empire de la bouffe', desc: 'Servir 10 000 clients', stat: 'served', goal: 10000, stars: 2, unlock: 'color_gold' },
  { id: 'tables_150', name: 'Débarrasseur', desc: 'Débarrasser 150 tables', stat: 'tables', goal: 150, stars: 1, unlock: 'color_orange' },
  { id: 'junk_30', name: 'Démolisseur', desc: 'Casser 30 encombrants', stat: 'junk', goal: 30, stars: 1, unlock: 'hat_helmet' },
  { id: 'hire_8', name: 'Chef d\'équipe', desc: 'Embaucher 8 employés', stat: 'hired', goal: 8, stars: 1, unlock: 'color_purple' },
  { id: 'earn_100k', name: 'Bas de laine', desc: 'Gagner 100K au total', stat: 'earned', goal: 1e5, stars: 1, unlock: 'hat_cowboy' },
  { id: 'earn_10m', name: 'Millionnaire', desc: 'Gagner 10M au total', stat: 'earned', goal: 1e7, stars: 1, unlock: 'hat_crown' },
  { id: 'washer', name: 'Haute pression !', desc: 'Obtenir le nettoyeur haute pression', stat: 'washer', goal: 1, stars: 1, unlock: 'hat_goggles' },
  { id: 'rating5', name: 'Cinq étoiles', desc: 'Atteindre une réputation de 5', stat: 'rating5', goal: 1, stars: 1, unlock: 'hat_party' },
  { id: 'clean_1m', name: 'Frote Frote', desc: 'Frotter 2 000 m² de saleté', stat: 'scrubbed', goal: 2000, stars: 1, unlock: 'color_black' },
];

/** Cosmetics. `unlock` explains where it comes from (shown when locked). */
export const COSMETICS = {
  hats: [
    { id: 'hat_cap', name: 'Casquette', icon: '🧢', unlock: 'De base' },
    { id: 'hat_none', name: 'Rien', icon: '🚫', unlock: 'De base' },
    { id: 'hat_chef', name: 'Toque', icon: '👨‍🍳', unlock: 'Terminer le lieu 1' },
    { id: 'hat_bandana', name: 'Bandana', icon: '🟥', unlock: 'Succès « Ramasseur »' },
    { id: 'hat_beanie', name: 'Bonnet', icon: '🧶', unlock: 'Succès « Rénovateur »' },
    { id: 'hat_headphones', name: 'Casque audio', icon: '🎧', unlock: 'Succès « Service ! »' },
    { id: 'hat_helmet', name: 'Casque de chantier', icon: '⛑️', unlock: 'Succès « Démolisseur »' },
    { id: 'hat_goggles', name: 'Lunettes de plongée', icon: '🥽', unlock: 'Succès « Haute pression ! »' },
    { id: 'hat_cowboy', name: 'Chapeau de cowboy', icon: '🤠', unlock: 'Succès « Bas de laine »' },
    { id: 'hat_party', name: 'Chapeau de fête', icon: '🥳', unlock: 'Succès « Cinq étoiles »' },
    { id: 'hat_pirate', name: 'Tricorne', icon: '🏴‍☠️', unlock: 'Terminer le lieu 5' },
    { id: 'hat_tophat', name: 'Haut-de-forme', icon: '🎩', unlock: 'Succès « Roi des poubelles »' },
    { id: 'hat_crown', name: 'Couronne', icon: '👑', unlock: 'Succès « Millionnaire »' },
    { id: 'hat_halo', name: 'Auréole', icon: '😇', unlock: 'Terminer tous les lieux' },
  ],
  colors: [
    { id: 'color_blue', name: 'Bleu travail', color: '#2f6fd6', unlock: 'De base' },
    { id: 'color_teal', name: 'Turquoise', color: '#1ea59a', unlock: 'De base' },
    { id: 'color_green', name: 'Vert', color: '#3aa64a', unlock: 'Succès « Aspirateur humain »' },
    { id: 'color_red', name: 'Rouge', color: '#d23a3a', unlock: 'Succès « Restaurateur »' },
    { id: 'color_orange', name: 'Orange', color: '#ee8a1e', unlock: 'Succès « Débarrasseur »' },
    { id: 'color_purple', name: 'Violet', color: '#8a4fd8', unlock: 'Succès « Chef d\'équipe »' },
    { id: 'color_pink', name: 'Rose', color: '#e85aa8', unlock: 'Succès « Brillant ! »' },
    { id: 'color_black', name: 'Noir', color: '#2b2d33', unlock: 'Succès « Frote Frote »' },
    { id: 'color_white', name: 'Blanc chef', color: '#f1f1f1', unlock: 'Terminer le lieu 3' },
    { id: 'color_gold', name: 'Or', color: '#e8b923', unlock: 'Succès « Empire de la bouffe »' },
  ],
};
