# CLAUDE.md — Guide pour les agents IA

Ce fichier est lu automatiquement par Claude Code (et sert de référence à tout agent IA)
avant de modifier **Frote Frote**, un jeu HTML5 de nettoyage / gestion « arcade idle »
installable en PWA et hébergé sur GitHub Pages. Lis-le en entier avant de coder.

## En bref

- **Aucune dépendance, aucun build** : HTML + CSS + JavaScript (modules ES natifs) + Canvas 2D.
  Les fichiers du dépôt sont servis tels quels par GitHub Pages.
- **Langue** : interface et docs en français ; code, identifiants et commentaires en anglais.
- **Tout est procédural** : pas d'images (hors icônes PWA) ni de sons ; sprites dessinés en canvas
  (`src/render/draw.js`) + emoji, sons synthétisés en WebAudio (`src/engine/audio.js`).
- **La logique de jeu est indépendante du DOM** (`src/game/`) : elle tourne aussi dans Node
  (tests, simulateur d'équilibrage). Ne jamais y utiliser `document`, `window`, `localStorage`…

## Commandes

| Commande | Rôle |
|---|---|
| `npm test` | Tous les tests (`node --test`) : validation des niveaux, logique, PWA. **Doit rester vert.** |
| `npm start` | Serveur local → http://localhost:8080 (ou `python3 -m http.server`) |
| `node tools/sim.mjs <n°\|all> [--minutes=90] [--verbose] [--trace=MIN]` | Bot qui joue un lieu (index 0-based) et mesure la durée de chaque étape |
| `node tools/print-map.mjs <n°>` | Affiche la carte d'un lieu avec ses entités superposées |
| `node tools/make-icons.mjs` | Régénère les icônes PWA (nécessite Playwright/Chromium) |

Mode debug : ouvrir `index.html?debug` → pas de service worker, écran titre sauté, et la
console expose `dbg.money(n)`, `dbg.clean()`, `dbg.buyAll()`, `dbg.level(i)`, `dbg.unlockAll()`,
`dbg.stars(n)`. `window.__app` donne accès à l'application (`__app.game` = partie en cours).

## Carte du code

```
index.html, css/style.css      Page + styles de l'UI (HUD, menus, écran titre)
manifest.webmanifest, sw.js    PWA (installation Android, cache hors-ligne)
src/main.js                    App : chargement/sauvegarde, boucle, branchement événements → audio/UI
src/game/                      LOGIQUE PURE (testable dans Node)
  game.js       Game : un lieu en cours (update, interactions, clients, achats, salles, étoiles)
  level.js      LevelMap : parse la carte ASCII, salles, collisions, solidité dynamique
  dirt.js       DirtLayer : grille de saleté (génération, nettoyage, rendu RGBA, RLE)
  entities.js   Comptoir, Machine (station), Table, Benne, Déco, Point d'embauche
  agents.js     Joueur, Clients, Personnel (déplacement A*, IA à états)
  economy.js    Stats dérivées (améliorations + talents) et constantes BASE
  quests.js     Objectifs (tutoriel scripté puis objectifs automatiques) + cible de la flèche
  save.js       Modèle de sauvegarde, migration, succès, talents
src/render/                    Rendu canvas (renderer.js = pipeline, draw.js = sprites)
src/ui/ui.js                   HUD et menus DOM
src/engine/                    Entrées, audio, particules, stockage (IndexedDB + localStorage)
src/data/                      DONNÉES : catalogues, améliorations, méta, lieux (levels/*.js)
tools/                         Simulateur, impression de carte, icônes
tests/                         Tests Node (node:test)
docs/                          Documentation détaillée (voir ci-dessous)
```

Docs détaillées : `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, `docs/LEVEL_FORMAT.md`,
`docs/BALANCING.md`, `docs/SAVE_FORMAT.md`, `docs/ROADMAP.md`.

## Règles à respecter (invariants)

1. **Nouveau fichier runtime** (dans `src/`, `css/`, `icons/`) → l'ajouter à `ASSETS` dans `sw.js`
   (sinon le jeu installé hors-ligne casse). `tests/pwa.test.mjs` le vérifie.
2. **Chaque publication** → incrémenter la version **au même endroit dans 3 fichiers** :
   `src/main.js` (`VERSION`), `sw.js` (`VERSION`) et `package.json`. Sans ça, les joueurs
   gardent l'ancienne version en cache. Le test vérifie l'égalité.
3. **Compatibilité des sauvegardes** : ne jamais renommer l'`id` d'un lieu, d'une salle ou d'une
   entité (la sauvegarde y fait référence). Ajouter des champs → prévoir une valeur par défaut
   dans `Game.load()` / `migrate()`. Changer la taille d'une carte régénère sa saleté (géré).
4. **Coûts des lieux en « unités de base »** : tous les prix d'un fichier `levels/*.js`
   (entités, salles, récompenses, prix du produit, valeur des déchets) sont multipliés par
   `economy.costScale`. Les améliorations aussi.
5. **Après toute modification de niveau** : `npm test` (valide accessibilité, chevauchements…)
   puis `node tools/sim.mjs <n°>` pour vérifier que le lieu se termine et en combien de temps.
6. `src/game/` ne doit dépendre ni du DOM ni du rendu. Pour notifier l'UI/l'audio, utiliser
   `game.emit(evt, ...)` (événements listés dans `docs/ARCHITECTURE.md`).
7. Garder le jeu **sans publicité, sans tracker, sans requête réseau externe** (exigence du projet).

## Recettes rapides

- **Ajouter un lieu** : copier `src/data/levels/02-cafe.js`, changer `id`/carte/entités, l'importer
  dans `src/data/levels/index.js`, l'ajouter à `sw.js`, puis `npm test` + simulateur.
  Format complet : `docs/LEVEL_FORMAT.md`.
- **Ajouter une amélioration** : entrée dans `src/data/upgrades.js` (+ utilisation de sa valeur
  dans `src/game/economy.js` → `computeStats`). L'UI la liste automatiquement.
- **Ajouter un type de saleté / déchet / encombrant / déco** : `src/data/catalog.js`
  (+ dessin éventuel dans `src/render/draw.js`).
- **Ajouter un talent / succès / cosmétique** : `src/data/meta.js` (+ effet dans `economy.js`).
- **Changer l'équilibrage** : `docs/BALANCING.md` explique les leviers ; mesurer avec le simulateur.

## Pièges connus

- Les coordonnées logiques sont en **tuiles** (flottants) ; la grille de saleté a `DIRT_RES` (10)
  cellules par tuile ; le rendu convertit avec `renderer.S` pixels CSS par tuile.
- `LevelMap.version` s'incrémente quand la solidité change (salle ouverte, meuble construit) :
  les agents recalculent leur chemin automatiquement.
- Les zones d'achat (« pads ») d'une salle n'apparaissent qu'une fois la salle **nettoyée**
  (≥ 94 %, plus aucun déchet ni encombrant) et leurs dépendances `after` satisfaites.
- Un comptoir autre que le premier n'accueille des clients que s'il a un caissier (`counterOpen`).
- Tester visuellement : Playwright + Chromium sont disponibles dans le conteneur
  (`/opt/pw-browsers/chromium`) ; lancer un serveur statique et faire des captures.
