#!/usr/bin/env python3
"""Read the public Lichess CC0 ndjson archive and emit ONLY puzzle attributes.
The original combined game data (large and unnecessary) is never retained.
Run: python scripts/prepare_lichess_candidates.py path/to/first_50k.ndjson.bz2 output.json
"""
import bz2
import json
import pathlib
import sys

def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: prepare_lichess_candidates.py INPUT.ndjson.bz2 OUTPUT.json")
    source, output = map(pathlib.Path, sys.argv[1:])
    selected = []
    with bz2.open(source, "rt", encoding="utf-8") as reader:
        for line in reader:
            if not line.strip():
                continue
            try:
                record = json.loads(line)["puzzle"]
                moves = record["Moves"].split()
                rating = int(record["Rating"])
                popularity = int(record["Popularity"])
                deviation = int(record["RatingDeviation"])
                plays = int(record["NbPlays"])
                themes = record.get("Themes", "").split()
            except (KeyError, ValueError, TypeError, json.JSONDecodeError):
                continue
            # Existing server puzzle UX currently accepts just one solver move.
            if len(moves) != 2 or "oneMove" not in themes:
                continue
            if not (820 <= rating <= 2350 and popularity >= 77 and deviation <= 180 and plays >= 35):
                continue
            selected.append({
                "id": record["PuzzleId"],
                "fen": record["FEN"],
                "moves": moves,
                "themes": themes,
                "rating": rating,
                "popularity": popularity,
                "plays": plays,
            })
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(selected, ensure_ascii=False), encoding="utf-8")
    print(f"Filtered {len(selected)} published Lichess CC0 one-move puzzles; output {output}")

if __name__ == "__main__":
    main()
