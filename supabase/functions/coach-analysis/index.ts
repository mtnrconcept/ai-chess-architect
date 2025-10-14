import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { Client } from "pg";
import Stockfish from "npm:stockfish";
import { invokeChatCompletion } from "../_shared/ai-providers.ts";

const DATABASE_URL = Deno.env.get("SUPABASE_DB_URL");
const LLM_PROVIDER = (Deno.env.get("LLM_PROVIDER") ?? "gemini").toLowerCase();

if (!DATABASE_URL) {
  console.error("SUPABASE_DB_URL is not set for coach-analysis function");
}

type Phase = "opening" | "middlegame" | "endgame";
type StockfishScore = { cp?: number; mate?: number };
type EvalOut = {
  depth: number;
  bestmove: string;
  score: StockfishScore;
  pv: string[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    if (req.method === "POST" && pathname === "/coach/ingest") {
      const body = await req.json();
      const { owner_id, pgn, moves = [], result = null } = body ?? {};

      const client = await getClient();
      try {
        const gameInsert = await client.queryObject<{ id: string }>`
          insert into public.games(owner_id, pgn, result)
          values (${owner_id}, ${pgn}, ${result})
          returning id
        `;
        const gameId = gameInsert.rows[0].id;

        for (let i = 0; i < moves.length; i++) {
          const move = moves[i];
          await client.queryArray`
            insert into public.moves(game_id, ply, san, uci, fen_before, fen_after, time_spent_ms)
            values (${gameId}, ${i + 1}, ${move.san}, ${move.uci ?? null}, ${move.fen_before}, ${move.fen_after}, ${move.time_ms ?? null})
          `;
        }

        return json({ gameId });
      } finally {
        await client.end();
      }
    }

    if (req.method === "POST" && pathname.startsWith("/coach/queue/")) {
      const gameId = pathname.split("/").pop();
      if (!gameId) return json({ error: "Missing gameId" }, 400);

      const client = await getClient();
      try {
        await client.queryArray`
          insert into public.analyses(game_id, status)
          values (${gameId}, 'queued')
          on conflict (game_id) do update set status = 'queued', updated_at = now()
        `;
      } finally {
        await client.end();
      }

      queueMicrotask(() => runAnalysis(gameId).catch((err) => console.error(err)));
      return json({ ok: true }, 202);
    }

    if (req.method === "GET" && pathname.startsWith("/coach/status/")) {
      const gameId = pathname.split("/").pop();
      if (!gameId) return json({ error: "Missing gameId" }, 400);

      const client = await getClient();
      try {
        const status = await client.queryObject`
          select status, depth, multi_pv, updated_at
          from public.analyses
          where game_id = ${gameId}
        `;
        return json(status.rows[0] ?? { status: "none" });
      } finally {
        await client.end();
      }
    }

    if (req.method === "GET" && pathname.startsWith("/coach/report/")) {
      const gameId = pathname.split("/").pop();
      if (!gameId) return json({ error: "Missing gameId" }, 400);

      const client = await getClient();
      try {
        const report = await client.queryObject`
          select * from public.coach_reports where game_id = ${gameId}
        `;
        const moves = await client.queryObject`
          select ply, score_cp, score_mate, best_uci, pv, depth, delta_ep, quality, themes, coach_json
          from public.move_evals
          where game_id = ${gameId}
          order by ply
        `;
        return json({ report: report.rows[0] ?? null, moves: moves.rows });
      } finally {
        await client.end();
      }
    }

    return new Response("Not found", { status: 404 });
  } catch (error) {
    console.error("[coach-analysis] error", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function runAnalysis(gameId: string) {
  if (!DATABASE_URL) {
    throw new Error("SUPABASE_DB_URL is not configured");
  }

  const client = new Client(DATABASE_URL);
  await client.connect();

  try {
    await client.queryArray`
      update public.analyses set status = 'running', updated_at = now()
      where game_id = ${gameId}
    `;

    const moves = await client.queryObject<
      { ply: number; san: string; uci: string | null; fen_before: string; fen_after: string }
    >`
      select ply, san, uci, fen_before, fen_after
      from public.moves
      where game_id = ${gameId}
      order by ply
    `;

    const depth = 20;
    const multiPV = 3;
    const deltas: number[] = [];
    const keyMoments: Array<{ ply: number; delta_ep: number; label: string; best: string }> = [];

    for (const move of moves.rows) {
      const phase: Phase = move.ply < 14 ? "opening" : move.ply > 60 ? "endgame" : "middlegame";

      const before = await evaluatePosition(move.fen_before, depth, multiPV);
      const after = await evaluatePosition(move.fen_after, depth, multiPV);

      const epBefore = winProb(before.score, phase);
      const epAfter = winProb(after.score, phase);
      const delta = epAfter - epBefore;
      deltas.push(delta);

      const quality = classify(delta, {
        phase,
        elo: 1400,
        sacrifice: false,
        uniqueSave: false,
        alreadyWinning: epBefore > 0.85,
      });
      const themes = themesHeuristic(before, after);
      const coachDetails = await explainMoveWithLLM({
        fen_before: move.fen_before,
        move_san: move.san,
        move_uci: move.uci ?? "",
        best_uci: before.bestmove,
        delta_ep: round(delta, 3),
        pv_top1: before.pv,
        phase,
        themes,
        elo_bucket: "club",
        provider: LLM_PROVIDER,
      });
      const themesPgArray = toTextArray(themes);

      await client.queryArray`
        insert into public.move_evals(
          game_id, ply, score_cp, score_mate, best_uci, pv, depth, delta_ep, quality, themes, coach_json
        )
        values (
          ${gameId}, ${move.ply},
          ${before.score.cp ?? null}, ${before.score.mate ?? null},
          ${before.bestmove}, ${JSON.stringify(before.pv)}::jsonb,
          ${before.depth}, ${delta}, ${quality}, ${themesPgArray}::text[], ${JSON.stringify(coachDetails)}::jsonb
        )
      `;

      if (Math.abs(delta) >= 0.2) {
        keyMoments.push({
          ply: move.ply,
          delta_ep: round(delta, 2),
          label: quality,
          best: before.bestmove,
        });
      }
    }

    const accWhite = accuracy(deltas.filter((_, idx) => idx % 2 === 0));
    const accBlack = accuracy(deltas.filter((_, idx) => idx % 2 === 1));
    const summary = `Précision estimée: Blancs ${accWhite}% / Noirs ${accBlack}%.
Moments clés: ${keyMoments
      .slice(0, 3)
      .map((k) => `coup ${k.ply} (${k.label} ${k.delta_ep})`)
      .join(", ")}`;

    await client.queryArray`
      insert into public.coach_reports(game_id, accuracy_white, accuracy_black, key_moments, summary_md)
      values (${gameId}, ${accWhite}, ${accBlack}, ${JSON.stringify(keyMoments.slice(0, 5))}, ${summary})
      on conflict (game_id)
      do update set accuracy_white = excluded.accuracy_white,
        accuracy_black = excluded.accuracy_black,
        key_moments = excluded.key_moments,
        summary_md = excluded.summary_md
    `;

    await client.queryArray`
      update public.analyses
      set status = 'done', depth = ${depth}, multi_pv = ${multiPV}, provider = ${LLM_PROVIDER}, updated_at = now()
      where game_id = ${gameId}
    `;
  } catch (error) {
    await client.queryArray`
      update public.analyses
      set status = 'error', updated_at = now()
      where game_id = ${gameId}
    `;
    throw error;
  } finally {
    await client.end();
  }
}

async function getClient() {
  if (!DATABASE_URL) {
    throw new Error("SUPABASE_DB_URL is not configured");
  }
  const client = new Client(DATABASE_URL);
  await client.connect();
  return client;
}

/**
 * Stockfish bridge --------------------------------------------------------
 */

class StockfishController {
  private readonly workerPromise: Promise<any>;
  private readonly listeners = new Set<(line: string) => void>();
  private bound = false;
  private ready = false;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.workerPromise = Stockfish();
  }

  private async getWorker() {
    const worker = await this.workerPromise;
    if (!this.bound) {
      worker.onmessage = (event: MessageEvent<string> | string) => {
        const line = typeof event === "string" ? event : String(event?.data ?? "");
        if (!line) return;
        for (const listener of this.listeners) listener(line);
      };
      this.bound = true;
    }
    return worker;
  }

  private addListener(listener: (line: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async waitFor(predicate: (line: string) => boolean, timeoutMs = 5000) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Stockfish response timeout"));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        remove();
      };

      const remove = this.addListener((line) => {
        if (predicate(line)) {
          cleanup();
          resolve();
        }
      });
    });
  }

  private async ensureReady() {
    if (this.ready) return;
    const worker = await this.getWorker();
    worker.postMessage("uci");
    await this.waitFor((line) => line === "uciok", 8000);
    worker.postMessage("setoption name Threads value 4");
    worker.postMessage("setoption name Hash value 96");
    worker.postMessage("isready");
    await this.waitFor((line) => line === "readyok", 8000);
    this.ready = true;
  }

  private async awaitIdle() {
    const worker = await this.getWorker();
    worker.postMessage("isready");
    await this.waitFor((line) => line === "readyok", 5000);
  }

  private async evaluateInternal(fen: string, depth: number, multiPV: number): Promise<EvalOut> {
    await this.ensureReady();
    const worker = await this.getWorker();

    await this.awaitIdle();
    worker.postMessage("stop");
    await delay(16);
    worker.postMessage("ucinewgame");
    worker.postMessage(`setoption name MultiPV value ${multiPV}`);
    worker.postMessage(`position fen ${fen}`);

    return new Promise<EvalOut>((resolve, reject) => {
      let resolved = false;
      let currentDepth = 0;
      let score: StockfishScore = { cp: 0 };
      let pv: string[] = [];
      let bestmove = "";

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Stockfish evaluation timeout"));
      }, Math.max(8000, depth * 500));

      const cleanup = () => {
        clearTimeout(timeout);
        removeListener();
      };

      const removeListener = this.addListener((line) => {
        if (line.startsWith("info") && line.includes(" multipv 1")) {
          const depthMatch = line.match(/ depth (\d+)/);
          if (depthMatch) {
            currentDepth = Number.parseInt(depthMatch[1], 10);
          }
          const mateMatch = line.match(/ score mate (-?\d+)/);
          const cpMatch = line.match(/ score cp (-?\d+)/);
          if (mateMatch) {
            score = { mate: Number.parseInt(mateMatch[1], 10) };
          } else if (cpMatch) {
            score = { cp: Number.parseInt(cpMatch[1], 10) };
          }
          const pvMatch = line.match(/ pv (.+)$/);
          if (pvMatch) {
            pv = pvMatch[1].trim().split(/\s+/);
          }
        }

        if (line.startsWith("bestmove")) {
          if (!resolved) {
            resolved = true;
            const parts = line.split(" ");
            bestmove = parts[1] ?? "";
            cleanup();
            resolve({
              depth: currentDepth,
              bestmove,
              score,
              pv,
            });
          }
        }
      });

      worker.postMessage(`go depth ${depth}`);
    });
  }

  public async evaluate(fen: string, depth: number, multiPV: number): Promise<EvalOut> {
    const task = this.queue.then(() => this.evaluateInternal(fen, depth, multiPV));
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }
}

