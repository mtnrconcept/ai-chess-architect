import { UciEngine } from '@packages/engine';
import { winProbFromScore, classify, accuracyFromDeltas, Phase } from '@packages/classifier';
import { explainMove } from '@packages/llm';
import { Pool } from 'pg';

export async function runAnalysis(db: Pool, gameId: string, opts: { depth: number; multiPV: number }) {
  const eng = new UciEngine();
  await eng.init({ threads: opts.depth >= 20 ? 4 : 2, hashMB: 64 });

  await db.query('update public.analyses set status=$2, updated_at=now() where game_id=$1', [gameId, 'running']);
  const moves = await db.query(
    'select ply,san,fen_before,fen_after from public.moves where game_id=$1 order by ply',
    [gameId]
  );

  const deltas: number[] = [];
  const keyMoments: any[] = [];

  for (const m of moves.rows) {
    const phase: Phase = m.ply < 14 ? 'opening' : m.ply > 60 ? 'endgame' : 'middlegame';
    const beforeEval = await eng.evalFen(m.fen_before, opts.depth, opts.multiPV);
    const afterEval = await eng.evalFen(m.fen_after, opts.depth, opts.multiPV);

    const epBefore = winProbFromScore(beforeEval.score, phase);
    const epAfter = winProbFromScore(afterEval.score, phase);
    const deltaEP = epAfter - epBefore;
    deltas.push(deltaEP);

    const quality = classify(deltaEP, {
      phase,
      elo: 1400,
      sacrifice: false,
      uniqueSave: false,
      alreadyWinning: epBefore > 0.85
    });
    const themes = themeHeuristics(beforeEval, afterEval);
    const coachJson = await explainMove({
      fen_before: m.fen_before,
      move_san: m.san,
      move_uci: '',
      best_uci: beforeEval.bestmove,
      delta_ep: Number(deltaEP.toFixed(3)),
      pv_top1: beforeEval.pv,
      phase,
      themes,
      elo_bucket: 'club'
    });

    await db.query(
      `insert into public.move_evals(game_id,ply,score_cp,score_mate,best_uci,pv,depth,delta_ep,quality,themes,coach_json)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        gameId,
        m.ply,
        beforeEval.score.cp ?? null,
        beforeEval.score.mate ?? null,
        beforeEval.bestmove,
        JSON.stringify(beforeEval.pv),
        beforeEval.depth,
        deltaEP,
        quality,
        themes,
        JSON.stringify(coachJson)
      ]
    );

    if (Math.abs(deltaEP) >= 0.2) {
      keyMoments.push({
        ply: m.ply,
        delta_ep: Number(deltaEP.toFixed(2)),
        label: quality,
        best: beforeEval.bestmove
      });
    }
  }

  const accWhite = Number(accuracyFromDeltas(deltas.filter((_, i) => i % 2 === 0)).toFixed(1));
  const accBlack = Number(accuracyFromDeltas(deltas.filter((_, i) => i % 2 === 1)).toFixed(1));

  const summary = `Partie analysée. Précision estimée: Blancs ${accWhite} / Noirs ${accBlack}.
Moments clés: ${keyMoments
    .slice(0, 3)
    .map((k) => `ply ${k.ply} (${k.label} ${k.delta_ep})`)
    .join(', ')}`;

  await db.query(
    `insert into public.coach_reports(game_id,accuracy_white,accuracy_black,key_moments,summary_md)
     values($1,$2,$3,$4,$5)
     on conflict (game_id) do update set accuracy_white=$2, accuracy_black=$3, key_moments=$4, summary_md=$5`,
    [gameId, accWhite, accBlack, JSON.stringify(keyMoments.slice(0, 5)), summary]
  );

  await db.query('update public.analyses set status=$2, updated_at=now() where game_id=$1', [gameId, 'done']);
}

function themeHeuristics(before: any, after: any): string[] {
  const t: string[] = [];
  if ((before.score.cp ?? 0) - (after.score.cp ?? 0) > 150) t.push('lost_material');
  if (before.score.mate !== undefined && after.score.mate === undefined) t.push('missed_mate');
  return t.length ? t : ['general'];
}
