# Pistes d'évolution et limites connues

## Idées de contenu

- **Nouveaux lieux** (format dans `LEVEL_FORMAT.md`) : station-service, cantine scolaire,
  bateau de croisière, station de ski, fête foraine, hôpital (sans restaurant : client = patient ?).
- **Mode infini / prestige** : après le lieu 8, « franchise » qui repart à zéro avec un
  multiplicateur permanent.
- **Plusieurs produits par lieu** (ex. burger + frites + soda) : demande de gérer un stock par
  produit au comptoir et des commandes mixtes (`Counter.stock` deviendrait un objet).
- **Nouveaux rôles** : gérant qui ramasse la caisse automatiquement, plongeur, livreur.
- **Événements** : client VIP pressé (gros pourboire), inspection d'hygiène (bonus si tout
  est propre), panne de machine à réparer, pluie qui salit l'entrée.
- **Saleté spéciale** : chewing-gums à gratter (maintenir appuyé), toiles d'araignée sur les
  murs, flaques qui s'étalent si on ne les nettoie pas.
- **Récompenses quotidiennes** sans pub (coffre gratuit toutes les 4 h).
- **Garde-robe étendue** : tenues complètes, couleur de l'outil, animal de compagnie.

## Améliorations techniques

- Traduction (actuellement tout en français, textes en dur dans `ui.js` et les données).
- Mise en page paysage dédiée sur tablette (actuellement responsive mais pensée portrait).
- Rendu : pré-rendu des murs en couches pour les très grandes cartes ; option « 30 fps ».
- Tests visuels automatisés (Playwright) en CI.
- Bot du simulateur qui achète aussi des talents pour estimer une partie « réelle » complète.

## Limites connues

- Les clients ne s'évitent pas entre eux (ils peuvent se superposer dans les files).
- Une seule recette par lieu.
- Le personnel d'entretien ne nettoie pas la saleté initiale des salles (choix de design :
  c'est le cœur du jeu pour le joueur).
- La musique est générative et simple ; elle peut être coupée dans les options.
- iOS : l'installation se fait via « Partager → Sur l'écran d'accueil » ; les vibrations ne
  sont pas supportées par Safari.
