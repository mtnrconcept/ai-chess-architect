# Moteur de règles générique - Voltus Chess

## Vue d'ensemble

Un moteur de règles déclaratif plug-and-play qui permet d'ingérer **n'importe quelle règle JSON** et d'orchestrer :
- ✅ État du jeu et persistance
- ✅ Actions UI avec ciblage
- ✅ Événements de cycle de vie
- ✅ VFX/SFX
- ✅ Cooldowns
- ✅ Undo/Redo
- ✅ Sérialisation complète

## Architecture

### Composants principaux

```
src/engine/
├── types.ts           # Types TypeScript complets
├── eventBus.ts        # Bus d'événements pub/sub
├── cooldown.ts        # Gestion des cooldowns par pièce/action
├── stateStore.ts      # Persistance d'état avec undo/redo
├── registry.ts        # Registre de conditions/effets/providers
├── engine.ts          # Moteur principal
├── bootstrap.ts       # Initialisation et exports
└── builtins/
    ├── conditions.ts  # Conditions prédéfinies
    ├── effects.ts     # Effets prédéfinies
    └── providers.ts   # Providers prédéfinis
```

### Flux de données

```
Règle JSON → RuleEngine.loadRules()
    ↓
Enregistrement UI actions + handlers
    ↓
Événement déclenché (lifecycle/ui)
    ↓
Évaluation des conditions (guards)
    ↓
Exécution des effets
    ↓
Mise à jour état + VFX/SFX
```

## Contrats d'intégration (EngineContracts)

Le moteur de règles requiert une implémentation de ces interfaces :

### BoardAPI
```typescript
interface BoardAPI {
  tiles(): Tile[];                                    // Liste toutes les cases
  isEmpty(tile: Tile): boolean;                       // Case vide?
  getPieceAt(tile: Tile): PieceID | null;            // Pièce sur case
  getPiece(id: PieceID): Piece;                       // Récupère pièce
  setPieceTile(id: PieceID, tile: Tile): void;       // Déplace pièce
  removePiece(id: PieceID): void;                     // Retire pièce
  spawnPiece(type: string, side: Side, tile: Tile): PieceID;  // Crée pièce
  withinBoard(tile: Tile): boolean;                   // Case valide?
  neighbors(tile: Tile, radius?: number): Tile[];     // Cases voisines
  setDecal(tile: Tile, spriteId: SpriteId | null): void;      // Décal visuel
  clearDecal(tile: Tile): void;                       // Efface décal
}
```

### UIAPI
```typescript
interface UIAPI {
  toast(msg: string): void;                           // Affiche notification
  registerAction(actionSpec: UIActionSpec): void;     // Enregistre action UI
}
```

### VFXAPI
```typescript
interface VFXAPI {
  spawnDecal(spriteId: SpriteId, tile: Tile): void;
  clearDecal(tile: Tile): void;
  playAnimation(spriteId: SpriteId, tile: Tile): void;
  playAudio(audioId: AudioId): void;
}
```

## Structure d'une règle JSON

### Minimal
```json
{
  "meta": {
    "ruleId": "r_my_rule",
    "ruleName": "Ma Règle",
    "isActive": true,
    "category": "custom"
  },
  "logic": {
    "effects": [
      {
        "id": "my-effect",
        "when": "lifecycle.onEnterTile",
        "do": { "action": "ui.toast", "params": { "message": "Bonjour!" } }
      }
    ]
  }
}
```

### Complet
```json
{
  "meta": {
    "ruleId": "r_advanced",
    "ruleName": "Règle Avancée",
    "version": "1.0.0",
    "description": "Description détaillée",
    "category": "attack",
    "priority": 10,
    "isActive": true,
    "tags": ["special", "powerful"]
  },
  "scope": {
    "affectedPieces": ["pawn", "knight"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_action",
      "label": "Action Spéciale",
      "icon": "⚡",
      "hint": "Description de l'action",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["pawn"],
        "phase": "main",
        "cooldownOk": true
      },
      "targeting": {
        "mode": "tile",
        "validTilesProvider": "provider.anyEmptyTile"
      },
      "consumesTurn": true,
      "cooldown": { "perPiece": 2 }
    }]
  },
  "state": {
    "namespace": "rules.advanced",
    "initial": { "counter": 0 },
    "serialize": true
  },
  "parameters": {
    "damage": 10,
    "range": 3
  },
  "logic": {
    "effects": [
      {
        "id": "main-effect",
        "when": "ui.special_action",
        "if": ["ctx.hasTargetTile", "cooldown.ready"],
        "do": [
          { "action": "vfx.play", "params": { "sprite": "explosion", "tile": "$targetTile" } },
          { "action": "audio.play", "params": { "id": "boom" } },
          { "action": "turn.end" }
        ],
        "onFail": "blockAction",
        "message": "Action impossible!"
      }
    ]
  }
}
```