const engineController = new StockfishController();

async function evaluatePosition(fen: string, depth: number, multiPV: number): Promise<EvalOut> {
  try {
    return await engineController.evaluate(fen, depth, multiPV);
  } catch (error) {
    console.error("[coach-analysis] Stockfish failure", error);
    return {
      depth,
      bestmove: "",
      score: { cp: 0 },
      pv: [],
    };
  }
}

/**
 * Heuristics & helpers ----------------------------------------------------
 */

function winProb(score: StockfishScore, phase: Phase) {
  if (score.mate !== undefined) {
    return score.mate > 0 ? 0.99 : 0.01;
  }
  const scale = phase === "endgame" ? 150 : 200;
  const cp = score.cp ?? 0;
  return 1 / (1 + Math.exp(-cp / scale));
}

function classify(
  delta: number,
  context: {
    phase: Phase;
    elo?: number;
    sacrifice?: boolean;
    uniqueSave?: boolean;
    alreadyWinning?: boolean;
  },
) {
  const noviceTol = context.elo && context.elo < 1200 ? 0.01 : 0;
  if (context.uniqueSave && delta > 0) return "great";
  if (context.sacrifice && delta >= -0.01 && !context.alreadyWinning) return "brilliant";
  if (delta >= -0.005 - noviceTol) return "best";
  if (delta >= -0.02 - noviceTol) return "excellent";
  if (delta >= -0.05) return "good";
  if (delta >= -0.1) return "inaccuracy";
  if (delta >= -0.2) return "mistake";
  return "blunder";
}

