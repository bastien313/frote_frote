# Architecture technique

Frote Frote est une application web statique : `index.html` charge `src/main.js` en module ES,
qui importe tout le reste. Aucun bundler, aucun framework, aucune dépendance runtime.

## Vue d'ensemble

```
                ┌──────────── src/main.js (App) ────────────┐
                │ charge/écrit la sauvegarde, boucle rAF,    │
                │ relie les événements du Game à l'UI/audio  │
                └───┬───────────────┬───────────────┬────────┘
                    │               │               │
         src/game/Game        src/render/      src/ui/ui.js (DOM)
   (logique pure, Node-OK)    Renderer          HUD + menus
    LevelMap · DirtLayer      (canvas 2D)
    entités · agents          lit l'état du     src/engine/
    quêtes · économie         Game, ne le       audio · input ·
                              modifie pas        storage · particules
```

- **Game** (`src/game/game.js`) possède un seul lieu : carte, saleté, entités, déchets,
  encombrants, clients, personnel, zones d'achat, quêtes, argent. `update(dt)` fait avancer
  la simulation. Il ne connaît ni le DOM ni le canvas : il émet des événements.
- **App** (`src/main.js`) crée le Game du lieu courant, transmet l'entrée (`game.input`),
  appelle `game.update`, `renderer.render`, `ui.update`, sauvegarde toutes les 10 s et quand
  la page est masquée, gère les gains hors-ligne, les étoiles et les succès.
- **Renderer** dessine l'état courant à chaque frame ; il ne modifie l'état que pour
  `game.view` (zone visible, utilisée pour éviter des effets hors écran).

## Boucle d'une frame

`App.frame(t)` :
1. `input.vector()` → `game.input` (joystick virtuel ou clavier, norme ≤ 1)
2. `game.update(dt)` (dt plafonné à 0,1 s) :
   joueur (déplacement, frottage, interactions, encombrants) → personnel (IA + interactions)
   → clients (IA) → machines (production) → comptoirs (service) → apparition des clients
   → objets volants → zones d'achat → animations → particules → vérif. salles (0,4 s)
   → réputation + revenu automatique (1 s) → quêtes.
3. `renderer.render(game, dt, input)`
4. `ui.update(dt)` (écrit le DOM seulement si une valeur change)
5. son de frottage (`audio.setScrub`), sauvegarde périodique, succès (toutes les 2 s).

## Coordonnées

- **Monde** : en tuiles, flottants. `(x, y)` = position au sol ; `z` = hauteur (rendu).
- **Tuile** : entiers `(tx, ty)`, index `ty * w + tx`.
- **Saleté** : `DIRT_RES` (10) cellules par tuile → grille `w*10 × h*10`.
- **Écran** : `renderer.sx(x)`, `renderer.sy(y, z)` ; `renderer.S` = pixels CSS par tuile
  (≈ largeur d'écran / 7,2, multipliée par le zoom des options). Le canvas est en
  `devicePixelRatio` (plafonné à 2, ou 1 en qualité « économie »).
- Vue « 3/4 de dessus » : le sol n'est pas écrasé, les volumes sont extrudés vers le haut.

## Carte et collisions (`level.js`)

La carte ASCII est parsée en `cell[]` (type de case), `roomIdx[]` (salle des cases sol/porte),
`locked[]` (portes fermées) et `furniture[]` (compteur de meubles bloquants).
`isSolid(tx, ty)` combine murs, portes fermées, salles verrouillées et meubles.
`moveCircle` / `resolveCircle` gèrent les collisions cercle/tuiles avec glissement.
`version` est incrémenté à chaque changement de solidité → les agents recalculent leur chemin.

## Saleté (`dirt.js`)

- `amount` (0..1) et `type` (index dans `DIRT_TYPES`) par cellule, `shade` (variation de teinte).
- Génération : pour chaque couche de saleté d'une salle, bruit fractal (gradient noise,
  octaves pivotées) seuillé au quantile `1 - cover` → la couverture est exacte.
- `clean(x, y, rayon, puissance, palier, dt, filtre)` : retire de la saleté dans un disque ;
  une saleté dont le palier d'outil requis est supérieur ne part qu'à 6 % de la vitesse.
- `tileSum` (somme par tuile) et `roomNow/roomInitial` (somme par salle) sont maintenus
  incrémentalement pour les pourcentages et la recherche « saleté la plus proche ».
- Rendu : `pixels` (RGBA, 1 px par cellule) recalculés par zone avec un flou 3×3 pondéré
  (couleur et opacité), puis le renderer dessine ce petit canvas agrandi avec lissage
  bilinéaire → taches aux bords doux. Seule la zone modifiée est envoyée (`putImageData`).
- Sauvegarde : RLE + base64 des quantités (quantifiées sur 8 bits) et des types.

## Entités (`entities.js`)

