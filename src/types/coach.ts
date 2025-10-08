export interface CoachEvaluation {
  score: string;
  trend: 'up' | 'down' | 'stable' | string;
  bestMoves: string[];
  threats: string[];
  recommendation: string;
}

export interface AttentionLevel {
  label: string;
  status: string;
  detail: string;
}

export interface TacticalReaction {
  pattern: string;
  advice: string;
}

export interface EloEvaluation {
  estimate: number;
  range: string;
  comment: string;
  confidence: string;
  improvementTips: string[];
}

export interface SuccessRate {
  percentage: number;
  trend: 'up' | 'down' | 'stable' | string;
  comment: string;
  keyFactors: string[];
}

export interface ProgressionInsight {
  percentage: number;
  summary: string;
  graphPoints: number[];
  nextActions: string[];
}

export interface OpeningInsight {
  name: string;
  variation: string;
  phase: string;
  plan: string;
  confidence: string;
}

export interface AiSettingSuggestion {
  label: string;
  current: string;
  suggestion: string;
}

export interface CoachInsights {
  analysisSummary: string;
  evaluation: CoachEvaluation;
  attentionLevels: AttentionLevel[];
  tacticalReactions: TacticalReaction[];
  eloEvaluation: EloEvaluation;
  successRate: SuccessRate;
  progression: ProgressionInsight;
  opening: OpeningInsight;
  explainLikeImFive: string;
  aiSettings: AiSettingSuggestion[];
}

export interface CoachInsightsResponse {
  insights: CoachInsights;
}
