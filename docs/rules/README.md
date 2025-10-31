# Règles personnalisées : Pions Mineurs

Ce dossier fournit deux variantes JSON prêtes à l'emploi pour la règle "Pions Mineurs" décrivant des pions capables de poser des mines :

- `pions-mineurs-v2.json` : version instantanée qui explose dès qu'une pièce entre sur la case minée.
- `pions-mineurs-v2-temporise.json` : version temporisée qui ajoute un compte à rebours (en plies) avant la détonation automatique si la mine n'a pas été déclenchée.

Les deux fichiers couvrent :

- L'action UI explicite, avec ciblage de case, cooldown et limites.
- La gestion d'état persistante, sérialisable et compatible promotion/undo.
- Les hooks moteur (UI, cycle de vie, persistance) à implémenter côté moteur.
- Les événements métier (pose, tick, explosion) et leur payload.
- Les garde-fous (placement, friendly fire, visibilité, limites globales).
- Les assets audiovisuels attendus (sprites, animations, SFX).

Un squelette TypeScript (`pawnMines.ts`) est fourni pour accélérer l'intégration côté moteur. Adaptez-le en fonction de votre bus d'événements et de vos contrats d'API internes.

## Ressources complémentaires

- [`idea-catalogue.md`](./idea-catalogue.md) — une liste de mécaniques validées (mines, pièges, statuts héroïques, sorts, etc.) n'utilisant que des actions reconnues par `knownActions`. Servez-vous-en pour guider la génération de nouvelles règles JSON sans craindre les hallucinations.
