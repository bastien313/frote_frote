# Game design

## Intention

Reprendre la boucle addictive des jeux mobiles « cleaning / arcade idle » (type *Clean It*)
— nettoyer un lieu insalubre, investir, servir, automatiser, s'agrandir — **sans publicité,
sans achat, hors-ligne**, avec une progression de plusieurs heures. Le plaisir principal est
le **feedback immédiat** : la saleté disparaît sous les pas, les déchets s'envolent dans le
sac, l'argent pleut, les meubles apparaissent avec un « pop ».

## Boucle principale

1. **Nettoyer** la salle : ramasser les déchets (→ sac), casser les encombrants, frotter le sol.
2. **Vider le sac** dans la benne → argent. Le frottage rapporte aussi un peu d'argent, et
   une salle propre donne une prime + fait apparaître les zones d'achat.
3. **Investir** : rester sur une zone d'achat (comptoir, machine, table, déco, embauche,
   ouverture de salle). Ou acheter des **améliorations** dans le menu ⬆️.
4. **Servir** : machine → plateau → comptoir → caisse. Le client paie (argent posé sur le
   comptoir, à ramasser), mange à une table, repart en laissant la table sale (déchets +
   pourboire) et parfois une tache ou un déchet au sol.
5. **Automatiser** : caissiers, serveurs, agents d'entretien. Le joueur peut alors se consacrer
   à l'ouverture et au nettoyage des nouvelles salles.
6. **Terminer** le lieu (tout acheter) → lieu suivant ; étoiles → talents permanents.

## Mécaniques

### Nettoyage
- Outil = disque devant le joueur. Rayon et puissance selon l'outil :
  éponge (0,5 / ×1), serpillière (0,62 / ×1,7), nettoyeur HP (0,82 / ×2,8), autolaveuse (1,1 / ×4,2).
- Chaque type de saleté a une dureté et un palier minimal d'outil (sinon 6 % de vitesse
  + message « outil trop faible »). Cela crée des objectifs d'amélioration dans chaque lieu.
- Feedback : bulles / gouttes / mousse selon l'outil, étincelles quand une zone est propre,
  bruit de frottement continu dont le volume suit l'intensité, petits « +$ ».

### Déchets et encombrants
- Déchets aspirés dans un rayon (aimant) tant que le sac n'est pas plein ; combo de « pop »
  dont la hauteur monte.
- Sac plein → bulle « PLEIN », la flèche guide vers la benne.
- Encombrants : rester au contact pour les frapper (barre de vie) → ils explosent en
  plusieurs déchets.

### Restaurant
- Machine : produit en continu jusqu'à son stock max (améliorable).
- Comptoir : stock de plats ; un client en tête de file est servi si quelqu'un tient la caisse.
- Tables : 1 à 4 places ; une place sale ne peut pas être réutilisée.
- File : jusqu'à `queueLen` clients ; patience 75 s. Sans table libre : attente 30 s puis départ
  fâché (pénalité de réputation).
- **Réputation** (0-5 ★) = propreté des tables + propreté des salles ouvertes + déco + bonus de
  salles (toilettes…) − clients perdus − déchets au sol. Elle augmente la fréquence des
  clients et les pourboires.

### Personnel
| Rôle | Comportement |
|---|---|
| Caissier·ère | tient la caisse d'un comptoir précis |
| Serveur·se | transporte les plats des machines vers le comptoir le moins rempli |
| Agent d'entretien | débarrasse les tables, ramasse les déchets au sol, vide son sac, frotte les nouvelles taches (dans les salles déjà propres) |

Améliorations du personnel : vitesse et capacité.

### Progression dans un lieu
Les zones d'achat sont chaînées par des dépendances (`after`), avec des prix croissants ;
l'objectif affiché propose toujours l'achat le moins cher disponible. Améliorations (par lieu,
remises à zéro dans chaque nouveau lieu) : baskets, sac, plateau, outil, huile de coude,
menu premium (prix), publicité (clients), cuisine rapide, personnel rapide, personnel costaud.

### Méta-progression (permanente)
- **Étoiles** : 3 par lieu (tout nettoyé, tout construit, X clients servis) + succès.
- **Talents** achetés avec les étoiles : vitesse, sac, revenus, nettoyage, aimant, pécule de
  départ, gains hors-ligne, outil de départ.
- **Succès** (16) : statistiques cumulées (déchets, pièces, clients, tables…) → étoiles +
  cosmétiques.
- **Cosmétiques** : 14 chapeaux, 10 couleurs, 5 teintes de peau.
- **Gains hors-ligne** : revenu moyen généré par les caissiers (mesuré en jeu) × durée
  d'absence (plafonnée à 2 h, +2 h par talent) × efficacité (30 %, +15 % par talent).

## Les 8 lieux

| # | Lieu | Produit | Nouveautés |
|---|---|---|---|
| 1 | Le Snack Abandonné | 🍔 | tutoriel, graisse (serpillière), toilettes moisies (haute pression) |
| 2 | Le Café de la Gare | ☕ | salon de thé en tapis, arrière-boutique pleine d'encombrants, terrasse |
| 3 | La Pizzeria Mamma Mia | 🍕 | grande salle, cave voûtée, cour intérieure, 2ᵉ comptoir |
| 4 | Le Bar à Sushis Zen | 🍣 | tables à 4 places, jardin zen avec bassin, salons privés |
| 5 | Le Diner Route 66 | 🌭 | garage à huile de vidange (autolaveuse), parking ouvert sur la rue avec drive |
| 6 | La Crêperie du Port | 🥞 | plage et quai au bord de la mer, terrasse |
| 7 | Le Food Court du Centre | 🌮 | 3 comptoirs simultanés, galerie, parking tagué |
| 8 | Le Palace Étoilé | 🍰 | salle de bal, cave à vin, jardin, 7 salles |

## Contrôles

Joystick virtuel flottant (l'origine se place là où le doigt touche et suit le doigt s'il
dépasse le rayon), clavier ZQSD/WASD/flèches. Tout le reste est automatique par proximité,
pour jouer d'une seule main.
