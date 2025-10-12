import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Client } from "pg";

const DATABASE_URL = Deno.env.get("SUPABASE_DB_URL");
const LLM_PROVIDER = (Deno.env.get("LLM_PROVIDER") ?? "gemini").toLowerCase();

if (!DATABASE_URL) {
  console.error("SUPABASE_DB_URL is not set for coach-analysis function");
}

type Phase = "opening" | "middlegame" | "endgame";
type EvalOut = {
  depth: number;
  bestmove: string;
  score: { cp?: number; mate?: number };
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
      { ply: number; san: string; fen_before: string; fen_after: string }
    >`
      select ply, san, fen_before, fen_after
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

      const before = await evalFen(move.fen_before, depth, multiPV);
      const after = await evalFen(move.fen_after, depth, multiPV);

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
      const coachDetails = await explainLLM({
        fen_before: move.fen_before,
        move_san: move.san,
        move_uci: "",
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

async function evalFen(fen: string, depth: number, multiPV: number): Promise<EvalOut> {
  // TODO: Replace with actual Stockfish WASM invocation; stub for scaffold.
  return {
    depth,
    bestmove: "e2e4",
    score: { cp: 0 },
    pv: ["e2e4", "e7e5", "g1f3"],
  };
}

function winProb(score: { cp?: number; mate?: number }, phase: Phase) {
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

function themesHeuristic(_before: EvalOut, _after: EvalOut) {
  return ["general"];
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

type CoachPayload = {
  headline: string;
  why_bad_or_good: string;
  what_to_learn: string[];
  best_line_explained: string;
};

async function explainLLM(_payload: unknown): Promise<CoachPayload> {
  // TODO: Call Lovable / Groq / Gemini provider through existing gateway.
  return {
    headline: "Bon coup, mais une meilleure option existait",
    why_bad_or_good: "Tu conserves l'équilibre mais la ligne optimale te donnait plus d'activité.",
    what_to_learn: [
      "Toujours vérifier les pièces non protégées",
      "Chercher le coup actif le plus simple",
    ],
    best_line_explained:
      "La variante suggérée améliore la coordination des pièces et crée une menace directe.",
  };
}