## Conditions prédéfinies (builtins)

| Condition | Description |
|-----------|-------------|
| `always` | Toujours vrai |
| `ctx.hasTargetTile` | Une case cible est définie |
| `cooldown.ready` | Cooldown de l'action est prêt |
| `tile.isEmpty` | Case cible est vide |
| `piece.isTypeInScope` | Pièce est du bon type |
| `status.targetNotFrozen` | Pièce cible n'est pas gelée |
| `random.50` | 50% de chance |
| `piece.exists` | Pièce existe |
| `tile.withinBoard` | Case dans le plateau |
| `piece.isSide` | Pièce du bon côté |

## Effets prédéfinis (builtins)

### VFX/Audio
- `vfx.play` - Joue une animation
- `audio.play` - Joue un son
- `decal.set` - Place un décal sur case
- `decal.clear` - Efface décal

### Tour/Match
- `turn.end` - Termine le tour
- `cooldown.set` - Active un cooldown

### Pièces
- `piece.capture` - Capture une pièce
- `piece.move` - Déplace une pièce
- `piece.spawn` - Crée une pièce
- `piece.duplicate` - Duplique une pièce
- `piece.setInvisible` - Rend invisible
- `piece.setStatus` - Ajoute statut
- `piece.clearStatus` - Retire statut

### Terrain
- `tile.setTrap` - Place un piège
- `tile.clearTrap` - Retire un piège
- `tile.resolveTrap` - Active un piège

### Utilitaires
- `area.forEachTile` - Applique effets sur zone
- `composite` - Exécute plusieurs effets
- `state.pushUndo` - Sauvegarde état pour undo
- `ui.toast` - Affiche message

## Providers prédéfinis (builtins)

| Provider | Description | Paramètres |
|----------|-------------|------------|
| `provider.anyEmptyTile` | Toutes cases vides | - |
| `provider.neighborsEmpty` | Voisins vides | center, radius |
| `provider.allTiles` | Toutes les cases | - |
| `provider.tilesInRadius` | Cases dans rayon | center, radius |
| `provider.emptyTilesInRadius` | Cases vides dans rayon | center, radius |

## Événements du cycle de vie

| Événement | Payload | Quand |
|-----------|---------|-------|
| `lifecycle.onEnterTile` | `{ pieceId, to }` | Pièce entre sur case |
| `lifecycle.onMoveCommitted` | `{ pieceId, from, to }` | Après mouvement |
| `lifecycle.onUndo` | `{}` | Undo déclenché |
| `lifecycle.onPromote` | `{ pieceId, fromType, toType }` | Promotion |
| `ui.{actionId}` | `{ pieceId?, targetTile? }` | Action UI |

## 4 Règles d'exemple

### 1. Missiles Gelants 🧊
Pions tirent des missiles qui gèlent les pièces adverses pendant 2 tours.

**Caractéristiques :**
- Ciblage : n'importe quelle case
- Cooldown : 2 tours
- Effet : status `frozen` appliqué
- VFX : projectile de glace + impact

### 2. Sable Mouvant 🏜️
Place des pièges qui capturent les pièces qui y entrent.

**Caractéristiques :**
- Ciblage : case vide
- Piège : persistent jusqu'à déclenchement
- Effet : capture immédiate
- VFX : splash de sable

### 3. Tour Invisible 👻
Tour peut devenir invisible à l'adversaire.

**Caractéristiques :**
- Pas de ciblage (self)
- Cooldown : 1 tour
- Effet : `piece.invisible = true`
- Son : cloaking

### 4. Dame Multiplicative 👯
Dame se duplique sur case voisine.

**Caractéristiques :**
- Ciblage : voisins vides
- Cooldown : 3 tours
- Max : 2 fois par pièce
- Effet : spawn nouvelle dame
- VFX : flash de spawn

## Intégration pas à pas

### 1. Bootstrap