Construites à partir de `def.entities` du lieu : `Counter`, `Station`, `Table`, `Bin`,
`Decor`, `HirePoint`. Chacune a `tiles` (emprise bloquante), `pad` (position de la zone
d'achat), `cost`, `built`, `paid`, et ses points d'interaction :
- Comptoir : `service` (derrière, où se tient le caissier), `dropPos`, `cashPos`, `stockPos`,
  `queueSlot(i)` (file devant), `queue[]`, `stock`, `cash`.
- Machine : `pickup` (devant), `stock`, `t` (progression de cuisson).
- Table : `seats[]` (`occupant`, `reserved`, `mess`, `claimed`).
- Benne : `access` (case libre adjacente, calculée à la construction).

## Interactions (`Game.agentInteract`)

Basées sur la proximité, partagées par le joueur et le personnel (filtrées par rôle) :
ramassage des déchets (aimant), dépôt à la benne, prise des plats à la machine, dépôt au
comptoir, ramassage de la caisse (joueur), débarrassage des tables. Les transferts sont
cadencés (`agent.cool`) et visualisés par des **flyers** (objets en vol interpolés en arc).
Le service client se fait dans `updateCounters` : il faut le joueur ou un caissier sur la
case `service`, un client en tête de file et du stock.

## Agents (`agents.js`)

- `Agent.walkTo(game, x, y, vitesse, dt)` : A* 8 directions sans couper les coins
  (`util/path.js`), lissage par ligne de vue, détection de blocage (recalcul puis téléportation
  sur la case libre la plus proche en dernier recours).
- **Client** : `queue` → (servi) `toSeat` ou `waitSeat` → `eat` → `leave`. Patience en file
  (75 s) et en attente de table (30 s) ; un client qui abandonne fait baisser la réputation.
  En fin de repas : table sale (déchets + pourboire), parfois une tache ou un déchet au sol.
- **Caissier** : reste sur la case service de son comptoir (`post`).
- **Serveur** : `fetch` (machine la plus fournie) → `deliver` (comptoir le moins rempli).
- **Agent d'entretien** : benne si sac plein → tables sales → déchets au sol → frottage des
  taches **uniquement dans les salles déjà nettoyées** (le nettoyage initial reste au joueur).
  Les cibles sont « réservées » (`claimed`) pour éviter les doublons.

## Zones d'achat (pads)

`refreshPads()` liste les achats visibles : salles verrouillées dont la zone d'accès est
propre, et entités non construites dont la salle est propre et dont les dépendances
(`after`, et `post` pour un caissier) sont satisfaites. Le joueur reste 0,3 s sur la zone,
puis l'argent est transféré progressivement (environ 1,3 s pour tout payer). Le paiement
partiel est conservé.

## Rendu (`render/renderer.js`)

1. sol (tuiles pré-dessinées en cache par style/variante/échelle) ;
2. saleté (masque agrandi) ;
3. zones d'achat ;
4. **liste triée par profondeur** (`y` du bas de l'objet) : murs, barrières, arbres, haies,
   clôtures, meubles, chaises, déchets, encombrants, personnages ; les murs devant le joueur
   deviennent semi-transparents ;
5. brouillard des salles verrouillées (+ cadenas, nom, prix) ;
6. objets volants, particules, textes flottants ;
7. bulles d'émotion, commandes des clients, jauge du sac, flèche de guidage, joystick.

Les sprites sont procéduraux (`render/draw.js`), les petits objets (plats, déco, chapeaux)
utilisent des emoji mis en cache dans des canvas (`emoji(ch, taille)`).

## Événements émis par `Game`

| Événement | Arguments | Usage |
|---|---|---|
| `sfx` | nom, options | son (`audio.play`) : pop, deposit, pick, drop, serve, cash, tick, build, upgrade, unlock, fanfare, quest, star, error, hit, break, clear, angry |
| `haptic` | ms | vibration (si activée) |
| `shake` | intensité | tremblement de caméra |
| `toast` | texte | message en haut de l'écran |
| `money` | montant, source | animation du compteur d'argent |
| `roomUnlocked` / `roomCleaned` | salle | toasts, sauvegarde |
| `built` | entité | sauvegarde |
| `star` | index 0-2 | étoile de lieu → méta (talents) |
| `levelComplete` | — | déblocage du lieu suivant, popup |
| `blockedTool` | type de saleté | (info) outil trop faible |
| `questDone` | quête | (info) |

## UI (`ui/ui.js`)

DOM superposé au canvas (`#ui`, `pointer-events: none` sauf boutons/fenêtres) :
barre du haut (argent, réputation, étoiles), carte d'objectif, progression de la salle,
boutons latéraux (Améliorer, Lieux, Talents, Style, Options) avec pastilles, toasts, et
fenêtres modales (améliorations, carte des lieux, talents/succès, garde-robe, options,
intro de lieu, gains hors-ligne, lieu terminé). Le bouton retour Android ferme la fenêtre
ouverte (`history.pushState`). Pendant qu'une fenêtre est ouverte, l'entrée de jeu est coupée
mais la simulation continue.

## Audio (`engine/audio.js`)

WebAudio, déverrouillé au premier geste. Effets = oscillateurs/bruit filtré courts. Une boucle
de bruit filtré suit l'intensité de frottage (timbre selon l'outil). Musique générative douce
(accords + notes aléatoires dans une gamme), volumes dans les options.

## Stockage (`engine/storage.js`)

Sauvegarde JSON écrite dans **IndexedDB** et copiée dans **localStorage** ; au chargement on
garde la plus récente (`savedAt`). `navigator.storage.persist()` est demandé au premier geste.
Export/import par code texte `FF1:<base64>`. Détails : `docs/SAVE_FORMAT.md`.

## PWA

`manifest.webmanifest` (plein écran, portrait, icônes 192/512 + maskable) et `sw.js`
(pré-cache de tous les fichiers, stratégie cache d'abord, nettoyage des anciens caches à
l'activation). Le service worker n'est pas enregistré en `?debug` ni en `file://`.
