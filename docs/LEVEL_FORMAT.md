# Format des lieux (niveaux)

Chaque lieu est un module `src/data/levels/NN-nom.js` qui exporte un objet par défaut,
importé et ordonné dans `src/data/levels/index.js`. Après modification :
`npm test` (validation automatique) puis `node tools/print-map.mjs <index>` et
`node tools/sim.mjs <index>`.

## Champs principaux

```js
export default {
  id: 'cafe',                       // identifiant STABLE (clé de sauvegarde) — ne jamais le renommer
  name: 'Le Café de la Gare',       // nom affiché
  intro: '…',                       // texte de la fenêtre d'introduction
  icon: '☕',                        // emoji (carte des lieux, zones d'achat des machines)
  product: { id: 'coffee', name: 'Café', price: 5 },   // id → emoji dans PRODUCT_EMOJI (draw.js)
  station: { name: 'Machine à café', draw: 'coffee', time: 0.9 },
  // draw : grill | coffee | oven | sushi | hotdog | crepe | taco | pastry (render/draw.js)
  // time : multiplicateur du temps de production (BASE.stationTime = 2,4 s)
  messKinds: ['cup', 'paper', 'plate'],  // déchets laissés sur les tables (TRASH_KINDS)
  theme: {                          // couleurs du lieu
    wallTop, wallFront, wallLine,   // dessus / façade / joints des murs
    ext: 'pavement',                // style de sol extérieur (clé de FLOORS)
    fog: '#1e1a1a',                 // couleur du brouillard des salles verrouillées
    accent,                         // façade des comptoirs
    chair, table, tableLeg, counterTop, void,
  },
  economy: {
    costScale: 5,          // multiplie TOUS les prix du fichier + améliorations
    trashValue: 1,         // valeur de base d'un déchet (× costScale × valeur du type)
    customerInterval: 3.4, // secondes entre deux clients (avant pub/réputation)
    orderMax: 3,           // un client commande 1..orderMax produits
    eatTime: [5, 8],       // durée du repas (s)
    startTool: 1,          // palier d'outil de départ (1 éponge … 4 autolaveuse)
    spill: 'coffee',       // type de saleté des taches laissées par les clients
  },
  goals: { served: 1200 }, // optionnel : clients à servir pour la 3e étoile (défaut 350 + 200 × index)
  start: [14.5, 12.5],     // position de départ du joueur (monde, en tuiles)
  spawns: [[0.5, 16.5], [27.5, 16.5]], // points d'arrivée/départ des clients (sur la rue)
  map: [ '…' ],            // carte ASCII (voir légende) — toutes les lignes de même longueur
  rooms: { A: {…}, B: {…} },
  entities: [ … ],
  quests: [ … ],           // optionnel : quêtes scriptées (tutoriel), voir plus bas
};
```

## Légende de la carte

| Caractère | Signification |
|---|---|
| `A`…`Z` | sol de la salle de même lettre (doit exister dans `rooms`) |
| `a`…`z` | porte/cloison vers la salle de la lettre majuscule : bloquée tant que la salle n'est pas achetée |
| `#` | mur |
| `W` | mur avec fenêtre |
| `.` | trottoir / extérieur praticable |
| `,` | herbe praticable |
| `:` | sable extérieur praticable |
| `=` | entrée (praticable, paillasson) |
| `T` | arbre (bloquant) |
| `~` | haie (bloquante) |
| `_` | clôture (bloquante) |
| `w` | eau (bloquante) |
| ` ` (espace) | vide (bloquant) |

Attention : `w` (eau) n'est **pas** une porte, il ne faut donc pas créer de salle `W`.

Une salle peut être en extérieur (terrasse, parking, plage…) : il suffit de l'entourer de
murs, clôtures, haies ou eau. Une salle payante doit avoir au moins une case porte. La zone
d'achat pour l'ouvrir se place automatiquement devant la porte médiane, côté déjà ouvert
(ou à la position `pad: [x, y]` de la salle).

## Salles (`rooms`)

```js
B: {
  name: 'Cuisine',
  floor: 'tiles_white',          // clé de FLOORS (catalog.js)
  cost: 60,                      // 0 = ouverte au départ (au moins une salle gratuite)
  trash: { count: 18, kinds: { box: 2, can: 3, bone: 2 } }, // déchets générés (poids par type)
  junk: ['fridge', 'crate'],     // encombrants (JUNK_KINDS)
  dirt: [                        // couches de saleté, dessinées dans l'ordre (la dernière par-dessus)
    { type: 'grease', cover: 0.55, amount: 0.9, scale: 1.8 },
    // type : DIRT_TYPES ; cover : part du sol couverte (0..1) ;
    // amount : intensité max (0..1) ; scale : taille des taches en tuiles
  ],
  reward: 90,                    // argent gagné en frottant toute la saleté initiale (× costScale)
  bonus: 60,                     // prime quand la salle devient propre (× costScale)
  ratingBonus: 0.5,              // optionnel : bonus de réputation une fois propre
  after: ['t3'],                 // optionnel : dépendances avant d'afficher la zone d'achat
  pad: [x, y],                   // optionnel : position forcée de la zone d'achat
}
```

