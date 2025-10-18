# Guide de Normalisation des Règles Chess

## Vue d'ensemble

Ce document décrit le système de normalisation complet des règles d'échecs dans la table `chess_rules`, garantissant la cohérence entre les règles preset, custom et AI-generated.

## Structure Normalisée

Toutes les règles suivent maintenant le schéma `RuleJSON` unifié :

```typescript
interface RuleJSON {
  meta: {
    ruleId: string;
    ruleName: string;
    category: string;
    description: string;
    tags?: string[];
    version?: string;
    isActive?: boolean;
  };
  scope: {
    affectedPieces: string[];
    sides?: ('white' | 'black')[];
  };
  logic: {
    effects: LogicEffect[];
  };
  ui: {
    actions: UIAction[];
  };
  assets: {
    color: string;
    icon: string;
    sfx?: {
      onTrigger?: string;
      onSuccess?: string;
      onFail?: string;
    };
  };
  state?: {
    namespace: string;
    initial?: Record<string, any>;
  };
  parameters?: Record<string, any>;
}
```

## Enrichissement Automatique

### 1. Assets par Catégorie

Chaque catégorie a des assets par défaut :

| Catégorie | Couleur | Icône | SFX Trigger | SFX Success |
|-----------|---------|-------|-------------|-------------|
| vip | #9C27B0 | 🎭 | check | capture |
| capture | #76E0FF | ⚔️ | explosion | capture |
| defense | #4CAF50 | 🛡️ | shield | check |
| special | #FF5722 | ✨ | special-ability | capture |
| movement | #2196F3 | 🏃 | move | move |
| behavior | #FFC107 | 🧠 | move | check |
| terrain | #795548 | 🗺️ | move | explosion |
| upgrade | #00BCD4 | ⬆️ | special-ability | capture |

### 2. Génération UI Actions

Les actions UI sont générées automatiquement à partir de `logic.effects` :

- Détection des effets avec `when: "ui.special_*"`
- Extraction de labels, hints, icônes basée sur les actions
- Configuration du targeting selon le type d'action
- Cooldown par défaut : `{ perPiece: 1 }`

### 3. State Management

- **Namespace** : `rules.{category}.{ruleId}`
- **Initial State** : détecté automatiquement depuis les actions `state.inc` et `state.set`
- **Phase** : ajoutée si `lifecycle.onGameStart` détecté

### 4. FX et Animations

Les effets visuels sont injectés automatiquement :

**Mots-clés détectés** :
- `mine`, `piège` → `object.spawn` + `area.hazard`
- `explosion` → `combat.explosion`
- `téléport`, `portal` → `space.warp`
- `gel`, `freeze` → `combat.freeze`
- `feu`, `burn` → `combat.burn`
- `bouclier` → `viz.highlight`
- `invisible`, `secret` → `viz.hologram`
- `catapult` → `piece.trail`

**Actions ajoutées** :
```typescript
{
  action: "vfx.play",
  params: {
    sprite: "combat_explosion",
    tile: "${targetTile}",
    fxIntents: [...]
  }
}
```

```typescript
{
  action: "audio.play",
  params: {
    id: "explosion" // depuis assets.sfx.onTrigger
  }
}
```

## Migration Exécutée

La migration `20251018_normalize_all_rules.sql` a :

1. ✅ Enrichi les assets pour toutes les règles
2. ✅ Ajouté les namespaces de state
3. ✅ Créé des objets `ui` vides si absents
4. ✅ Normalisé les objets `meta` avec toutes les infos
5. ✅ Assuré la présence de `scope`
6. ✅ Validé et marqué les règles comme fonctionnelles
7. ✅ Synchronisé la colonne `assets` avec `rule_json->assets`

## Edge Function Mise à Jour

L'Edge Function `generate-chess-rule` applique maintenant automatiquement :

1. **Enrichissement Assets** : couleur, icône, SFX selon catégorie
2. **Génération UI Actions** : depuis les effets logic
3. **State Management** : namespace + initial state
4. **FX Intents** : injection VFX et audio selon description

## Vérification

Utilisez le script `docs/normalization-verification.sql` pour :

- Vérifier la complétude des structures
- Lister les assets par catégorie
- Examiner les namespaces
- Compter les UI actions
- Détecter les VFX et audio
- Identifier les anomalies
- Obtenir des statistiques par catégorie

## Utilisation

### Créer une Nouvelle Règle

```typescript
// L'Edge Function enrichit automatiquement
const { data } = await supabase.functions.invoke('generate-chess-rule', {
  body: { 
    prompt: "Les tours peuvent lancer des missiles explosifs",
    locale: "fr"
  }
});

// Résultat : règle complète avec assets, UI, state, FX
```

### Charger les Règles

```typescript
import { loadPresetRulesFromDatabase } from '@/lib/presetRulesAdapter';

const rules = await loadPresetRulesFromDatabase();
// Toutes les règles ont la même structure normalisée
```

### Mapper une Règle

```typescript
import { mapChessRuleRowToChessRule } from '@/lib/customRuleMapper';

const chessRule = mapChessRuleRowToChessRule(row);
// Conversion automatique avec validation
```

## Fichiers Clés

### Backend (Edge Function)
- `supabase/functions/_shared/enrichment.ts` : Logique d'enrichissement
- `supabase/functions/generate-chess-rule/index.ts` : Génération IA + enrichissement

### Frontend (Utilitaires)
- `src/types/ruleSchema.ts` : Schéma TypeScript unifié
- `src/lib/assetMapper.ts` : Mapping catégorie → assets
- `src/lib/uiActionGenerator.ts` : Génération UI actions
- `src/lib/fxEnricher.ts` : Injection FX et audio
- `src/fx/lexicon.ts` : Dictionnaire FX étendu

### Migration
- `supabase/migrations/20251018_normalize_all_rules.sql` : Script de normalisation

### Documentation
- `docs/normalization-verification.sql` : Requêtes de vérification
- `docs/normalization-guide.md` : Ce guide

## Résultat

✅ **Une seule structure** : `rule_json` uniforme pour toutes les sources  
✅ **Assets automatiques** : couleurs, icônes, SFX par catégorie  
✅ **UI générée** : actions jouables extraites de la logique  
✅ **FX intégrés** : animations et sons injectés automatiquement  
✅ **State management** : namespaces et états initiaux  
✅ **Validation complète** : schéma + dry-run + marquage fonctionnel  

Toutes les règles sont désormais cohérentes, complètes et prêtes à l'emploi ! 🎉
