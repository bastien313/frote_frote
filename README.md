# 🧽 Frote Frote

**Un jeu de nettoyage satisfaisant et de gestion de restaurants, façon « arcade idle »…
mais gratuit, hors-ligne et sans aucune publicité.**

Tu hérites de lieux abandonnés et crasseux. Ramasse les déchets, frotte le sol, casse les
encombrants, puis investis l'argent gagné pour installer comptoirs, machines et tables.
Les clients arrivent, mangent, paient… et salissent à nouveau ! Embauche du personnel,
améliore ton équipement et rénove 8 établissements de plus en plus grands.

▶️ **Jouer** : https://bastien313.github.io/frote_frote/ (une fois GitHub Pages activé, voir plus bas)

## Le jeu

- 🗑️ **Ramassage** : marche sur les déchets, ils s'envolent dans ton sac (capacité limitée).
  Vide-le dans la benne ♻️ pour gagner de l'argent.
- 🧽 **Nettoyage** : passe sur les taches pour les effacer. 4 outils à débloquer :
  éponge → serpillière → nettoyeur haute pression → autolaveuse. Certaines saletés
  (graisse, moisissure, crasse, huile de vidange…) exigent un meilleur outil.
- 📦 **Encombrants** : reste à côté d'un vieux canapé, d'un frigo ou d'un pneu pour le casser
  en petits déchets.
- 💵 **Construction** : reste sur une zone d'achat au sol pour payer et faire apparaître
  comptoir, machine, table, décoration… ou abattre une cloison pour ouvrir une nouvelle pièce.
- 🍔 **Service** : prends les plats à la machine, pose-les au comptoir et reste derrière la
  caisse pour servir. Ramasse l'argent, débarrasse les tables sales (et leur pourboire !).
- 👥 **Personnel** : caissiers, serveurs et agents d'entretien automatisent la boutique,
  qui continue même quand tu n'es pas là (gains hors-ligne).
- ⭐ **Progression** : chaque lieu donne 3 étoiles (tout nettoyer, tout construire, servir
  assez de clients). Les étoiles et les succès achètent des **talents** permanents, et
  débloquent chapeaux et couleurs pour ton personnage.

8 lieux : le Snack abandonné 🍔, le Café de la Gare ☕, la Pizzeria 🍕, le Bar à sushis 🍣,
le Diner Route 66 🌭, la Crêperie du port 🥞, le Food court 🌮 et le Palace étoilé 🍰.
Compte plusieurs heures de jeu (environ 5 h pour un joueur très efficace, davantage en
jouant tranquillement et pour obtenir toutes les étoiles).

**Commandes** : glisse le doigt n'importe où sur l'écran (joystick virtuel), ou utilise les
touches ZQSD / WASD / flèches au clavier.

## Installer sur Android (PWA)

1. Ouvre le lien du jeu dans **Chrome**.
2. Menu ⋮ → **« Installer l'application »** (ou « Ajouter à l'écran d'accueil »).
   Le bouton 📲 apparaît aussi dans ⚙️ Options quand le navigateur le propose.
3. Le jeu se lance alors en plein écran, fonctionne **hors-ligne**, et la sauvegarde est
   **persistante** (IndexedDB + copie localStorage, stockage persistant demandé au navigateur).

💾 Sauvegarde : automatique toutes les 10 s et à la fermeture. Dans ⚙️ Options tu peux
**exporter** ta progression sous forme de code texte (copie de secours) et l'**importer**
sur un autre appareil.

## Publier avec GitHub Pages

Le dépôt contient un workflow (`.github/workflows/pages.yml`) qui teste puis publie le jeu
à chaque push sur `main`.

1. Fusionner cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
3. Le jeu est publié sur `https://<utilisateur>.github.io/frote_frote/`.

(Alternative sans Actions : Settings → Pages → *Deploy from a branch* → `main` / `(root)` ;
le jeu n'a pas besoin d'étape de build.)

> ⚠️ À chaque nouvelle version, incrémenter `VERSION` dans `src/main.js`, `sw.js` et
> `package.json`, sinon les joueurs ayant installé le jeu garderont l'ancienne version en cache.

## Développement

Aucune dépendance à installer : c'est du HTML/JS natif.

```bash
npm start                 # serveur local sur http://localhost:8080
npm test                  # tests (validation des niveaux, logique, PWA)
node tools/sim.mjs all    # un bot joue tous les lieux et mesure leur durée
node tools/print-map.mjs 0  # affiche la carte du lieu 1 avec ses entités
```

Ajoute `?debug` à l'URL pour les outils de debug (`dbg.money()`, `dbg.buyAll()`…).

La documentation technique (architecture, format des niveaux, équilibrage, sauvegarde,
pistes d'évolution) est dans [`docs/`](docs/), et les consignes pour les agents IA dans
[`CLAUDE.md`](CLAUDE.md).

## Licence

MIT — inspiré par le genre des jeux « cleaning / arcade idle » mobiles. Tous les graphismes
et sons sont générés par le code ; aucun asset tiers.