Le palier d'outil requis vient du type de saleté (`DIRT_TYPES[].tier`) : 1 poussière, boue,
sable, taches ; 2 graisse, suie ; 3 moisissure, crasse, peinture ; 4 huile de vidange.
Une salle est « propre » quand il reste ≤ 6 % de sa saleté initiale et plus aucun déchet ni
encombrant ; la saleté restante est alors effacée avec des étincelles.

## Entités (`entities`)

Champs communs : `id` (stable !), `type`, `x`, `y` (tuile), `cost` (× costScale),
`after: ['id', 'B']` (entités à construire / salles à ouvrir avant d'apparaître),
`built: true` (déjà présente au départ, ex. la benne), `final: true` (dernier achat, l'enseigne).

| type | champs spécifiques | emprise / points d'interaction |
|---|---|---|
| `counter` | `w` (largeur, déf. 2), `face` (`down`/`up`/`left`/`right`, côté clients), `queueLen` | `w` tuiles ; case `service` derrière ; file de `queueLen` cases devant |
| `station` | `face` | 1 tuile ; case `pickup` devant (dans la direction `face`) |
| `table` | `seats` : `lr` (déf.), `ud`, `4`, `l`, `r` | 1 tuile ; chaises sur les cases voisines |
| `bin` | — | 1 tuile ; dépôt dans un rayon de 1,6 tuile |
| `decor` | `kind` (DECOR_KINDS) | 1 tuile si `blocks` ; ajoute de la réputation |
| `hire` | `role` : `cashier` / `server` / `cleaner` ; `post` (id du comptoir, obligatoire pour un caissier) | aucune ; l'employé apparaît sur la zone |

Une entité n'apparaît comme zone d'achat que lorsque sa salle est ouverte **et propre** et que
ses dépendances sont satisfaites. Le lieu est terminé (2ᵉ étoile, lieu suivant débloqué) quand
toutes les salles sont ouvertes et toutes les entités construites.

Le **premier** comptoir construit accueille toujours les clients ; les suivants seulement
s'ils ont un caissier.

## Quêtes scriptées (`quests`, optionnel)

Affichées dans l'ordre avant les objectifs automatiques. Types :

| kind | paramètres | se valide quand |
|---|---|---|
| `collect` | `n` | n déchets ramassés |
| `deposit` | `n`, `target` | n déchets vidés dans la benne |
| `scrub` | `n` | n tuiles de saleté frottées |
| `smash` | `n` | n encombrants cassés |
| `cleanRoom` | `room` | la salle est propre |
| `build` | `id` | l'entité est construite |
| `unlock` | `room` | la salle est ouverte |
| `pickFood` | `n`, `target` | n plats pris à une machine |
| `serve` | `n`, `target` | n clients servis |
| `collectCash` | `n` | caisse ramassée n fois |
| `cleanTable` | `n` | n places débarrassées |
| `upgrade` | `n` | n améliorations achetées |

`text` est affiché, `reward` (× costScale) est donné à la fin. Les étapes devenues
impossibles (plus rien à ramasser…) sont sautées automatiquement. Ensuite viennent les
objectifs automatiques : nettoyer la salle sale la plus proche, puis acheter la zone d'achat
la moins chère, puis servir assez de clients pour la 3ᵉ étoile.

## Ce que vérifie `tests/levels.test.mjs`

- lignes de même longueur, salles/portes/types connus, une salle gratuite au moins ;
- ids uniques, dépendances existantes, caissiers rattachés à un comptoir ;
- entités posées sur du sol, sans chevauchement ; files, chaises, cases de service et de
  retrait non bloquées et sans conflit entre elles ; zones d'achat des salles libres ;
- avec tout construit : apparition, départ, toutes les places, files, machines, bennes et
  toutes les cases libres de chaque salle accessibles depuis la rue ;
- le lieu se crée, se sérialise et se recharge ; il a comptoir, machine, table, benne et une
  entité `final`.

## Méthode conseillée pour créer un lieu

1. Dessiner la carte (salle de départ en bas, entrée `==` vers la rue, rue sur 2 lignes,
   points d'apparition aux extrémités de la rue).
2. Poser benne, comptoir (file vers l'entrée), 2 machines derrière le comptoir, quelques
   tables, un point d'embauche de caissier ; puis le contenu des autres salles.
3. Chaîner les `after` pour guider la progression (prix croissants, environ ×1,15 à ×1,3
   par achat) ; terminer par l'enseigne `final`.
4. `node tools/print-map.mjs N` pour visualiser, `npm test` pour valider,
   `node tools/sim.mjs N` pour la durée (viser 30 à 50 min de bot).
5. Ajouter le fichier à `sw.js` (ASSETS) et à `levels/index.js`.
