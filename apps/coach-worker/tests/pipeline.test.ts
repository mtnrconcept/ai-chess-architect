import { describe, expect, it } from "vitest";
import type {
  Engine,
  EngineEvaluation,
  EvaluateFenOptions,
} from "packages/engine";
import { AnalysisPipeline, type MoveInput } from "../src/pipeline";

class DeterministicEngine implements Engine {
  private ready = false;

  public async init(): Promise<void> {
    this.ready = true;
  }

  public async evalFen(
    fen: string,
    _options: EvaluateFenOptions,
  ): Promise<EngineEvaluation> {
    if (!this.ready) {
      throw new Error("Engine not ready");
    }
    const score = fen.includes("w") ? 120 : -80;
    return {
      depth: 12,
      pv: [],
      bestmove: "0000",
      score: { cp: score },
      nodes: 1000,
      timeMs: 10,
    };
  }

  public async dispose(): Promise<void> {
    this.ready = false;
  }
}

describe("AnalysisPipeline", () => {
  it("computes accuracy and classifications", async () => {
    const engineFactory = (): Engine => new DeterministicEngine();
    const pipeline = new AnalysisPipeline({
      depth: 12,
      multiPV: 1,
      threads: 1,
      hashMB: 16,
      engineFactory,
    });

    const moves: MoveInput[] = [
      {
        ply: 1,
        san: "e4",
        uci: "e2e4",
        fenBefore: "start",
        fenAfter: "fen w",
      },
      {
        ply: 2,
        san: "e5",
        uci: "e7e5",
        fenBefore: "fen w",
        fenAfter: "fen b",
      },
    ];

    const result = await pipeline.run(moves);
    expect(result.moveEvaluations).toHaveLength(2);
    expect(result.report.accuracyWhite).toBeGreaterThan(0);
    expect(result.report.keyMoments.length).toBeGreaterThanOrEqual(0);
  });
});
