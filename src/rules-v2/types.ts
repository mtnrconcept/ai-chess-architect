export const RULE_SCHEMA_VERSION = "2.0.0" as const;
export const ENGINE_VERSION = "2.0.0" as const;

export const RULE_CATEGORIES = [
  "movement",
  "capture",
  "special",
  "condition",
  "victory",
  "restriction",
  "defense",
  "behavior",
  "vip",
] as const;

export const PIECE_TYPES = [
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
  "king",
  "any",
] as const;

export const SIDES = ["white", "black"] as const;

export const RULE_EVENTS = [
  "lifecycle.onEnterTile",
  "lifecycle.onMoveCommitted",
  "lifecycle.onUndo",
  "lifecycle.onPromote",
  "lifecycle.onTurnStart",
  "ui.action",
] as const;

export const TARGETING_MODES = ["none", "tile", "piece", "area"] as const;

export const PROVIDERS = [
  "none",
  "provider.anyEmptyTile",
  "provider.neighborsEmpty",
  "provider.allTiles",
  "provider.tilesInRadius",
  "provider.emptyTilesInRadius",
  "provider.enemyPieces",
  "provider.friendlyPieces",
  "provider.piecesInRadius",
  "provider.enemiesInLineOfSight",
] as const;

export const CONDITION_OPS = [
  "always",
  "ctx.hasTargetTile",
  "ctx.hasTargetPiece",
  "cooldown.ready",
  "tile.isEmpty",
  "tile.withinBoard",
  "piece.isTypeInScope",
  "piece.hasMoved.equals",
  "status.targetNotFrozen",
  "piece.exists",
  "piece.isSide",
  "piece.hasStatus",
  "target.hasStatus",
  "target.isEnemy",
  "target.isFriendly",
  "state.exists",
  "state.equals",
  "state.lessThan",
  "random.chance",
  "match.turnNumber.atLeast",
  "match.turnNumber.lessThan",
] as const;

export const EFFECT_OPS = [
  "vfx.play",
  "audio.play",
  "decal.set",
  "decal.clear",
  "turn.end",
  "cooldown.set",
  "piece.capture",
  "piece.move",
  "piece.spawn",
  "piece.promote",
  "piece.duplicate",
  "piece.setInvisible",
  "piece.setStatus",
  "piece.clearStatus",
  "tile.setTrap",
  "tile.clearTrap",
  "tile.resolveTrap",
  "ui.toast",
  "status.add",
  "status.remove",
  "state.set",
  "state.inc",
  "state.delete",
] as const;

export const ARGUMENT_KINDS = [
  "string",
  "number",
  "boolean",
  "string_list",
  "token",
] as const;

export type RuleCategory = (typeof RULE_CATEGORIES)[number];
export type PieceType = (typeof PIECE_TYPES)[number];
export type Side = (typeof SIDES)[number];
export type RuleEvent = (typeof RULE_EVENTS)[number];
export type TargetingMode = (typeof TARGETING_MODES)[number];
export type ProviderId = (typeof PROVIDERS)[number];
export type ConditionOp = (typeof CONDITION_OPS)[number];
export type EffectOp = (typeof EFFECT_OPS)[number];
export type ArgumentKind = (typeof ARGUMENT_KINDS)[number];

export interface RuleArgument {
  name: string;
  kind: ArgumentKind;
  stringValue: string;
  numberValue: number;
  booleanValue: boolean;
  stringListValue: string[];
}

export interface BlueprintCondition {
  id: string;
  op: ConditionOp;
  arguments: RuleArgument[];
  negate: boolean;
}

export interface BlueprintEffect {
  id: string;
  op: EffectOp;
  arguments: RuleArgument[];
}

export interface BlueprintAction {
  id: string;
  label: string;
  description: string;
  targetingMode: TargetingMode;
  validTilesProvider: ProviderId;
  consumesTurn: boolean;
  cooldownTurns: number;
  maxPerPiece: number;
  requiresSelection: boolean;
  pieceTypes: PieceType[];
}

