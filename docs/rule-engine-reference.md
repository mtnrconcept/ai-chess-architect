# Référence du moteur de règles AI Chess Architect

## Vue d'ensemble

Le moteur de règles permet de créer des variantes d'échecs personnalisées en définissant des actions, conditions, et événements au format JSON. Ce document liste toutes les fonctionnalités disponibles.

---

## Actions disponibles

### Gestion de statuts

#### `status.add`
Ajoute un statut temporisé à une pièce.

**Paramètres:**
- `pieceId`: ID de la pièce
- `key`: Identifiant du statut (ex: "frozen", "invisible")
- `duration`: Nombre de tours (-1 = permanent)
- `metadata`: Données optionnelles

**Exemple:**
```json
{
  "action": "status.add",
  "params": {
    "pieceId": "$targetPieceId",
    "key": "frozen",
    "duration": 2,
    "metadata": { "blocks": ["move", "attack"] }
  }
}
```

#### `status.remove`
Retire un statut d'une pièce.

**Paramètres:**
- `pieceId`: ID de la pièce
- `key`: Identifiant du statut

#### `status.tickAll`
Décrémente tous les statuts temporisés (appelé automatiquement par le moteur).

**Paramètres:**
- `side`: Camp dont les statuts doivent être décrémenter ("white" | "black")

---

### Manipulation de pièces

#### `piece.spawn`
Crée une nouvelle pièce.

**Paramètres:**
- `type`: Type de pièce (pawn, rook, etc.)
- `side`: Camp (white/black)
- `tile`: Case (ex: "e4")

#### `piece.capture`
Capture une pièce.

**Paramètres:**
- `pieceId`: ID de la pièce à capturer
- `reason`: Raison optionnelle

#### `piece.move`
Déplace une pièce.

**Paramètres:**
- `pieceId`: ID de la pièce
- `to`: Case de destination

#### `piece.duplicate`
Duplique une pièce.

**Paramètres:**
- `sourceId`: ID de la pièce à dupliquer
- `tile`: Case de destination

#### `piece.setInvisible`
Rend une pièce invisible/visible.

**Paramètres:**
- `pieceId`: ID de la pièce
- `value`: true/false

---

### Gestion de state

#### `state.set`
Définit une valeur dans le state de la règle.

**Paramètres:**
- `path`: Chemin (ex: "rules.myRule.counter")
- `value`: Valeur à définir

#### `state.inc`
Incrémente un compteur.

**Paramètres:**
- `path`: Chemin du compteur
- `by`: Montant (défaut: 1)
- `default`: Valeur initiale si inexistant

#### `state.delete`
Supprime une valeur du state.

**Paramètres:**
- `path`: Chemin à supprimer

---

### Pièges et terrain

#### `tile.setTrap`
Place un piège sur une case.

**Paramètres:**
- `tile`: Case
- `kind`: Type de piège
- `sprite`: Sprite optionnel

#### `tile.clearTrap`
Retire un piège.

**Paramètres:**
- `tile`: Case

#### `tile.resolveTrap`
Déclenche un piège.

**Paramètres:**
- `tile`: Case
- `persistent`: Conserver après activation

---

### Effets visuels et audio

#### `vfx.play`
Joue une animation.

**Paramètres:**
- `sprite`: ID de l'animation
- `tile`: Case cible

#### `audio.play`
Joue un son.

**Paramètres:**
- `id`: ID du son

#### `ui.toast`
Affiche un message.

**Paramètres:**
- `message`: Texte à afficher

---

### Gestion de jeu

#### `cooldown.set`
Définit un cooldown.

**Paramètres:**
- `pieceId`: ID de la pièce
- `actionId`: ID de l'action
- `turns`: Nombre de tours

#### `turn.end`
Termine le tour actuel.

---

## Conditions disponibles

### Ciblage

- `ctx.hasTargetTile`: Une case cible est sélectionnée
- `ctx.hasTargetPiece`: Une pièce cible est sélectionnée
- `target.isEnemy`: La pièce cible est ennemie
- `target.isFriendly`: La pièce cible est alliée

### Statuts

- `piece.hasStatus`: La pièce a un statut
  - Paramètre: `key` (identifiant du statut)
- `target.hasStatus`: La pièce cible a un statut
  - Paramètre: `key`

### Cases

- `tile.isEmpty`: La case cible est vide
- `tile.withinBoard`: La case est dans les limites du plateau

### Pièces

