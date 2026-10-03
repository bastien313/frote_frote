# AGENTS.md

Les consignes pour les agents IA (architecture, commandes, invariants, recettes) sont dans
[`CLAUDE.md`](CLAUDE.md). La documentation détaillée est dans [`docs/`](docs/).

Résumé minimal :
- Jeu HTML5/Canvas en modules ES natifs, **sans dépendance ni build**.
- `npm test` doit rester vert ; `node tools/sim.mjs <n°>` mesure l'équilibrage d'un lieu.
- Tout nouveau fichier runtime doit être ajouté à `ASSETS` dans `sw.js`.
- À chaque publication, incrémenter `VERSION` dans `src/main.js`, `sw.js` et `package.json`.
