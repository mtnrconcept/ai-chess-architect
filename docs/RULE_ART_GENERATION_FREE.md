# Aichess — génération gratuite des pièces et effets

## Objectif

Une demande en langage naturel est interprétée par GPT-5.6 Sol en
RuleBlueprintV2 (Structured Outputs), compilée et validée par le moteur fermé.
Le moteur applique seul les captures, cooldowns, tours et pièges. Les effets
sont **cosmétiques**, jamais exécutés comme du code renvoyé par un modèle.

## Outils intégrés

| Besoin | Implémentation | Licence/coût |
|---|---|---|
| Habillage thématique des pièces | SVG procédural React (sand, ice, flame, forest, shadow, arcane, steel) | Gratuit, local |
| Pièges et événements sur le plateau | PixiJS v8 + GSAP (anneaux, particules, vortex, disparition) | Gratuit dans le projet |
| Bruitages | Web Audio API, synthèse intégrée au navigateur | Gratuit, local |
| Images de cinématiques (quand disponibles) | Wikimedia Commons, autorisation/attribution contrôlée par rule-assets.ts | Licences par ressource |
| Extensions graphiques optionnelles | Pack Kenney CC0 à importer manuellement après vérification de licence | Gratuit, non intégré |

La résolution locale des effets ne requiert **aucune seconde requête
d'inférence payante**. La compilation via OpenAI utilise en revanche des
tokens facturés par le fournisseur.

## Contrats

- Ne jamais utiliser d'URL ni de code arbitraire généré par le modèle dans le moteur.
- Les mots d'un prompt déterminent seulement un preset de rendu local.
- Un piège quicksand persiste jusqu'à la première entrée ennemie; les alliés
  ne le consomment pas.
- Le moteur résout la capture, le VFX et le son sink dans tile.resolveTrap.
- Tout effet persistant doit être détruit avec object.clear au moment de la
  consommation, de l'annulation ou de la restauration d'une partie.
- Budget maximum des effets Pixi, rayon borné, particules bornées.
- Une compilation dont l'audit de couverture est incomplet n'est pas publiable.

## Validation

Commandes non destructives:

```bash
pnpm exec vitest run src/fx src/engine/adapters/vfxAdapter.test.ts src/engine/__tests__/catalog-contracts-v2.test.ts
pnpm exec tsc --noEmit -p tsconfig.app.json
pnpm build
```

Ces tests ne prouvent pas une intégration OpenAI réelle ; pour cela utiliser
une session authentifiée, le projet Supabase chessarchitect confirmé, et
inspecter le payload de compilation, le modèle, les métriques et l'audit
sans exposer aucune clé.