export interface BlueprintTrigger {
  id: string;
  event: RuleEvent;
  actionId: string;
  priority: number;
  conditions: BlueprintCondition[];
  effects: BlueprintEffect[];
  onFailure: "blockAction" | "skip";
  message: string;
}

export interface RuleBlueprintV2 {
  schemaVersion: typeof RULE_SCHEMA_VERSION;
  ruleKey: string;
  title: string;
  summary: string;
  category: RuleCategory;
  tags: string[];
  affectedPieces: PieceType[];
  sides: Side[];
  stateNamespace: string;
  initialStateJson: string;
  actions: BlueprintAction[];
  triggers: BlueprintTrigger[];
  balance: {
    powerLevel: number;
    counterplay: string[];
    limitations: string[];
  };
  explanation: {
    plainLanguage: string;
    examples: string[];
  };
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface RuleDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  path: string;
  message: string;
}

export interface CompilationMetrics {
  riskScore: number;
  balanceScore: number;
  complexity: "low" | "medium" | "high";
  triggerCount: number;
  effectCount: number;
  actionCount: number;
}

export interface LegacyRuleJSON {
  meta: {
    ruleId: string;
    ruleName: string;
    version: string;
    description: string;
    category: RuleCategory;
    priority: number;
    isActive: boolean;
    tags: string[];
  };
  scope: {
    affectedPieces: string[];
    sides: Side[];
  };
  ui: {
    actions: Array<{
      id: string;
      label: string;
      hint: string;
      availability: {
        requiresSelection: boolean;
        pieceTypes: string[];
        cooldownOk: boolean;
      };
      targeting: {
        mode: TargetingMode;
        validTilesProvider?: string;
      };
      consumesTurn: boolean;
      cooldown: {
        perPiece: number;
      };
      maxPerPiece: number;
    }>;
  };
  state: {
    namespace: string;
    schema: Record<string, unknown>;
    initial: Record<string, unknown>;
    serialize: boolean;
  };
  logic: {
    effects: Array<{
      id: string;
      when: string;
      priority: number;
      if?: unknown;
      do: Array<{
        action: EffectOp;
        params?: Record<string, unknown>;
      }>;
      onFail: "blockAction" | "skip";
      message?: string;
    }>;
  };
  integration: {
    ruleArchitect: {
      schemaVersion: string;
      engineVersion: string;
      source: "ai-blueprint";
      blueprintRuleKey: string;
    };
  };
  createdAt: string;
}

export interface CompilationResult {
  ok: boolean;
  blueprint: RuleBlueprintV2 | null;
  compiledRule: LegacyRuleJSON | null;
  diagnostics: RuleDiagnostic[];
  metrics: CompilationMetrics;
}

export type RuleRequirementCoverageStatus =
  | "implemented"
  | "adapted"
  | "clarification_required"
  | "unsupported";

export interface RuleRequirementCoverage {
  id: string;
  status: RuleRequirementCoverageStatus;
  evidencePaths: string[];
  explanation: string;
  adaptation: string;
  userApproved: boolean;
}

export interface RuleCoverageAssessment {
  complete: boolean;
  exactIntentPreserved: boolean;
  score: number;
  summary: string;
  requirements: RuleRequirementCoverage[];
}

export interface CompileRuleResponse extends CompilationResult {
  compilationId: string;
  contentHash: string | null;
  model: string;
  premiumRequested: boolean;
  premiumGranted: boolean;
  requestId: string | null;
  generationDurationMs: number;
  coverage: RuleCoverageAssessment | null;
}

export interface PublishedRuleVersion {
  blueprintId: string;
  versionId: string;
  versionNumber: number;
  legacyRuleId: string;
  contentHash: string;
}

export interface CreatedRuleLobby {
  lobbyId: string;
  rulesetHash: string;
  /** Null while a player lobby is waiting; revealed atomically when joined. */
  matchSeed: number | null;
  legacyRuleIds: string[];
}
