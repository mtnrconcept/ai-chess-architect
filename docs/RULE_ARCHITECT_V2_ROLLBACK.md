# Retour arrière — Rule Architect V2

Cette procédure doit être relue avant la fusion. La migration V2 est additive et
les versions publiées sont immuables : un rollback ne doit jamais supprimer ces
données pour masquer un incident applicatif.

## Préparation obligatoire

- conserver le SHA et le déploiement Vercel production précédent ;
- prendre une sauvegarde base avant migration et noter son point de restauration ;
- conserver les logs de migration et les versions des quatre fonctions ;
- définir le responsable de décision et la fenêtre d'observation ;
- vérifier la restauration sur une cible isolée lorsque le risque le justifie.

## Choisir le niveau de rollback

| Incident | Action initiale | Données V2 |
| --- | --- | --- |
| UI, routes ou bundle | remettre le déploiement Vercel précédent | conserver |
| fonction Edge régressive | redéployer le dernier SHA sain ou désactiver l'endpoint | conserver |
| règle/compilateur incorrect | couper le parcours V2, corriger et republier une nouvelle version | conserver les versions existantes |
| RLS trop permissive | couper l'accès applicatif, appliquer une migration forward restrictive | conserver |
| migration structurelle catastrophique | maintenance, restauration isolée et plan de récupération approuvé | ne jamais restaurer aveuglément sur les écritures récentes |

## Procédure rapide

1. geler les déploiements et noter l'heure, le SHA et les symptômes ;
2. si une fuite d'accès est suspectée, retirer immédiatement l'origine Vercel
   d'`ALLOWED_ORIGINS` et couper le frontend V2 ;
3. restaurer le déploiement Vercel précédent, sans promouvoir une Preview
   construite avec les variables staging ;
4. redéployer une version Edge saine. Si aucune version antérieure n'existe,
   désactiver explicitement les quatre endpoints pendant l'enquête ;
5. pour une faille RLS, livrer une nouvelle migration revue qui révoque les
   droits concernés. Ne pas éditer silencieusement la migration déjà exécutée ;
6. exécuter les tests compte A/B/C et vérifier les logs ;
7. décider d'un correctif forward avant de réouvrir le trafic.

Une origine CORS vide ne constitue pas à elle seule une barrière pour les appels
serveur sans en-tête `Origin`. Pour un incident d'autorisation, il faut aussi
désactiver/redéployer les fonctions ou révoquer les RPC par migration forward.

## Base de données

Ne pas ajouter un `down.sql` générique contenant `DROP TABLE`, `CASCADE` ou la
suppression des lignes versionnées. Une restauration complète au point avant
migration peut écraser les écritures légitimes arrivées depuis la sauvegarde.

En cas de dommage base :

1. passer l'application en maintenance ;
2. restaurer le backup/PITR dans un projet isolé ;
3. comparer schéma et données avec la production ;
4. choisir une migration forward ou une récupération sélective ;
5. obtenir l'approbation du propriétaire avant toute restauration production ;
6. vérifier Auth, RLS, lobbies, versions immuables et cron après récupération.

## Sortie d'incident

Documenter cause, impact, données touchées, actions, preuves de smoke test et
alertes ajoutées. La fonctionnalité ne revient que depuis un nouveau SHA ayant
repassé CI, staging réel, deux comptes, Vercel Preview et revue sécurité.
