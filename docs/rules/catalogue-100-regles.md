# Aichess — Dictionnaire de 100 règles personnalisées

> Statut : catalogue de conception, **non déployé**. Les noms ne prouvent pas leur compatibilité avec le moteur. Chaque règle doit être compilée, simulée et testée avant activation.

## Contrat de validation
Chaque règle doit définir déclencheur, portée, limites, interactions, victoire et visuel; être compilée dans Rule Architect V2; passer des tests unitaires, tests de parties complètes et tests multijoueur. Aucun GIF ne doit modifier les résultats du moteur.

| ID | Catégorie | Règle | Opération moteur à étudier | Statut |
|---|---|---|---|---|
| R001 | Pièges et terrain | Sables mouvants | `tile.setTrap` | À implémenter et tester |
| R002 | Pièges et terrain | Mine de proximité | `tile.setTrap` | À implémenter et tester |
| R003 | Pièges et terrain | Gel de case | `tile.setTrap` | À implémenter et tester |
| R004 | Pièges et terrain | Lave montante | `tile.setTrap` | À implémenter et tester |
| R005 | Pièges et terrain | Portail piégé | `tile.setTrap` | À implémenter et tester |
| R006 | Pièges et terrain | Bombe retardée | `tile.setTrap` | À implémenter et tester |
| R007 | Pièges et terrain | Brouillard toxique | `tile.setTrap` | À implémenter et tester |
| R008 | Pièges et terrain | Ronces entravantes | `tile.setTrap` | À implémenter et tester |
| R009 | Pièges et terrain | Faille gravitationnelle | `tile.setTrap` | À implémenter et tester |
| R010 | Pièges et terrain | Case électrifiée | `tile.setTrap` | À implémenter et tester |
| R011 | Déplacement | Cavalier bondissant | `piece.move` | À implémenter et tester |
| R012 | Déplacement | Tour sauteuse | `piece.move` | À implémenter et tester |
| R013 | Déplacement | Fou zigzag | `piece.move` | À implémenter et tester |
| R014 | Déplacement | Pion sprinteur | `piece.move` | À implémenter et tester |
| R015 | Déplacement | Dame téléportée | `piece.move` | À implémenter et tester |
| R016 | Déplacement | Roi esquive | `piece.move` | À implémenter et tester |
| R017 | Déplacement | Marche arrière | `piece.move` | À implémenter et tester |
| R018 | Déplacement | Glissade de glace | `piece.move` | À implémenter et tester |
| R019 | Déplacement | Échange de places | `piece.move` | À implémenter et tester |
| R020 | Déplacement | Charge diagonale | `piece.move` | À implémenter et tester |
| R021 | Captures | Capture en chaîne | `piece.capture` | À implémenter et tester |
| R022 | Captures | Assassin furtif | `piece.capture` | À implémenter et tester |
| R023 | Captures | Capture explosive | `piece.capture` | À implémenter et tester |
| R024 | Captures | Vampirisme | `piece.capture` | À implémenter et tester |
| R025 | Captures | Riposte automatique | `piece.capture` | À implémenter et tester |
| R026 | Captures | Marque du chasseur | `piece.capture` | À implémenter et tester |
| R027 | Captures | Élimination à distance | `piece.capture` | À implémenter et tester |
| R028 | Captures | Capture ricochet | `piece.capture` | À implémenter et tester |
| R029 | Captures | Sacrifice tactique | `piece.capture` | À implémenter et tester |
| R030 | Captures | Piège de contre-attaque | `piece.capture` | À implémenter et tester |
| R031 | Défense | Bouclier temporaire | `piece.setStatus` | À implémenter et tester |
| R032 | Défense | Armure renforcée | `piece.setStatus` | À implémenter et tester |
| R033 | Défense | Invulnérabilité d'un tour | `piece.setStatus` | À implémenter et tester |
| R034 | Défense | Reflet protecteur | `piece.setStatus` | À implémenter et tester |
| R035 | Défense | Mur de pierre | `piece.setStatus` | À implémenter et tester |
| R036 | Défense | Protection du roi | `piece.setStatus` | À implémenter et tester |
| R037 | Défense | Interception héroïque | `piece.setStatus` | À implémenter et tester |
| R038 | Défense | Résurrection unique | `piece.setStatus` | À implémenter et tester |
| R039 | Défense | Déviation d'attaque | `piece.setStatus` | À implémenter et tester |
| R040 | Défense | Sanctuaire | `piece.setStatus` | À implémenter et tester |
| R041 | Transformations | Pion super-robot | `piece.promote` | À implémenter et tester |
| R042 | Transformations | Cavalier dragon | `piece.promote` | À implémenter et tester |
| R043 | Transformations | Tour forteresse | `piece.promote` | À implémenter et tester |
| R044 | Transformations | Fou spectral | `piece.promote` | À implémenter et tester |
| R045 | Transformations | Dame phénix | `piece.promote` | À implémenter et tester |
| R046 | Transformations | Pion caméléon | `piece.promote` | À implémenter et tester |
| R047 | Transformations | Métamorphose aléatoire | `piece.promote` | À implémenter et tester |
| R048 | Transformations | Fusion alliée | `piece.promote` | À implémenter et tester |
| R049 | Transformations | Miniaturisation | `piece.promote` | À implémenter et tester |
| R050 | Transformations | Évolution par captures | `piece.promote` | À implémenter et tester |
| R051 | Magie et éléments | Foudre ciblée | `vfx.play` | À implémenter et tester |
| R052 | Magie et éléments | Tempête de sable | `vfx.play` | À implémenter et tester |
| R053 | Magie et éléments | Nova de glace | `vfx.play` | À implémenter et tester |
| R054 | Magie et éléments | Vortex de feu | `vfx.play` | À implémenter et tester |
| R055 | Magie et éléments | Portail dimensionnel | `vfx.play` | À implémenter et tester |
| R056 | Magie et éléments | Onde de choc | `vfx.play` | À implémenter et tester |
| R057 | Magie et éléments | Sphère d'énergie | `vfx.play` | À implémenter et tester |
| R058 | Magie et éléments | Champ magnétique | `vfx.play` | À implémenter et tester |
| R059 | Magie et éléments | Pluie de météores | `vfx.play` | À implémenter et tester |
| R060 | Magie et éléments | Vent repoussant | `vfx.play` | À implémenter et tester |
| R061 | Temps et tours | Tour supplémentaire | `cooldown.set` | À implémenter et tester |
| R062 | Temps et tours | Gel temporel | `cooldown.set` | À implémenter et tester |
| R063 | Temps et tours | Compte à rebours | `cooldown.set` | À implémenter et tester |
| R064 | Temps et tours | Recharge accélérée | `cooldown.set` | À implémenter et tester |
| R065 | Temps et tours | Accélération des pions | `cooldown.set` | À implémenter et tester |
| R066 | Temps et tours | Retard d'action | `cooldown.set` | À implémenter et tester |
| R067 | Temps et tours | Écho du dernier coup | `cooldown.set` | À implémenter et tester |
| R068 | Temps et tours | Marqueur de tour | `cooldown.set` | À implémenter et tester |
| R069 | Temps et tours | Effet à durée limitée | `cooldown.set` | À implémenter et tester |
| R070 | Temps et tours | Réinitialisation des pouvoirs | `cooldown.set` | À implémenter et tester |
| R071 | Invocation et duplication | Clone de pion | `piece.spawn` | À implémenter et tester |
| R072 | Invocation et duplication | Invocation de sentinelle | `piece.spawn` | À implémenter et tester |
| R073 | Invocation et duplication | Tour fantôme | `piece.spawn` | À implémenter et tester |
| R074 | Invocation et duplication | Essaim de pions | `piece.spawn` | À implémenter et tester |
| R075 | Invocation et duplication | Renfort sur bord | `piece.spawn` | À implémenter et tester |
| R076 | Invocation et duplication | Pièce miroir | `piece.spawn` | À implémenter et tester |
| R077 | Invocation et duplication | Golem temporaire | `piece.spawn` | À implémenter et tester |
| R078 | Invocation et duplication | Gardien de case | `piece.spawn` | À implémenter et tester |
| R079 | Invocation et duplication | Copie éphémère | `piece.spawn` | À implémenter et tester |
| R080 | Invocation et duplication | Réapparition différée | `piece.spawn` | À implémenter et tester |
| R081 | Objectifs et victoire | Capture du drapeau | `state.inc` | À implémenter et tester |
| R082 | Objectifs et victoire | Roi de la colline | `state.inc` | À implémenter et tester |
| R083 | Objectifs et victoire | Contrôle de trois cases | `state.inc` | À implémenter et tester |
| R084 | Objectifs et victoire | Survie dix tours | `state.inc` | À implémenter et tester |
| R085 | Objectifs et victoire | Course de pions | `state.inc` | À implémenter et tester |
| R086 | Objectifs et victoire | Points de captures | `state.inc` | À implémenter et tester |
| R087 | Objectifs et victoire | Domination centrale | `state.inc` | À implémenter et tester |
| R088 | Objectifs et victoire | Objectif secret | `state.inc` | À implémenter et tester |
| R089 | Objectifs et victoire | Relique à protéger | `state.inc` | À implémenter et tester |
| R090 | Objectifs et victoire | Victoire par élimination | `state.inc` | À implémenter et tester |
| R091 | Chaos et stratégie | Gravité inversée | `state.set` | À implémenter et tester |
| R092 | Chaos et stratégie | Cases mouvantes | `state.set` | À implémenter et tester |
| R093 | Chaos et stratégie | Téléportation réciproque | `state.set` | À implémenter et tester |
| R094 | Chaos et stratégie | Brouillard de guerre | `state.set` | À implémenter et tester |
| R095 | Chaos et stratégie | Pièces invisibles | `state.set` | À implémenter et tester |
| R096 | Chaos et stratégie | Terrain aléatoire | `state.set` | À implémenter et tester |
| R097 | Chaos et stratégie | Pénalité de zone | `state.set` | À implémenter et tester |
| R098 | Chaos et stratégie | Bonus de série | `state.set` | À implémenter et tester |
| R099 | Chaos et stratégie | Aura de commandement | `state.set` | À implémenter et tester |
| R100 | Chaos et stratégie | Échange de compétences | `state.set` | À implémenter et tester |

## Intégration des animations
Associer les effets à des identifiants stables d'assets et charger les GIF depuis un stockage public durable (ne pas utiliser les liens temporaires de conversation). Prévoir le repli CSS/vidéo, le préchargement et l'option de réduction des animations.

## Critères de mise en production
- Une règle ne peut être annoncée fonctionnelle que si le compilateur accepte sa définition et qu'une simulation confirme son effet.
- Tests de légalité des coups, d'échec au roi, d'annulation, de synchronisation et de déterminisme.
- Tests de collision entre règles et limite de ressources.
- Déploiement progressif sous feature flag après validation.