- `piece.exists`: La pièce existe
- `piece.isTypeInScope`: La pièce correspond au scope de la règle

### State

- `state.exists`: Une valeur existe dans le state
  - Paramètre: `path`
- `state.equals`: Une valeur est égale
  - Paramètres: `path`, `value`
- `state.lessThan`: Une valeur est inférieure
  - Paramètres: `path`, `value`

### Autres

- `cooldown.ready`: Le cooldown est terminé
- `random.chance`: Test probabiliste
  - Paramètre: `percent` (défaut: 50)

---

## Opérateurs logiques

Les conditions peuvent être combinées avec des opérateurs:

### `not`
Inverse une condition.
```json
["not", "tile.isEmpty"]
```

### `and`
Toutes les conditions doivent être vraies.
```json
["and", "cooldown.ready", "ctx.hasTargetPiece", "target.isEnemy"]
```

### `or`
Au moins une condition doit être vraie.
```json
["or", "piece.hasStatus", "target.hasStatus"]
```

---

## Providers

Les providers fournissent des listes de cases ou pièces valides pour le ciblage.

### Cases

- `provider.anyEmptyTile`: Toutes les cases vides
- `provider.neighborsEmpty`: Cases voisines vides
  - Paramètre: `radius` (défaut: 1)
- `provider.allTiles`: Toutes les cases
- `provider.tilesInRadius`: Cases dans un rayon
  - Paramètres: `center`, `radius`
- `provider.emptyTilesInRadius`: Cases vides dans un rayon
  - Paramètres: `center`, `radius`

### Pièces

- `provider.enemyPieces`: Toutes les pièces ennemies
- `provider.friendlyPieces`: Toutes les pièces alliées
- `provider.piecesInRadius`: Pièces dans un rayon
  - Paramètres: `center`, `radius`
- `provider.enemiesInLineOfSight`: Ennemis en ligne de vue
  - Paramètre: `maxRange` (défaut: 8)

---

## Événements lifecycle

### `ui.CUSTOM_ACTION_ID`
Déclenché quand une action UI est activée.

### `lifecycle.onMoveCommitted`
Après qu'un coup a été joué.

### `lifecycle.onEnterTile`
Quand une pièce entre sur une case.

### `lifecycle.onTurnStart`
Au début de chaque tour.

### `lifecycle.onPromote`
Quand un pion est promu.

### `status.expired`
Quand un statut expire (émis automatiquement).

---

## Variables contextuelles

Ces variables sont disponibles dans les `params` des actions:

- `$pieceId`: ID de la pièce qui effectue l'action
- `$targetTile`: Case cible sélectionnée
- `$targetPieceId`: ID de la pièce cible (si présente)
- `$params.*`: Paramètres définis dans la règle

---

## Exemple de règle complète

```json
{
  "meta": {
    "ruleId": "freeze_missile",
    "ruleName": "Missiles Gelants",
    "description": "Les pions peuvent geler des pièces ennemies",
    "category": "attack",
    "isActive": true
  },
  "scope": {
    "affectedPieces": ["pawn"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_freeze_missile",
      "label": "Missile gelant",
      "hint": "Gèle une pièce ennemie pendant 2 tours",
      "icon": "❄️",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["pawn"],
        "phase": "main",
        "cooldownOk": true
      },
      "targeting": {
        "mode": "piece",
        "validTilesProvider": "provider.enemiesInLineOfSight"
      },
      "consumesTurn": true,
      "cooldown": { "perPiece": 2 }
    }]
  },
  "parameters": {
    "freezeKey": "frozen",
    "freezeTurns": 2
  },
  "logic": {
    "effects": [{
      "id": "fire-missile",
      "when": "ui.special_freeze_missile",
      "if": [
        "cooldown.ready",
        "ctx.hasTargetPiece",
        "target.isEnemy",
        ["not", ["target.hasStatus", "$params.freezeKey"]]
      ],
      "do": [
        {
          "action": "vfx.play",
          "params": {
            "sprite": "ice_projectile",
            "tile": "$targetTile"
          }
        },
        {
          "action": "status.add",
          "params": {
            "pieceId": "$targetPieceId",
            "key": "$params.freezeKey",
            "duration": "$params.freezeTurns"
          }
        },
        {
          "action": "cooldown.set",
          "params": {
            "pieceId": "$pieceId",
            "actionId": "special_freeze_missile",
            "turns": 2
          }
        },
        {
          "action": "turn.end"
        }
      ]
    }]
  }
}
```
