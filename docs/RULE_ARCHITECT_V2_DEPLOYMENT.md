# Runbook de déploiement — Rule Architect V2

Ce runbook sépare volontairement revue de code, base de données, fonctions Edge
et frontend. Aucun passage en production ne doit contourner un gate précédent.

## 0. Inventaire et garde-fous

La livraison doit rester sur :

- dépôt `mtnrconcept/ai-chess-architect` ;
- branche `feat/rule-architect-v2` ;
- PR existante `#306` vers `main`.

Avant toute mutation distante, consigner dans le ticket de release : SHA Git,
référence Supabase staging, référence Supabase production, projet Vercel et URLs
de preview/production. Un projet simplement accessible mais vide ou non
représentatif n'est pas un staging valide.

Les fichiers de bootstrap temporaires doivent être absents :

```bash
test ! -e .rule-architect-v2
test ! -e .github/workflows/apply-rule-architect-v2-bootstrap.yml
test ! -e bootstrap-diagnostic.txt
```

## 1. Configuration des environnements

### Vercel — variables publiques uniquement

Configurer séparément Preview et Production, puis reconstruire chaque
déploiement car Vite incorpore les variables au build :

| Variable                                                    | Portée             | Commentaire                                                                        |
| ----------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                                         | Preview/Production | URL explicite du projet de l'environnement                                         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY` | Preview/Production | clé publique uniquement                                                            |
| `VITE_SUPABASE_PROJECT_ID`                                  | Preview/Production | requis pour `*.supabase.co`, correspondance exacte avec l'URL                      |
| `VITE_SUPABASE_CUSTOM_HOST`                                 | Preview/Production | domaine personnalisé : host exact, port non standard inclus, sans schéma ni chemin |

Ces variables restent la configuration canonique et sont toujours prioritaires.
En leur absence totale, le build frontend dispose d'un secours exclusivement
public qui ne s'active que si le projet Vercel, le dépôt, le propriétaire, la
branche et l'environnement correspondent tous exactement à la cible staging ou
production attendue. Une seule variable `VITE_SUPABASE_*` partielle désactive ce
secours et conserve le comportement fail-closed.

Ne jamais créer de variable Vercel `VITE_` contenant `OPENAI_API_KEY`, une clé
`service_role`, une clé `sb_secret_…`, un token GitHub ou un token Supabase de
gestion.

### Supabase Edge — secrets serveur

```text
OPENAI_API_KEY
OPENAI_RULE_MODEL=gpt-5.6-terra
OPENAI_PREMIUM_RULE_MODEL=gpt-5.6-sol
OPENAI_RULE_GUIDANCE_MODEL=gpt-5.6-terra
OPENAI_RULE_AUDIT_MODEL=gpt-5.6-terra
RULE_GUIDANCE_SIGNING_SECRET=<secret-aléatoire-long>
ALLOWED_ORIGINS=http://localhost:5173
RULE_ARCHITECT_PREMIUM_USER_IDS=
RULE_COMPILE_HOURLY_LIMIT=12
RULE_COMPILE_STALE_SECONDS=180
RULE_PROMPT_MAX_CHARS=6000
```

`RULE_COMPILE_STALE_SECONDS` accepte 180 à 900 secondes. Une réservation encore
en traitement avant ce seuil reste rejouable avec la même clé ; au-delà, elle
est close atomiquement et le client doit démarrer une nouvelle tentative.

`RULE_GUIDANCE_SIGNING_SECRET` doit contenir au moins 32 caractères aléatoires.
En transition, le serveur peut utiliser `SUPABASE_SERVICE_ROLE_KEY` comme clé de
signature de secours, mais un secret dédié facilite la rotation indépendante.

Les trois alias de production exacts du projet Vercel `ai-chess-architect`
(canonique, équipe et branche `main`) sont intégrés au serveur. Aucun domaine
de preview générique n'est accepté. `ALLOWED_ORIGINS` permet uniquement
d'ajouter des origines exactes (par exemple l'alias stable d'une branche de
staging ou localhost), séparées par des virgules, sans slash final, chemin ni
wildcard.

### GitHub Environments

Créer les environnements protégés `staging` et `production`, avec reviewers
obligatoires pour production. Chacun contient ses propres secrets
`SUPABASE_ACCESS_TOKEN` et `SUPABASE_PROJECT_ID`. Le workflow Edge exige en plus
la saisie de la référence, du SHA, la confirmation de migration et celle du
cron de rétention déjà testé sur la cible.

## 2. Validation locale et CI

```bash
node scripts/verify-rule-architect-v2.mjs
node scripts/verify-rule-architect-v2-ops.mjs
node --test scripts/utils/supabase-target.test.mjs
pnpm exec vitest run src/rules-v2 src/engine/__tests__ src/features/rule-architect src/integrations/supabase/client.test.ts
pnpm exec tsc --noEmit -p tsconfig.app.json
pnpm build
```

La CI vérifie aussi les quatre entrypoints Deno. Elle ne nécessite aucun secret
et n'effectue aucune écriture distante. Le check vert ne remplace pas un essai
SQL/RLS réel sur staging.

Le build est volontairement pur. Les opérations historiques restent des
commandes séparées et explicites : `SYNC_TOURNAMENTS_CONFIRMED=true pnpm
sync:tournaments` pour la synchronisation et `pnpm deploy:lovable` pour le
webhook Lovable. Elles ne font partie ni de `build`, ni de `postbuild`.