```typescript
import { createRuleEngine } from "@/engine/bootstrap";
import { exampleRules } from "@/rules/exampleRules";

// Dans votre setup de jeu
const engineContracts: EngineContracts = {
  board: myBoardImplementation,
  ui: myUIImplementation,
  vfx: myVFXImplementation,
  cooldown: new Cooldown(),
  state: new StateStore(),
  match: myMatchImplementation,
  util: { uuid: () => crypto.randomUUID() },
  capturePiece: (id, reason) => { /* ... */ },
  eventBus: new EventBus()
};

const ruleEngine = createRuleEngine(engineContracts, exampleRules);
```

### 2. Hooks gameplay

```typescript
// Quand une pièce entre sur une case
engineContracts.eventBus.emit("lifecycle.onEnterTile", {
  pieceId: "p1",
  to: "e4"
});

// Après un mouvement
engineContracts.eventBus.emit("lifecycle.onMoveCommitted", {
  pieceId: "p1",
  from: "e2",
  to: "e4"
});

// Action UI
engineContracts.eventBus.emit("ui.runAction", {
  actionId: "special_freeze_missile",
  pieceId: "p1",
  targetTile: "e5"
});
```

### 3. Cooldowns

```typescript
// À chaque fin de tour
engineContracts.cooldown.tickAll();
```

### 4. État gelé (frozen)

```typescript
// Empêcher mouvement des pièces gelées
function canMove(piece: Piece): boolean {
  if (piece.statuses?.frozen) {
    return false;
  }
  return true;
}
```

### 5. Sérialisation

```typescript
// Sauvegarder
const gameState = {
  board: serializeBoard(),
  rules: engineContracts.state.serialize(),
  cooldowns: engineContracts.cooldown.serialize()
};

// Charger
engineContracts.state.deserialize(savedGameState.rules);
engineContracts.cooldown.deserialize(savedGameState.cooldowns);
```

## Extensions personnalisées

### Ajouter une condition

```typescript
registry.registerCondition("piece.isKing", (ctx) => {
  return ctx.piece?.type === "king";
});
```

### Ajouter un effet

```typescript
registry.registerEffect("piece.heal", (ctx, params) => {
  const piece = ctx.engine.board.getPiece(params.pieceId);
  piece.statuses = piece.statuses ?? {};
  piece.statuses.health = (piece.statuses.health ?? 100) + params.amount;
});
```

### Ajouter un provider

```typescript
registry.registerProvider("provider.diagonals", (ctx) => {
  const tile = ctx.piece.tile;
  return calculateDiagonals(tile);
});
```

## Stockage Supabase

### Table pour règles personnalisées

```sql
CREATE TABLE custom_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  rule_json jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE custom_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own rules"
  ON custom_rules FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);
```

### Charger règles depuis Supabase

```typescript
const { data: customRules } = await supabase
  .from('custom_rules')
  .select('rule_json')
  .eq('is_active', true);

const allRules = [
  ...exampleRules,
  ...customRules.map(r => r.rule_json)
];

const ruleEngine = createRuleEngine(engineContracts, allRules);
```

## Checklist qualité

- [ ] Toute action UI a un provider de cases valides
- [ ] Les guards bloquent proprement avec message
- [ ] Cooldowns décrémentés en fin de tour
- [ ] Statuses testés dans génération coups
- [ ] VFX/SFX mappés aux vrais assets
- [ ] Sérialisation testée
- [ ] Undo/redo fonctionnels

## Performance

- **Lazy evaluation** : conditions court-circuitent
- **Event batching** : effets groupés si possible
- **Memory** : StateStore limite undo stack (50 par défaut)
- **GC** : Registry ne stocke que références

## Debugging

```typescript
// Lister toutes les conditions
console.log(registry.listConditions());

// Lister tous les effets
console.log(registry.listEffects());

// Lister tous les providers
console.log(registry.listProviders());

// Inspecter règles chargées
console.log(ruleEngine.getRules());

// Inspecter actions UI
console.log(ruleEngine.getUIActions());
```

## Prochaines étapes

1. **Connecter au moteur d'échecs existant** (`src/lib/chessEngine.ts`)
2. **Implémenter BoardAPI** avec votre représentation de plateau
3. **Mapper VFX/SFX** aux assets existants
4. **Créer UI pour actions spéciales** (boutons avec ciblage)
5. **Intégrer avec Supabase** pour règles personnalisées
6. **Tester avec les 4 exemples**

## Support

Le moteur est **100% déclaratif** : toute nouvelle règle est un simple JSON.
Pas besoin de modifier le code du moteur pour ajouter des comportements !

**Architecture plug-and-play ✨**
