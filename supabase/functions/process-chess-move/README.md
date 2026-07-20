# `process-chess-move`

Validateur serveur borné pour les parties **STANDARD uniquement**.

## Contrat HTTP

`POST` avec un JWT Supabase valide et un corps JSON strict :

```json
{
  "matchId": "uuid",
  "expectedRevision": 0,
  "clientCommandId": "uuid",
  "uci": "e2e4"
}
```

Le navigateur ne fournit ni horloge faisant autorité, ni FEN, ni résultat. La fonction soumet
d'abord la commande avec le client utilisateur, relit ensuite la commande et sa partie avec le rôle
serveur, puis valide le coup avec `chess.js@1.4.0`.

Un coup et sa finalisation éventuelle sont persistés dans une seule transaction via
`commit_and_finalize_chess_move_server`. Un timeout est recalculé et finalisé dans PostgreSQL via un
RPC CAS séparé. PostgreSQL déduit aussi le matériel du réclamant depuis la FEN faisant autorité : le
résultat devient nul avec `timeout-insufficient-material` si ce joueur n'a pas de matériel de mat,
sinon il gagne avec `timeout`. Le client doit néanmoins attendre les événements Realtime
`move_committed` / `match_verified` : la réponse HTTP n'est pas l'état canonique de l'échiquier.

## Limite volontaire

Les parties dont `chess_matches.state.rulesetType` n'est pas exactement `standard` échouent fermées
avec le code stable :

`CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE`

La commande correspondante est rejetée côté serveur. Aucun fallback STANDARD et aucune exécution de
règle personnalisée ne sont autorisés dans cette fonction. Un validateur déterministe dédié au DSL
Rule Architect devra être livré avant d'activer les parties personnalisées par ce chemin.

La répétition triple n'est pas inférée depuis une FEN isolée. Elle nécessitera un historique de
positions faisant autorité; le validateur couvre actuellement le mat, le pat, le matériel
insuffisant et la règle des cinquante coups que la position courante permet de prouver.
