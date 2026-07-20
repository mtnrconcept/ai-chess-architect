# Fondation Chess Platform

Ce document décrit le socle additif de multijoueur et de progression introduit
avec Rule Architect V2. Il ne remplace pas les anciens parcours `lobbies`,
tournois ou entraînement local.

## Parcours autoritaire

```text
joueur authentifié
  -> commande de coup idempotente
  -> validateur Edge de confiance
  -> commit avec contrôle de révision
  -> événement de match immuable
  -> Supabase Realtime
  -> les deux clients rejouent le même événement
```

Le navigateur n'écrit jamais directement un coup, un résultat, un Elo, une
récompense XP, un badge ou une quête. Un reçu de commande `pending` n'est pas
un coup et ne doit pas être projeté sur l'échiquier.

Chaque identité de match lie l'UUID créé par le serveur à l'UUID de la salle,
au SHA-256 du ruleset, au seed partagé et à la version du moteur. Toute
divergence échoue en mode fermé.

## Capacités incluses

- salles publiques, non répertoriées et privées à deux joueurs ;
- invitation à usage unique stockée uniquement sous forme de hash SHA-256 ;
- matchmaking atomique avec clés d'idempotence et verrous transactionnels ;
- horloges ancrées au serveur, présence, snapshots de reconnexion et replay ;
- réclamation de timeout par l'adversaire via
  `claim_chess_timeout(match_id, expected_revision)` ;
- adjudication du timeout depuis la FEN serveur : roi seul, roi + fou ou roi +
  cavalier donnent `timeout-insufficient-material` et la nulle ; au moins deux
  pièces mineures — y compris deux cavaliers — ou tout pion/tour/dame donnent
  la victoire par `timeout` ;
- résignation atomique via
  `resign_chess_match(match_id, expected_revision)` ;
- historique immuable des coups et événements ; les droits directs
  `INSERT`, `UPDATE`, `DELETE` et `TRUNCATE` sont aussi retirés à
  `service_role`, tandis que `SELECT` reste disponible pour le diagnostic ;
- une seule commande en attente par révision et au plus 32 commandes refusées
  par joueur/révision avant `COMMAND_RATE_LIMITED` ;
- saisons, historique Elo, XP, niveaux, badges et quêtes ;
- API de problème du jour qui n'expose jamais la colonne de solution ;
- RLS sur les 20 nouvelles tables et aucune écriture client directe ;
- rollback explicite limité aux tables introduites ici.

## Garde-fous de lancement

Le classé reste indisponible tant qu'aucune saison active n'existe et que le
validateur de coups n'a pas passé les tests staging avec deux comptes. Les
matchs Rule Architect restent fermés tant que le runtime serveur ne sait pas
exécuter tout le catalogue d'effets V2. Un trigger sur `chess_rooms` refuse
explicitement toute valeur `ruleset_type = custom` avec
`CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE` ; le validateur classique ne doit jamais
servir d'approximation pour un ruleset personnalisé.

Le premier problème curaté est publié pour le 20 juillet 2026. Les autres
dates renvoient `available=false` au lieu d'inventer du contenu. Un pipeline
éditorial validé est requis avant un lancement quotidien continu.

## Artefacts de base de données

- migration : `supabase/migrations/20260720132216_chess_platform_foundation.sql`
- durcissement des courses terminales :
  `supabase/migrations/20260720143000_chess_platform_terminal_cas.sql`
- tests d'intégration et de sécurité :
  `supabase/tests/chess_platform_foundation.sql` et
  `supabase/tests/chess_platform_terminal_cas.sql`
- rollbacks :
  `supabase/rollbacks/20260720143000_chess_platform_terminal_cas.down.sql`,
  puis `supabase/rollbacks/20260720132216_chess_platform_foundation.down.sql`

Comme la base de production présente une dérive historique de migrations, il
faut appliquer ces migrations précises et relues dans l'ordre. Ne jamais
exécuter tout l'historique du dépôt sur la production.

## Gates obligatoires avant production

1. Tous les contrôles locaux et GitHub sont verts.
2. Les migrations et leurs tests SQL passent sur une branche Supabase isolée.
3. L'Edge Function passe les scénarios coup légal/illégal, révision obsolète,
   timeout, fin de partie, retry et deux joueurs.
4. La Vercel Preview pointe vers le staging, jamais vers la production.
5. Deux vrais comptes terminent création, invitation, connexion, coup,
   reconnexion et fin de partie.
6. Les matchs personnalisés restent visiblement indisponibles jusqu'au runtime
   serveur V2 complet.
7. Une saison classée ne peut être activée qu'après ces étapes.

Les clés OpenAI et `service_role` restent exclusivement dans les coffres de
secrets serveur. Elles ne doivent jamais utiliser un préfixe `VITE_` ni être
commitées dans Git.
