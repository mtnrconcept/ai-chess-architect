import type { Engine, EngineEvaluation } from "packages/engine";
import { StockfishWasmEngine } from "packages/engine";
import { LLMProvider } from "packages/llm";

export type MoveQuality =
  | "brilliant"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "book"
  | "forced";

export interface MoveInput {
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
}

export interface MoveEvaluation extends EngineEvaluation {
  readonly ply: number;
  readonly classification: MoveQuality;
  readonly delta: number;
  readonly themes: string[];
  readonly explanation?: CoachExplanation;
}

export interface CoachExplanation {
  readonly headline: string;
  readonly whyBadOrGood: string;
  readonly whatToLearn: string[];
  readonly bestLineExplained: string;
}

export interface CoachReport {
  readonly summary: string;
  readonly keyMoments: MoveEvaluation[];
  readonly accuracyWhite: number;
  readonly accuracyBlack: number;
  readonly blundersWhite: number;
  readonly blundersBlack: number;
  readonly inaccuraciesWhite: number;
  readonly inaccuraciesBlack: number;
}

export interface AnalysisResult {
  readonly moveEvaluations: MoveEvaluation[];
  readonly report: CoachReport;
}

export interface PipelineOptions {
  readonly depth: number;
  readonly multiPV: number;
  readonly threads: number;
  readonly hashMB: number;
  readonly llmProvider?: LLMProvider;
  readonly engineFactory?: () => Engine;
}

const DEFAULT_THEMES = [
  "fork",
  "pin",
  "skewer",
  "discovered attack",
  "zwischenzug",
  "overload",
  "deflection",
  "clearance",
  "weak squares",
  "isolated pawn",
  "doubled pawns",
  "passed pawn",
  "minority attack",
  "bishop pair",
  "king safety",
  "space advantage",
];

interface ScoredMove {
  readonly ply: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly evaluation: EngineEvaluation;
}

export class AnalysisPipeline {
  private readonly options: PipelineOptions;
  private readonly engine: Engine;
  private readonly llmProvider?: LLMProvider;

  public constructor(options: PipelineOptions) {
    this.options = options;
    this.engine = options.engineFactory
      ? options.engineFactory()
      : new StockfishWasmEngine();
    this.llmProvider = options.llmProvider;
  }

  public async run(moves: MoveInput[]): Promise<AnalysisResult> {
    await this.engine.init({
      threads: this.options.threads,
      hashMB: this.options.hashMB,
    });

    const scored: ScoredMove[] = [];
    let previousScore = 0;

    for (const move of moves) {
      const evaluation = await this.engine.evalFen(move.fenAfter, {
        depth: this.options.depth,
        multiPV: this.options.multiPV,
      });
      const scoreCp =
        evaluation.score.cp ??
        convertMateScoreToCentipawns(evaluation.score.mate ?? 0, previousScore);
      scored.push({
        ply: move.ply,
        scoreBefore: previousScore,
        scoreAfter: scoreCp,
        evaluation,
      });
      previousScore = scoreCp;
    }

    await this.engine.dispose();

    const moveEvaluations = await this.enrichMoves(moves, scored);
    const report = await this.buildReport(moveEvaluations);

    return { moveEvaluations, report };
  }

  private async enrichMoves(
    moves: MoveInput[],
    scored: ScoredMove[],
  ): Promise<MoveEvaluation[]> {
    const results: MoveEvaluation[] = [];

    for (let i = 0; i < moves.length; i += 1) {
      const move = moves[i];
      const score = scored[i];
      const delta = score.scoreAfter - score.scoreBefore;
      const classification = classifyMove(delta, score, move.ply);
      const themes = detectThemes(move);

      let explanation: CoachExplanation | undefined;
      if (this.llmProvider) {
        explanation = await this.generateExplanation(
          move,
          score,
          classification,
          themes,
        );
      }

      results.push({
        ply: move.ply,
        classification,
        delta,
        themes,
        bestmove: score.evaluation.bestmove,
        depth: score.evaluation.depth,
        nodes: score.evaluation.nodes,
        pv: score.evaluation.pv,
        score: score.evaluation.score,
        timeMs: score.evaluation.timeMs,
        explanation,
      });
    }

    return results;
  }

  private async buildReport(
    moveEvaluations: MoveEvaluation[],
  ): Promise<CoachReport> {
    const keyMoments = moveEvaluations.filter(
      (move) =>
        Math.abs(move.delta) >= 200 || move.classification === "brilliant",
    );
    const summary = buildSummaryMarkdown(moveEvaluations, keyMoments);

    const accuracy = computeAccuracy(moveEvaluations);
    const stats = summariseMistakes(moveEvaluations);

    return {
      summary,
      keyMoments,
      accuracyWhite: accuracy.white,
      accuracyBlack: accuracy.black,
      blundersWhite: stats.blundersWhite,
      blundersBlack: stats.blundersBlack,
      inaccuraciesWhite: stats.inaccuraciesWhite,
      inaccuraciesBlack: stats.inaccuraciesBlack,
    };
  }

  private async generateExplanation(
    move: MoveInput,
    score: ScoredMove,
    classification: MoveQuality,
    themes: string[],
  ): Promise<CoachExplanation> {
    if (!this.llmProvider) {
      throw new Error("LLM provider not configured.");
    }

    const delta = score.scoreAfter - score.scoreBefore;
    const prompt = buildExplanationPrompt({
      move,
      delta,
      classification,
      themes,
      evaluation: score.evaluation,
    });
    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 400,
      temperature: 0.3,
    });

    try {
      const json = JSON.parse(response.output);
      return validateExplanation(json);
    } catch (error) {
      throw new Error(`Failed to parse LLM response: ${String(error)}`);
    }
  }
}