## 3. Supabase staging réel

Faire une sauvegarde ou utiliser une branche Supabase jetable et
représentative. La base distante présente une dérive historique : appliquer
uniquement les migrations relues de cette livraison, dans cet ordre :

```bash
export SUPABASE_PROJECT_ID="<staging-ref>"
export SUPABASE_PROJECT_REF_CONFIRMATION="<staging-ref>"

# À exécuter par l'API de migrations Supabase ou une procédure psql contrôlée,
# jamais via un db push global sur ce dépôt divergent.
supabase/migrations/20260719230000_rule_architect_v2.sql
supabase/migrations/20260720132216_chess_platform_foundation.sql
supabase/migrations/20260720143000_chess_platform_terminal_cas.sql
supabase/migrations/20260722120000_rule_version_coverage_gate.sql
```

Enregistrer chaque fichier comme une migration distincte, vérifier son succès
avant le suivant, puis exécuter les deux suites SQL de cette livraison. Ne pas
utiliser `pnpm db:push` ou `pnpm db:migrate` sur staging/production tant que
l'historique distant et celui du dépôt n'ont pas été réconciliés.

Déployer ensuite les cinq fonctions Rule Architect et le validateur STANDARD via le
workflow manuel GitHub, cible `staging`, seulement après les migrations :

- `generate-rule-questions` ;
- `compile-chess-rule` ;
- `publish-rule-version` ;
- `create-rule-lobby-v2` ;
- `join-rule-lobby-v2` ;
- `process-chess-move` (uniquement pour les matchs STANDARD).

Le dernier endpoint exige en plus la migration
`20260720143000_chess_platform_terminal_cas.sql`. Il refuse explicitement les
rulesets personnalisés tant que le runtime serveur du DSL V2 n'est pas livré.
La base applique le même refus sur `chess_rooms` et calcule elle-même le verdict
d'un timeout depuis la FEN faisant autorité, y compris la nulle pour matériel de
mat insuffisant. Les tables de coups et d'événements restent lisibles par le
rôle serveur mais ne sont modifiables qu'au travers des RPC propriétaires.

### Cron de rétention obligatoire

Après validation de `pg_cron` sur staging, programmer une exécution quotidienne
de la purge. Exemple à adapter aux conventions du projet :

```sql
select cron.schedule(
  'rule-architect-v2-expired-compilations',
  '17 3 * * *',
  $$select public.cleanup_expired_rule_compilations();$$
);
```

Vérifier dans `cron.job` qu'une seule tâche active existe, exécuter une fois sur
des données de test expirées et créer une alerte si la tâche échoue. Ne pas
activer l'extension ou créer le job en production avant ce test staging.

## 4. Tests RLS, concurrence et OpenAI

Utiliser deux comptes authentifiés distincts A et B, puis un compte C non
participant :

1. A compile une règle bornée ;
2. un double clic/retry avec la même clé ne crée qu'une compilation ;
3. A publie une version immuable ;
4. une publication identique retourne la version dédupliquée ;
5. A crée un lobby joueur : `match_seed` reste `null` ;
6. deux requêtes concurrentes de join sont envoyées ; une seule identité gagne ;
7. après join, A et B obtiennent les mêmes `ruleset_hash`, `engine_version` et `match_seed` ;
8. C ne lit ni compilation privée, ni blueprint, ni runtime matched ;
9. A/B ne peuvent modifier ou supprimer une version ;
10. code, SQL, JavaScript, HTML, provider ou effet inconnu sont refusés ;
11. la quota race et les retries ne provoquent ni dépassement ni erreur 500 ;
12. une compilation expirée devient illisible puis est purgée par le cron.

Pour le smoke OpenAI, utiliser un prompt non sensible et explicitement borné.
Contrôler Structured Output, `store: false`, modèle réellement utilisé et
absence de contenu dangereux dans le stockage.

## 5. Vercel Preview

La preview doit provenir du SHA testé. Vérifier au minimum :

- `/generator` affiche V2 et `/generator-legacy` l'ancien parcours ;
- `/rule-lobby` et les routes précédentes survivent à un refresh direct ;
- le bundle cible uniquement le Supabase staging attendu ;
- CORS accepte exactement l'origine Preview et refuse une origine étrangère ;
- aucun secret serveur n'apparaît dans le bundle, le réseau ou les logs ;
- création, publication, lobby joueur/IA et navigation mobile fonctionnent ;
- une preview compilée avec des variables staging n'est jamais promue telle
  quelle en production.

## 6. Production

Après CI, staging et Preview verts :

1. rendre la PR `#306` prête puis la fusionner selon la stratégie du dépôt ;
2. noter le SHA fusionné et sauvegarder la base production ;
3. vérifier la restauration de cette sauvegarde sur une cible isolée si le
   niveau de risque l'exige ;
4. confirmer trois fois la référence production (secret, saisie, URL DB) ;
5. appliquer la migration additive ;
6. valider les invariants SQL/RLS ;
7. déclencher le workflow Edge manuel depuis `main`, environnement production ;
8. construire un nouveau Vercel Production avec les variables production ;
9. refaire le smoke à deux comptes et le contrôle CORS ;
10. surveiller erreurs Edge, latence OpenAI, quotas, erreurs SQL/RLS, cron et logs
    Vercel pendant la fenêtre de release.

Au premier gate rouge, arrêter la séquence et suivre la procédure de
[retour arrière](./RULE_ARCHITECT_V2_ROLLBACK.md).
