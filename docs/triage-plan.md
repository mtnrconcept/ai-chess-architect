# Correctif – Plan d'attaque erreurs A/B/C

## A. Directives Permissions-Policy obsolètes
1. Supprimer les directives `vr`, `battery` et `ambient-light-sensor` de toutes les configurations d'en-têtes.
2. Remplacer par des directives supportées (`xr-spatial-tracking`, `fullscreen`, `vibrate`, etc.) en fonction des besoins applicatifs.
3. Vérifier que chaque plateforme de déploiement (Next.js, Vite, Nginx, CDN) applique les en-têtes mis à jour.

## B. Supabase Edge Function `generate-chess-rule` (500)
1. Consulter les logs temps réel de la fonction (`supabase functions logs --project-ref ucaqbhmyutlnitnedowk --follow`).
2. Vérifier les secrets runtime (`supabase secrets list`), renseigner les clés manquantes et valider le format du payload entrant.
3. Durcir le handler avec validation (Zod), gestion explicite des erreurs et timeout sur les appels externes, puis re-déployer.

## C. Blocage Edge Tracking Prevention
1. Harmoniser domaine/sous-domaine pour éviter le stockage tiers ou configurer les cookies `SameSite=None; Secure` (voire `Partitioned`).
2. Implémenter `requestStorageAccess` si l'app est servie via iframe et documenter le contournement temporaire côté QA.
3. Vérifier après correctif que l'auth Supabase et les flux dépendant du stockage fonctionnent en navigation privée Edge.
