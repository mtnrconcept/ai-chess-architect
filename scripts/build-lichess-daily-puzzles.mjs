#!/usr/bin/env node
/**
 * Turns a vetted Lichess CC0 one-move puzzle sample into dated server-only SQL.
 * Lichess's FEN is BEFORE the opponent's first move. We apply that first move
 * with chess.js and keep ONLY the solver's response in solution_moves.
 * The output migration stays server-side; never import into src/ or public/.
 *
 * node scripts/build-lichess-daily-puzzles.mjs candidates.json output.sql 2026-11-08 365
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const [input, output, firstDate="2026-11-08", countInput="365"] = process.argv.slice(2);
if (!input || !output || !/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) {
  throw new Error("Usage: node scripts/build-lichess-daily-puzzles.mjs candidates.json out.sql YYYY-MM-DD [days]");
}
const requested = Number(countInput);
if (!Number.isSafeInteger(requested) || requested < 1 || requested > 730) {
  throw new Error("Days must be between 1 and 730.");
}
const parseUci = (uci) => {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return { from: uci.slice(0,2), to: uci.slice(2,4), ...(uci.length===5?{promotion:uci[4]}:{}) };
};
const normalized = [];
const seenPositions = new Set();
for (const raw of JSON.parse(readFileSync(input,"utf8"))) {
  if (!/^[a-zA-Z0-9]{5}$/.test(String(raw.id))) continue;
  if (!Array.isArray(raw.moves) || raw.moves.length !== 2) continue;
  const [opponent, solver] = raw.moves;
  const first = parseUci(opponent), second = parseUci(solver);
  if (!first || !second || !Number.isSafeInteger(raw.rating)) continue;
  try {
    const chess = new Chess(raw.fen);
    if (!chess.move(first)) continue;
    const solverFen = chess.fen();
    if (seenPositions.has(solverFen)) continue;
    if (!chess.move(second)) continue;
    const themes = Array.isArray(raw.themes)
      ? raw.themes.filter(item => /^[a-zA-Z0-9]{2,50}$/.test(item)).slice(0,8) : [];
    if (themes.includes("mateIn1") && !chess.isCheckmate()) continue;
    normalized.push({
      id:raw.id, fen:solverFen, response:solver.toLowerCase(), rating:raw.rating,
      themes, popularity: raw.popularity,
    });
    seenPositions.add(solverFen);
  } catch {
    continue;
  }
}
if (normalized.length < requested) {
  throw new Error(`Only ${normalized.length} legal unique one-move puzzles; requested ${requested}.`);
}
const buckets = [[], [], [], [], []];
for (const puzzle of normalized) {
  const bucket = Math.min(4, Math.max(0, Math.floor((puzzle.rating-800)/320)));
  buckets[bucket].push(puzzle);
}
for (const bucket of buckets) bucket.sort((a,b)=>
  b.popularity-a.popularity || a.rating-b.rating || a.id.localeCompare(b.id));
const selection=[];
let round=0;
while(selection.length<requested) {
  const chosen=buckets[(round*3+Math.floor(round/5))%buckets.length];
  const candidate=chosen.shift() || buckets.find(x=>x.length)?.shift();
  if(!candidate)break;
  selection.push(candidate);
  round++;
}
if(selection.length !== requested)throw new Error("Insufficient balanced puzzle sample.");
const sqlString = (text) => `'${String(text).replaceAll("'","''")}'`;
const dateStart=new Date(`${firstDate}T12:00:00.000Z`);
if(Number.isNaN(dateStart.valueOf()))throw new Error("Invalid start date.");
const values=selection.map((puzzle,i)=>{
  const day=new Date(dateStart.getTime()+i*86400000).toISOString().slice(0,10);
  const title=puzzle.themes.includes("mateIn1")
    ? "Problème du jour · Mat en un coup"
    : puzzle.themes.includes("fork")
      ? "Problème du jour · Fourchette tactique"
      : "Problème du jour · Tactique gagnante";
  const tags=puzzle.themes.map(sqlString).join(",");
  return `  (${sqlString(day)}::date,${sqlString(title)},${sqlString(puzzle.fen)},ARRAY[${sqlString(puzzle.response)}]::text[],ARRAY[${tags}]::text[],${puzzle.rating},'lichess-cc0',${sqlString(`https://lichess.org/training/${puzzle.id}`)},true)`;
});
const sql=`-- Source: Lichess Open Database, CC0 1.0 (https://database.lichess.org/#puzzles).
-- Records derived from the published Lichess combined puzzle sample.
-- Important: first opponent move applied before storing the puzzle FEN.
-- Only the solver's one-move answer is stored; the frontend never fetches this.
-- Idempotent dates: do not replace puzzles already published by administrators.
insert into public.chess_daily_puzzles
(puzzle_date,title,fen,solution_moves,themes,rating,source,source_reference,published)
values
${values.join(",\n")}
on conflict (puzzle_date) do nothing;
`;
writeFileSync(output,sql,"utf8");
const maxDate=new Date(dateStart.getTime()+(requested-1)*86400000).toISOString().slice(0,10);
console.log(`Wrote ${requested} server-only puzzles for ${firstDate}.. ${maxDate} from ${normalized.length} vetted Lichess CC0 candidates.`);
