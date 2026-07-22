# Politique des modèles — Rule Architect V2

Rule Architect V2 utilise l'API OpenAI Responses avec Structured Outputs.

| Usage                | Secret Supabase              | Valeur par défaut  |
| -------------------- | ---------------------------- | ------------------ |
| compilation standard | `OPENAI_RULE_MODEL`          | `gpt-5.6-terra`    |
| compilation premium  | `OPENAI_PREMIUM_RULE_MODEL`  | `gpt-5.6-sol`      |
| questionnaire guidé  | `OPENAI_RULE_GUIDANCE_MODEL` | modèle standard    |
| audit de couverture  | `OPENAI_RULE_AUDIT_MODEL`    | modèle sélectionné |

`gpt-5.6-terra` équilibre qualité, latence et coût. `gpt-5.6-sol` est réservé aux
interactions complexes. En production, une version datée peut être épinglée si
la reproductibilité du comportement modèle prime sur les mises à jour de
l'alias.

## Autorisation premium

Le champ `premium: true` envoyé par le navigateur n'est qu'une demande. Le
serveur doit vérifier au moins un des critères suivants :

- `app_metadata.rule_architect_tier = premium` ;
- rôle serveur `admin` ou `owner` ;
- UUID présent dans `RULE_ARCHITECT_PREMIUM_USER_IDS`.

Si aucun critère n'est satisfait, le modèle standard est utilisé et la réponse
indique que le premium n'a pas été accordé.

## Règles invariantes

- `OPENAI_API_KEY` reste un secret Supabase Edge ;
- aucune variable OpenAI ne porte le préfixe `VITE_` ;
- la sortie modèle n'est jamais exécutée ;
- le JSON doit satisfaire le schéma strict avant toute compilation ;
- le compilateur n'accepte que le catalogue fermé ;
- un second Structured Output audite chaque exigence et doit fournir un chemin
  de preuve vers une action ou un trigger compilé ;
- le questionnaire est signé côté serveur et lié à l’utilisateur avant que le
  navigateur puisse soumettre ses choix ;
- une adaptation n'est publiable que si le joueur l'a explicitement acceptée ;
- les réponses ne sont pas conservées par le provider (`store: false`) ;
- les erreurs et logs ne contiennent ni prompt brut ni secret ;
- un changement de modèle passe d'abord par staging et les tests de contrat.

Références officielles :

- <https://developers.openai.com/api/docs/models/gpt-5.6-terra>
- <https://developers.openai.com/api/docs/models/gpt-5.6-sol>
- <https://developers.openai.com/api/docs/guides/structured-outputs>