function classifyMove(
  delta: number,
  score: ScoredMove,
  ply: number,
): MoveQuality {
  const absDelta = Math.abs(delta);
  const isWhiteMove = ply % 2 === 1;
  const scoreBefore = score.scoreBefore;
  const wasWinning = isWhiteMove ? scoreBefore > 150 : scoreBefore < -150;
  const mateAfter = score.evaluation.score.mate ?? null;

  if (mateAfter && Math.abs(mateAfter) === 1) {
    return "brilliant";
  }

  if (Math.abs(scoreBefore) <= 20 && absDelta <= 20 && ply <= 20) {
    return "book";
  }

  if (delta > 80) {
    return "brilliant";
  }

  if (delta > 50) {
    return "excellent";
  }

  if (absDelta <= 50) {
    return "good";
  }

  if (absDelta <= 150) {
    return "inaccuracy";
  }

  if (absDelta <= 300) {
    return "mistake";
  }

  if (wasWinning && delta < -150) {
    return "blunder";
  }

  return "blunder";
}

function detectThemes(move: MoveInput): string[] {
  const selected: string[] = [];
  for (const theme of DEFAULT_THEMES) {
    if (move.san.toLowerCase().includes(theme.split(" ")[0])) {
      selected.push(theme);
    }
  }
  return [...new Set(selected)];
}

function buildExplanationPrompt({
  move,
  delta,
  classification,
  themes,
  evaluation,
}: {
  readonly move: MoveInput;
  readonly delta: number;
  readonly classification: MoveQuality;
  readonly themes: string[];
  readonly evaluation: EngineEvaluation;
}): string {
  return JSON.stringify(
    {
      role: "coach-explanation",
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      san: move.san,
      uci: move.uci,
      bestmove: evaluation.bestmove,
      delta,
      classification,
      depth: evaluation.depth,
      pv: evaluation.pv,
      themes,
    },
    null,
    2,
  );
}

function validateExplanation(payload: unknown): CoachExplanation {
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM response must be an object.");
  }

  const record = payload as Record<string, unknown>;

  const headline = String(record.headline ?? "");
  const whyBadOrGood = String(
    record.why_bad_or_good ?? record.whyBadOrGood ?? "",
  );
  const sourceList = (record.what_to_learn ?? record.whatToLearn) as unknown;
  const whatToLearn = Array.isArray(sourceList)
    ? sourceList.map((item: unknown) => String(item))
    : [];
  const bestLineExplained = String(
    record.best_line_explained ?? record.bestLineExplained ?? "",
  );

  return {
    headline,
    whyBadOrGood,
    whatToLearn,
    bestLineExplained,
  };
}

function computeAccuracy(moves: MoveEvaluation[]): {
  white: number;
  black: number;
} {
  let whitePenalty = 0;
  let blackPenalty = 0;

  for (const move of moves) {
    const penalty = Math.max(0, Math.abs(move.delta));
    if (move.ply % 2 === 1) {
      whitePenalty += penalty;
    } else {
      blackPenalty += penalty;
    }
  }

  const normalize = (penalty: number): number =>
    Math.max(0, 100 - penalty / 50);
  return {
    white: Number(normalize(whitePenalty).toFixed(2)),
    black: Number(normalize(blackPenalty).toFixed(2)),
  };
}

function summariseMistakes(moves: MoveEvaluation[]): {
  blundersWhite: number;
  blundersBlack: number;
  inaccuraciesWhite: number;
  inaccuraciesBlack: number;
} {
  let blundersWhite = 0;
  let blundersBlack = 0;
  let inaccuraciesWhite = 0;
  let inaccuraciesBlack = 0;

  for (const move of moves) {
    if (move.classification === "blunder") {
      if (move.ply % 2 === 1) {
        blundersWhite += 1;
      } else {
        blundersBlack += 1;
      }
    }

    if (move.classification === "inaccuracy") {
      if (move.ply % 2 === 1) {
        inaccuraciesWhite += 1;
      } else {
        inaccuraciesBlack += 1;
      }
    }
  }

  return { blundersWhite, blundersBlack, inaccuraciesWhite, inaccuraciesBlack };
}

function buildSummaryMarkdown(
  moves: MoveEvaluation[],
  keyMoments: MoveEvaluation[],
): string {
  const lines: string[] = [];
  lines.push("# Post-game report");
  lines.push("");
  lines.push(`Total moves analysed: ${moves.length}`);
  lines.push("");
  lines.push("## Key moments");
  for (const moment of keyMoments.slice(0, 5)) {
    lines.push(
      `- Ply ${moment.ply}: ${moment.classification} (Δ ${moment.delta} cp)`,
    );
  }
  lines.push("");
  lines.push("## Highlights");
  lines.push("- Maintain initiative when advantage exceeds +150 cp.");
  lines.push("- Convert winning endgames by pushing passed pawns.");
  lines.push("- Re-evaluate forcing moves every turn.");
  return lines.join("\n");
}

function convertMateScoreToCentipawns(mate: number, fallback: number): number {
  if (mate === 0) {
    return fallback;
  }
  const sign = mate > 0 ? 1 : -1;
  return sign * 10000;
}
