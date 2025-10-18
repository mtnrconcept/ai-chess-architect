export interface LogicEffect {
  id: string;
  when: string;
  if?: string | string[];
  do: ActionStep | ActionStep[];
  onFail?: ActionStep | ActionStep[];
  consumesTurn?: boolean;
  cooldown?: {
    perPiece?: number;
    perGame?: number;
    turns?: number;
  };
}

export interface ActionStep {
  action: string;
  params?: Record<string, any>;
}

export interface UIAction {
  id: string;
  label: string;
  icon?: string;
  hint?: string;
  availability?: {
    requiresSelection?: boolean;
    phase?: string;
    conditions?: string[];
  };
  targeting?: {
    type?: 'tile' | 'piece' | 'none';
    validTiles?: string[];
    highlightMoves?: boolean;
  };
  consumesTurn?: boolean;
  cooldown?: {
    perPiece?: number;
    perGame?: number;
    turns?: number;
  };
}

export interface RuleJSON {
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
