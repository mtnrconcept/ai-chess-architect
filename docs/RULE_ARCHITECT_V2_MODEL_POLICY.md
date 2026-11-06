# Politique des modèles — Rule Architect V2

Rule Architect V2 passe par l'API OpenAI Responses depuis les fonctions Supabase Edge, avec sorties JSON strictes. **Le modèle par défaut pour la génération, le questionnaire et l'audit est `gpt-5.6-sol`.** Un éventuel réglage explicite côté serveur reste prioritaire : la migration ne modifie pas les secrets d'un environnement déjà déployé.

| Usage                   | Secret Edge (facultatif pour personnaliser le modèle)  | Valeur par défaut |
| ----------------------- | ------------------------------------------------------ | ----------------- |
| Compilation standard    | `OPENAI_RULE_MODEL`                                    | `gpt-5.6-sol`     |
| Compilation approfondie | `OPENAI_PREMIUM_RULE_MODEL`                            | `gpt-5.6-sol`     |
| Questionnaire guidé     | `OPENAI_RULE_GUIDANCE_MODEL`, puis `OPENAI_RULE_MODEL` | `gpt-5.6-sol`     |
| Audit de couverture     | `OPENAI_RULE_AUDIT_MODEL`, puis modèle de compilation  | `gpt-5.6-sol`     |

Le mode approfondi change **le budget de raisonnement** et reste réservé aux comptes autorisés. Le modèle ne décide jamais lui-même des privilèges du joueur. L'objectif n'est pas de lui confier l'exécution des règles : Sol traduit les intentions en blueprint, le compilateur déterministe et le serveur font appliquer les règles.

## Autorisation premium

`premium: true` dans la requête est seulement une demande. Le serveur valide l'identité via `app_metadata.rule_architect_tier = premium`, les rôles serveur `admin` ou `owner`, ou une autorisation `RULE_ARCHITECT_PREMIUM_USER_IDS`. Sinon, la compilation standard est utilisée et l'interface indique la décision.

## API et sécurité

- Le secret `OPENAI_API_KEY` réside **uniquement** dans les secrets Supabase Edge du projet concerné (jamais dans `VITE_*`, les logs ou Git).
- L'appel part de Supabase vers `https://api.openai.com/v1/responses` avec `store: false` et le format JSON Schema strict.
- Les erreurs transitoires HTTP 408, 429, 500, 502, 503 ou 504 ont au maximum **3 tentatives**, avec délais bornés et annulation sur expiration de la requête. Un refus 401, un JSON invalide ou une erreur d'autorisation ne sont pas réessayés.
- La sortie IA est traitée comme une suggestion non fiable et ne contient jamais de code exécutable, d'URL arbitraire ou de nouvelle opération hors catalogue.
- Le compilateur, les preuves de couverture, les signatures, le seed et la gestion de l'état restent autoritaires et déterministes.
- Le joueur doit approuver explicitement toute adaptation de la règle avant publication.

## Moteur d'effets / variantes personnalisées

- PixiJS v8 utilise `app.canvas`, ce qui corrige le montage du calque de rendu.
- Les effets natifs `combat.hit`, `combat.freeze`, `combat.burn`, `viz.scan` et `viz.highlight` disposent désormais de rendus. Portails, explosions, hologrammes, traces et hazards ont été modernisés avec l'API graphique PixiJS v8.
- Les identifiants de cases, couleurs et rayons sont filtrés et bornés ; la réduction des animations demandée par l'OS est respectée.
- Les mines et hazards persistants suivent les changements d'état du plateau, avec nettoyage sur suppression, restauration après rollback et réhydratation lors du montage asynchrone du moteur visuel.
- Nombre d'effets simultanés plafonné, animations nettoyées sur démontage pour limiter les fuites GPU. Les effets visuels ne modifient jamais le résultat d'un coup.

## Vérification / déploiement

1. Exécuter les tests Vitest, les tests Deno de Rule Architect, les vérifications TypeScript et le build Vite. La CI GitHub reproduit ces vérifications.
2. Contrôler, sur le **bon projet Supabase staging**, que `OPENAI_API_KEY` est présent ; épingler `OPENAI_RULE_MODEL=gpt-5.6-sol` et les autres variantes le cas échéant. Ne jamais écrire la valeur de la clé dans les commandes, les tickets ou le dépôt.
3. Déployer les deux Edge Functions `compile-chess-rule` et `generate-rule-questions` sur staging ; générer une variante réelle, corriger et publier, puis lancer une partie. Vérifier les effets, la synchronisation et le replay.
4. Promouvoir la branche GitHub seulement après CI verte, smoke test staging et validation des secrets/modèles réels. Répliquer la configuration sur Supabase production et surveiller latence, erreurs 429/5xx et coût par règle.
5. La création d'une **nouvelle** clé OpenAI passe par le flux de création sécurisé OpenAI Platform. La rotation de `OPENAI_API_KEY` n'est pas possible depuis GitHub seul.

Si Supabase est en pause ou si le secret n'est pas configuré, **aucune génération réelle ni déploiement de production ne peut être attesté**. Les tests à requêtes simulées ne prouvent pas qu'un compte OpenAI dispose effectivement de l'accès au modèle spécifié.
