import { Pool } from 'pg';
import { runAnalysis } from './pipeline.js';
import { WENV } from './env.js';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function tick() {
  const q = await db.query("select game_id from public.analyses where status='queued' order by created_at limit 1");
  if (q.rowCount) {
    const gameId = q.rows[0].game_id;
    try {
      await runAnalysis(db, gameId, { depth: WENV.ENGINE_DEPTH, multiPV: WENV.ENGINE_MULTIPV });
    } catch (e) {
      console.error(e);
      await db.query("update public.analyses set status='error', updated_at=now() where game_id=$1", [gameId]);
    }
  }
}

setInterval(tick, 1500);
console.log('coach-worker ready');
