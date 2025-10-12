import { Router } from 'express';
import { IngestBody } from './schema.js';
import { Pool } from 'pg';

export function buildRoutes(db: Pool) {
  const r = Router();

  r.post('/coach/games/ingest', async (req, res) => {
    const body = IngestBody.parse(req.body);
    const client = await db.connect();
    try {
      const g = await client.query(
        'insert into public.games(owner_id,pgn,source) values($1,$2,$3) returning id',
        [body.owner_id, body.pgn ?? null, body.source ?? 'api']
      );
      const gameId = g.rows[0].id;
      if (body.moves?.length) {
        const inserts = body.moves.map((m, idx) =>
          client.query(
            'insert into public.moves(game_id,ply,san,uci,fen_before,fen_after,time_spent_ms) values($1,$2,$3,$4,$5,$6,$7)',
            [gameId, idx + 1, m.san, m.uci ?? null, m.fen_before, m.fen_after, m.time_ms ?? null]
          )
        );
        await Promise.all(inserts);
      }
      res.json({ gameId });
    } finally {
      client.release();
    }
  });

  r.post('/coach/analyses/:gameId/queue', async (req, res) => {
    const { gameId } = req.params;
    await db.query(
      'insert into public.analyses(game_id,status) values($1,$2) on conflict (game_id) do update set status=$2, updated_at=now()',
      [gameId, 'queued']
    );
    res.status(202).json({ ok: true });
  });

  r.get('/coach/analyses/:gameId/status', async (req, res) => {
    const q = await db.query('select status, depth, multi_pv, updated_at from public.analyses where game_id=$1', [
      req.params.gameId
    ]);
    res.json(q.rows[0] ?? { status: 'none' });
  });

  r.get('/coach/analyses/:gameId/report', async (req, res) => {
    const { gameId } = req.params;
    const rep = await db.query('select * from public.coach_reports where game_id=$1', [gameId]);
    const moves = await db.query(
      'select ply,score_cp,score_mate,best_uci,pv,depth,delta_ep,quality,themes,coach_json from public.move_evals where game_id=$1 order by ply',
      [gameId]
    );
    res.json({ report: rep.rows[0] ?? null, moves: moves.rows });
  });

  return r;
}
