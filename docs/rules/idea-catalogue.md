# Catalogue d'idées de règles compatibles

Ce catalogue recense des mécaniques prêtes à l'emploi pour le moteur de règles. Toutes les idées ci-dessous n'utilisent **que** des actions autorisées par `validateRuleJSONActions` et peuvent donc être transmises telles quelles à l'IA génératrice de règles.

## 💥 Pièges et dangers

### Mine explosive
- **Déclencheur principal** : `ui.special_place_mine`
- **Actions** : `hazard.spawn`, `cooldown.set`, `turn.end`, `vfx.play`, `audio.play`
- **Suivi** : `lifecycle.onEnterTile` → `hazard.resolve`, `hazard.explode`, `piece.capture`, `vfx.play`
- **Notes** : modèle idéal pour recycler votre règle de "mine" désormais validée.

### Piège immobilisant
- **Déclencheur** : `lifecycle.onEnterTile`
- **Actions** : `tile.resolveTrap`, `piece.setStatus`, `vfx.play`
- **Effets persistants** : `turn.start` → `status.tickAll` (en bloquant les déplacements si le statut "stunned" est actif)

### Bombe à retardement
- **Pose** : `ui.special_place_bomb` → `hazard.spawn` (avec `ttl`/`ticks`)
- **Compte à rebours** : `turn.start` → `hazard.tick`
- **Explosion** : `hazard.onTickZero`/condition `hazard.ticksRemaining == 0` → `hazard.explode`, `board.areaEffect`

## 🪄 Pièces héroïques

### Berserker
- **Déclencheur** : `ui.special_berserk`
- **Actions** : `piece.capture` (sur un allié choisi ou points de vie abstraits), `piece.setStatus`, `turn.end`

### Assassin invisible
- **Déclencheur** : `ui.special_cloak`
- **Actions** : `piece.setInvisible`, `piece.setStatus`, `turn.end`
- **Suivi** : `status.onExpire('invisible')` → `piece.setInvisible(false)`

### Nécromancien
- **Accumulation** : `lifecycle.onCapture` → `state.inc`
- **Invocation** : `ui.special_summon` (condition `state.gte('souls', 3)`) → `piece.spawn`, `state.set`, `turn.end`

## 🌪️ Sorts et effets de zone

### Flèche de glace
- **Déclencheur** : `ui.special_frostbolt`
- **Actions** : `projectile.spawn`, `turn.end`
- **Impact** : `projectile.onHit` → `piece.setStatus`, `vfx.play`

### Zone de soin
- **Pose** : `ui.special_heal_zone` → `decal.set`, `turn.end`
- **Résolution** : `turn.end` → `area.forEachTile` (filtrage par `decal`) puis `piece.clearStatus`

### Sacrifice explosif
- **Déclencheur** : `ui.special_self_destruct`
- **Actions** : `piece.capture` (sur la pièce active), `board.areaEffect`, `vfx.play`

## 🔧 Utilitaires et méta

### Échange instantané
- **Déclencheur** : `ui.special_swap`
- **Actions** : séquence `composite` regroupant `state.set` pour stocker les positions, suivi de deux `piece.move`, puis `turn.end`

### Pion messager
- **Déclencheur** : `lifecycle.onMoveEnd`
- **Condition** : `piece.isType('pawn')` et `tile.isRank(5)`
- **Action** : `ui.toast`

### Duplication slime
- **Déclencheur** : `ui.special_duplicate`
- **Actions** : `piece.duplicate`, `cooldown.set`, `turn.end`

---

> 💡 **Astuce** : Ce document peut être fourni directement au modèle pour guider la génération de règles JSON sûres. Chaque concept indique les événements `when`, les actions autorisées et les suivis nécessaires.
