# Format de sauvegarde

## Stockage

- Clé `frotefrote.save` dans **IndexedDB** (base `frotefrote`, store `kv`) **et** dans
  **localStorage** (copie de secours). Au chargement, la copie dont `savedAt` est la plus
  récente gagne (`src/engine/storage.js`).
- Écriture : toutes les 10 s, ~1 s après un événement important (achat, étoile…), quand la
  page est masquée (`visibilitychange`) et à `pagehide`.
- `navigator.storage.persist()` est demandé au premier geste : sur Android, une PWA installée
  obtient généralement un stockage persistant (non effacé automatiquement).
- Export / import : code texte `FF1:` + base64 (UTF-8) du JSON complet (menu ⚙️ Options).

## Structure (`src/game/save.js`)

```js
{
  version: 1,
  createdAt, savedAt,          // timestamps ms
  current: 0,                  // index du lieu en cours
  unlocked: 1,                 // nombre de lieux débloqués
  levels: {                    // état de chaque lieu visité, par id de lieu
    snack: <Game.serialize()>,
  },
  meta: {
    stars, starsEarned,        // étoiles disponibles / gagnées au total
    talents: { t_speed: 2 },   // niveaux de talents
    stats: { trash, rooms, served, tables, junk, hired, earned, scrubbed, washer, rating5 },
    achievements: { trash_100: <timestamp> },
    levelStars: { snack: [1, 1, 0] },
    completed: { snack: <timestamp> },
    cosmetics: { hat, color, colorValue, skin, unlocked: [ids] },
    settings: { music, sfx, vibration, quality: 'high'|'low', zoom },
    lastActive,                // pour les gains hors-ligne
    introSeen: { snack: 1 },
  },
}
```

### État d'un lieu (`Game.serialize()`)

```js
{
  v: 1, id: 'snack', t,
  money, earned, served, rating, lost, autoRate, playTime,
  upgrades: { bag: 3, tool: 1, … },
  stars: [0|1, 0|1, 0|1], completed,
  rooms: { A: { u: 1, c: 1, p: <payé>, ti: <déchets initiaux> } },   // u = ouverte, c = propre
  ents:  { counter1: { b: 1, p: <payé>, s: <état propre à l'entité> } },
          // comptoir s = { s: stock, c: caisse } ; machine s = { s: stock } ;
          // table s = [0 | [nbDéchets, pourboire, [types]] par place]
  dirt: { r: 10, w, h, a: <RLE base64 des quantités 0..255>, t: <RLE des types>, i: [saleté initiale par salle] },
  trash: [[x, y, indexType, rotation]],
  junk:  [[x, y, indexType, pv]],
  player: { x, y, bag: [valeurs], food },
  quest: { i: <index de quête scriptée>, p: <progression> },
}
```

Ne sont **pas** sauvegardés : clients en cours, tâches du personnel (recréé à partir des
entités `hire` construites), objets en vol, particules.

## Compatibilité et migrations

- `migrate(save)` complète les champs manquants avec les valeurs par défaut : ajouter un
  champ dans `newSave()`/`newMeta()` suffit en général.
- `Game.load()` tolère les entités/salles absentes de la sauvegarde (valeurs par défaut) et
  ignore celles qui n'existent plus.
- Si la grille de saleté a changé (taille de carte ou `DIRT_RES`), elle est régénérée et les
  salles déjà propres sont remises à zéro de saleté.
- Pour un changement incompatible : incrémenter `SAVE_VERSION` et transformer l'ancien
  format dans `migrate()` (ne jamais perdre la progression d'un joueur).
- **Ne jamais renommer** l'`id` d'un lieu, d'une salle (lettre) ou d'une entité.