function themesHeuristic(_before: EvalOut, after: EvalOut) {
  const themes: string[] = [];
  if (after.score.mate !== undefined && after.score.mate > 0) {
    themes.push("mate_threat");
  }
  if ((after.score.cp ?? 0) < -200) {
    themes.push("material_loss");
  }
  return themes.length ? themes : ["general"];
}

function accuracy(deltas: number[]) {
  const penalty = deltas.reduce((acc, d) => acc + Math.max(0, -d), 0);
  const value = Math.max(0, 100 - Math.min(1, penalty) * 100);
  return Math.round(value * 10) / 10;
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toTextArray(values: string[]) {
  if (values.length === 0) return "{}";
  return `{${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")}}`;
}

const fallbackCoachPayload = {
  headline: "Bon coup, mais une meilleure option existait",
  why_bad_or_good: "Tu conserves l'équilibre mais la ligne optimale te donnait plus d'activité.",
  what_to_learn: [
    "Toujours vérifier les pièces non protégées",
    "Chercher le coup actif le plus simple",
  ],
  best_line_explained:
    "La variante suggérée améliore la coordination des pièces et crée une menace directe.",
} as const;

type CoachPayload = typeof fallbackCoachPayload;

type ExplainMoveInput = {
  fen_before: string;
  move_san: string;
  move_uci: string;
  best_uci?: string;
  delta_ep: number;
  pv_top1?: string[];
  phase: Phase;
  themes?: string[];
  elo_bucket?: "novice" | "club" | "master";
  provider: string;
};

async function explainMoveWithLLM(input: ExplainMoveInput): Promise<CoachPayload> {
  try {
    const { content } = await invokeChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Tu es un coach d'échecs francophone. Analyse la position et fournis une explication pédagogique concise. Réponds STRICTEMENT en JSON suivant le schéma {headline, why_bad_or_good, what_to_learn[], best_line_explained}. Limite chaque champ texte à deux phrases courtes maximum.",
        },
        {
          role: "user",
          content: JSON.stringify({
            move: {
              san: input.move_san,
              uci: input.move_uci,
              best: input.best_uci,
            },
            delta_ep: input.delta_ep,
            pv_top1: input.pv_top1,
            phase: input.phase,
            themes: input.themes,
            fen_before: input.fen_before,
            elo_bucket: input.elo_bucket,
            provider: input.provider,
          }),
        },
      ],
      temperature: 0.6,
      maxOutputTokens: 400,
    });

    const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (
      typeof parsed?.headline === "string" &&
      typeof parsed?.why_bad_or_good === "string" &&
      Array.isArray(parsed?.what_to_learn) &&
      typeof parsed?.best_line_explained === "string"
    ) {
      return parsed as CoachPayload;
    }
  } catch (error) {
    console.error("[coach-analysis] explainMoveWithLLM failed", error);
  }

  return { ...fallbackCoachPayload };
}
