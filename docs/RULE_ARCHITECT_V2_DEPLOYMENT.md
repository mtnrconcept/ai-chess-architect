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

| Variable | Portée | Commentaire |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Preview/Production | URL explicite du projet de l'environnement |
| `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY` | Preview/Production | clé publique uniquement |
| `VITE_SUPABASE_PROJECT_ID` | Preview/Production | requis pour `*.supabase.co`, correspondance exacte avec l'URL |
| `VITE_SUPABASE_CUSTOM_HOST` | Preview/Production | domaine personnalisé : host exact, port non standard inclus, sans schéma ni chemin |

Ne jamais créer de variable Vercel `VITE_` contenant `OPENAI_API_KEY`, une clé
`service_role`, une clé `sb_secret_…`, un token GitHub ou un token Supabase de
gestion.

### Supabase Edge — secrets serveur

```text
OPENAI_API_KEY
OPENAI_RULE_MODEL=gpt-5.6-terra
OPENAI_PREMIUM_RULE_MODEL=gpt-5.6
ALLOWED_ORIGINS=https://preview-stable.example,https://production.example,http://localhost:5173
RULE_ARCHITECT_PREMIUM_USER_IDS=
RULE_COMPILE_HOURLY_LIMIT=12
RULE_COMPILE_STALE_SECONDS=180
RULE_PROMPT_MAX_CHARS=4000
```

`RULE_COMPILE_STALE_SECONDS` accepte 180 à 900 secondes. Une réservation encore
en traitement avant ce seuil reste rejouable avec la même clé ; au-delà, elle
est close atomiquement et le client doit démarrer une nouvelle tentative.

`ALLOWED_ORIGINS` est une liste d'origines exactes séparées par des virgules,
sans slash final, chemin ni wildcard. Utiliser un alias Vercel de branche stable
pour la preview et mettre à jour le secret si l'origine change.

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
représentative. Confirmer la cible pour chaque script d'écriture :

```bash
export SUPABASE_PROJECT_ID="<staging-ref>"
export SUPABASE_PROJECT_REF_CONFIRMATION="<staging-ref>"
export SUPABASE_DB_URL="<staging-database-url>"

npx --yes supabase@2.109.1 db push --db-url "$SUPABASE_DB_URL" --dry-run
pnpm run db:push
```

Examiner intégralement le plan dry-run avant l'application. Le wrapper
`db:push` n'accepte volontairement pas d'argument de contournement et revérifie
la triple confirmation. L'alias historique `db:migrate` délègue au même wrapper
et ne maintient plus de registre de migrations parallèle.

Déployer ensuite les quatre fonctions via le workflow manuel GitHub, cible
`staging`, seulement après la migration :

- `compile-chess-rule` ;
- `publish-rule-version` ;
- `create-rule-lobby-v2` ;
- `join-rule-lobby-v2`.

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
