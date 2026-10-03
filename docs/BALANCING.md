# Équilibrage

## Principe : unités de base × `costScale`

Dans un fichier de lieu, tous les montants sont en **unités de base** (le lieu 1 a
`costScale: 1`). Le jeu multiplie par `economy.costScale` : coûts des entités et des salles,
prix du produit, valeur des déchets, `reward`/`bonus` des salles, récompenses de quêtes,
coûts des améliorations et pécule de départ. Ainsi chaque lieu a des nombres de plus en plus
grands (sensation de progression) tout en gardant un rythme comparable.

| Lieu | costScale | outil de départ |
|---|---|---|
| 1 Snack | 1 | éponge |
| 2 Café | 5 | éponge |
| 3 Pizzeria | 25 | serpillière |
| 4 Sushis | 120 | serpillière |
| 5 Diner | 600 | serpillière |
| 6 Crêperie | 3 000 | serpillière |
| 7 Food court | 15 000 | haute pression |
| 8 Palace | 80 000 | haute pression |

## Formules

- Prix d'un produit = `product.price × costScale × priceMul` (menu premium +22 %/niv., talent +10 %/niv.).
- Commande d'un client : 1 à `orderMax` produits.
- Pourboire (laissé sur la table) = prix × quantité × 0,3 × réputation / 5.
- Intervalle entre clients = `customerInterval / (adsMul × (0,55 + 0,13 × réputation))`,
  ±30 % aléatoire ; clients présents ≤ places assises + capacité des files.
- Production d'une machine = `2,4 s × station.time / cookMul` (cuisine rapide +20 %/niv.),
  stock max 5 (+1 tous les 2 niveaux de cuisine).
- Stock max d'un comptoir = 14 + 2 × niveau de cuisine.
- Coût d'une amélioration au niveau L = `round(base × growth^L × costScale)` (`data/upgrades.js`).
- Frottage : argent = quantité retirée × `reward × costScale / saleté initiale de la salle`.
- Vitesse de nettoyage = `3,2 × puissance outil × huile de coude × (1 − 0,7 d²/r²) / dureté`
  par seconde (× 0,06 si l'outil est d'un palier insuffisant).

Constantes globales : `BASE` dans `src/game/economy.js` (vitesses, patience, chances de
taches…). Stats dérivées : `computeStats()` au même endroit.

## Le simulateur

`node tools/sim.mjs <index|all> [--minutes=90] [--verbose] [--trace=MIN]`

Un bot joue avec la vraie logique (sans rendu) : il vide son sac quand il est plein, achète
les zones abordables les moins chères, nettoie les salles (déchets → encombrants → saleté),
achète des améliorations « bon marché » (et l'outil s'il est bloqué), puis fait tourner le
restaurant (ramasse la caisse, débarrasse, approvisionne, sert). Il affiche l'horodatage de
chaque achat, salle et étoile. `--trace=MIN` imprime l'état détaillé (clients, comptoirs,
personnel) toutes les 10 s à partir de la minute MIN, pratique pour trouver un blocage.

Le bot est plus efficace qu'un humain : compter **×1,3 à ×2** pour un vrai joueur
(déplacements moins optimaux, lecture des menus, pauses).

### Résultats actuels (bot)

| Lieu | Tout construit | Clients servis |
|---|---|---|
| 1 Snack | 30 min | 540 |
| 2 Café | 35 min | 650 |
| 3 Pizzeria | 47 min | 880 |
| 4 Sushis | 33 min | 950 (3ᵉ ★ à 45 min) |
| 5 Diner | 41 min | 1 150 (3ᵉ ★ à 49 min) |
| 6 Crêperie | 47 min | 1 300 (3ᵉ ★ à 66 min) |
| 7 Food court | 33 min | 1 200 |
| 8 Palace | 46 min | 1 300 (3ᵉ ★ à 58 min) |
| **Total** | **≈ 5 h 10** | soit environ 7 à 10 h pour un joueur |

Les talents (achetés avec les étoiles) accélèrent les lieux suivants pour un vrai joueur ;
le bot les simule sans talents (option `--talents=t_speed:2,t_income:3` pour tester).

## Leviers de réglage

- **Durée d'un lieu** : nombre d'entités et leurs coûts, `reward`/`bonus` des salles, prix
  du produit, `customerInterval`, `orderMax`.
- **Début de lieu** : il faut pouvoir acheter comptoir + machine + table avec l'argent de la
  première salle (déchets + frottage + prime ≈ 75 unités au lieu 1).
- **Fin de lieu** : l'enseigne finale coûte cher (≈ 1 200 à 2 500 unités) ; si l'attente
  dépasse ~8 min, baisser son prix.
- **Difficulté du nettoyage** : `cover`, `amount`, types (palier d'outil) et `scale` des couches.
- **3ᵉ étoile** : `goals.served` (sinon 350 + 200 × index).

Après tout changement : `npm test`, puis `node tools/sim.mjs all` et mettre à jour ce tableau.
