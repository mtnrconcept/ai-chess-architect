# Mini-langage des règles

Pour fiabiliser la génération de règles via IA, Voltus n'expose plus l'ensemble du JSON moteur. L'agent LLM est limité à un mini-langage structuré en commandes simples. Ces commandes sont ensuite interprétées côté TypeScript par le `RuleFactory`, qui produit un `CanonicalIntent` valide puis le JSON complet attendu par le moteur.

## Cycle de transformation

```
Prompt utilisateur
   ↓
LLM → Programme de commandes (JSON simple)
   ↓
RuleFactory (TypeScript) → Intent canonique + tests
   ↓
Compilateur → JSON complexe pour le moteur
```

Chaque programme est constitué de commandes atomiques décrivant :

- Les métadonnées de la règle (`DEFINE_RULE`, `SET_PIECES`, `ADD_MECHANIC`, etc.).
- Les contraintes de ciblage et de limites (`SET_TARGETING`, `SET_LIMIT`).
- Les effets attendus pour les tests à sec (`EXPECT_ACTION`, `EXPECT_MOVE`).
- Les modifications de mobilité (`ADD_MOVE`, `REMOVE_MOVE`).

## Exemple de programme

```json
{
  "source": "Le pion gagne une capture diagonale obligatoire",
  "commands": [
    { "type": "DEFINE_RULE", "name": "Pion carnassier", "template": "pawn_custom" },
    { "type": "SET_PIECES", "pieces": ["pawn"] },
    { "type": "ADD_MECHANIC", "mechanic": "piece.capture" },
    { "type": "ADD_MOVE", "piece": "pawn", "pattern": "diagonal", "constraints": ["capture_only", "single_step"] },
    { "type": "REMOVE_MOVE", "piece": "pawn", "pattern": "forward" },
    { "type": "EXPECT_MOVE", "piece": "pawn", "from": "d4", "to": "e5", "expected": "legal", "occupation": "enemy" },
    { "type": "EXPECT_MOVE", "piece": "pawn", "from": "d4", "to": "d5", "expected": "illegal" }
  ]
}
```

Ce programme indique clairement au `RuleFactory` comment modifier les déplacements du pion et quelles assertions vérifier pendant le dry run.

## Tests automatiques

Le `RuleFactory` enrichit chaque règle d'une suite de tests dérivée des commandes :

- Les attentes d'actions vérifient que le JSON final déclenche bien les effets nécessaires (`hazard.spawn`, `piece.teleport`, etc.).
- Les attentes de déplacement s'exécutent sur un échiquier simplifié qui applique les ajouts/suppressions de mouvements avant de vérifier la légalité/illégalité demandée.

Le dry run échoue dès qu'une assertion est violée, ce qui protège la chaîne d'intégration contre un LLM qui se tromperait dans ses commandes.

## Ajout de nouvelles commandes

Les commandes sont typées dans `src/features/rules-pipeline/rule-language/types.ts`. Toute nouvelle commande doit :

1. Être déclarée dans ce fichier.
2. Être interprétée dans `src/features/rules-pipeline/factory/ruleFactory.ts`.
3. Ajouter, si besoin, des vérifications spécifiques dans `src/features/rules-pipeline/simulation/dryRun.ts`.

Ce design garantit que la complexité reste côté TypeScript, tandis que le LLM se contente de produire des instructions simples et contrôlées.
