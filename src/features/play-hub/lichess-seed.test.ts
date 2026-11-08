import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {Chess} from "chess.js";
import {describe,expect,it} from "vitest";

const sql=readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20261108144021_lichess_cc0_daily_puzzles.sql",import.meta.url)), "utf8");
const entries=[...sql.matchAll(/\('([0-9]{4}-[0-9]{2}-[0-9]{2})'::date,'[^']+','([^']+)',ARRAY\['([a-h][1-8][a-h][1-8][qrbn]?)'\]::text\[/g)]
  .map(match=>({date:match[1],fen:match[2],move:match[3]}));

describe("365 genuine open-source Lichess daily puzzles",()=>{
  it("schedules exactly one distinct puzzle each day for a year",()=>{
    expect(entries.length).toBe(365);
    expect(new Set(entries.map(row=>row.date)).size).toBe(365);
    expect(new Set(entries.map(row=>row.fen)).size).toBe(365);
    expect(entries[0].date).toBe("2026-11-08");
    expect(entries.at(-1)?.date).toBe("2027-11-07");
    expect(sql).toContain("lichess-cc0");
    expect(sql).toContain("on conflict (puzzle_date) do nothing");
  });
  it("all server-only answers are legal UCI moves from the displayed FEN",()=>{
    for(const entry of entries){
      const chess=new Chess(entry.fen);
      const move=chess.move({
        from:entry.move.slice(0,2),
        to:entry.move.slice(2,4),
        ...(entry.move.length===5?{promotion:entry.move[4]}:{}),
      });
      expect(move?.from,entry.date).toBe(entry.move.slice(0,2));
      expect(move?.to,entry.date).toBe(entry.move.slice(2,4));
    }
  });
});
