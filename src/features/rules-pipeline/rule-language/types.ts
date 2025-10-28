import type { CanonicalIntent } from "../schemas/canonicalIntent";

export type RuleKeyword =
  | "hazard"
  | "status"
  | "teleport"
  | "swap"
  | "morph"
  | "projectile"
  | string;

export type DefineRuleCommand = {
  type: "DEFINE_RULE";
  name: string;
  template: CanonicalIntent["templateId"];
  category?: string;
};

export type SetSummaryCommand = {
  type: "SET_SUMMARY";
  summary: string;
};

export type SetPiecesCommand = {
  type: "SET_PIECES";
  pieces: string[];
};

export type AddMechanicCommand = {
  type: "ADD_MECHANIC";
  mechanic: string;
};

export type AddHazardCommand = {
  type: "ADD_HAZARD";
  hazard: string;
};

export type AddStatusCommand = {
  type: "ADD_STATUS";
  status: string;
};

export type AddKeywordCommand = {
  type: "ADD_KEYWORD";
  keyword: RuleKeyword;
};

export type SetTargetingCommand = {
  type: "SET_TARGETING";
  mode: "none" | "tile" | "piece" | "area" | "pair" | "path";
  provider: string;
  params?: Record<string, unknown>;
};

export type SetLimitCommand = {
  type: "SET_LIMIT";
  limit: "cooldownPerPiece" | "oncePerMatch" | "chargesPerMatch" | "duration";
  value: number | boolean;
};

export type SetRequirementCommand = {
  type: "SET_REQUIREMENT";
  requirement: "kingSafety" | "pathClear" | "noTargetKing";
  value: boolean;
};

export type AddTextHintCommand = {
  type: "ADD_TEXT_HINT";
  hint: string;
};

export type AddNoteCommand = {
  type: "ADD_NOTE";
  note: string;
};

export type ExpectActionCommand = {
  type: "EXPECT_ACTION";
  action: string;
  expected?: boolean;
  reason?: string;
};

export type TargetOccupation = "empty" | "enemy" | "ally";

export type ExpectMoveCommand = {
  type: "EXPECT_MOVE";
  piece: string;
  from: string;
  to: string;
  expected: "legal" | "illegal";
  occupation?: TargetOccupation;
  reason?: string;
};

export type MovePattern =
  | "forward"
  | "diagonal"
  | "orthogonal"
  | "knight"
  | "teleport"
  | "line";

export type MoveConstraint =
  | "capture_only"
  | "non_capture"
  | "single_step"
  | "multi_step";

export type AddMoveCommand = {
  type: "ADD_MOVE";
  piece: string;
  pattern: MovePattern;
  constraints?: MoveConstraint[];
  maxDistance?: number;
};

export type RemoveMoveCommand = {
  type: "REMOVE_MOVE";
  piece: string;
  pattern: MovePattern;
};

export type RuleCommand =
  | DefineRuleCommand
  | SetSummaryCommand
  | SetPiecesCommand
  | AddMechanicCommand
  | AddHazardCommand
  | AddStatusCommand
  | AddKeywordCommand
  | SetTargetingCommand
  | SetLimitCommand
  | SetRequirementCommand
  | AddTextHintCommand
  | AddNoteCommand
  | ExpectActionCommand
  | ExpectMoveCommand
  | AddMoveCommand
  | RemoveMoveCommand;

export type RuleProgram = {
  source: string;
  commands: RuleCommand[];
};
