// Stockfish worker disabled for compatibility
// import StockfishFactory from "stockfish";

let engine: any = null;

async function ensureEngine() {
  if (!engine) {
    // Stockfish disabled for compatibility
    // engine = await StockfishFactory();
    console.warn('Stockfish engine not available');
    return null;
  }
  return engine;
}

self.onmessage = async (event: MessageEvent<{ fen: string; depth?: number }>) => {
  const { fen, depth = 12 } = event.data;
  const sf = await ensureEngine();

  sf.onmessage = (message: MessageEvent<string>) => {
    const data = String((message as unknown as { data: string }).data ?? message);
    if (data.startsWith("bestmove")) {
      const best = data.split(" ")[1] ?? "";
      self.postMessage({ type: "done", best });
    }
    if (data.includes(" score ")) {
      self.postMessage({ type: "info", line: data });
    }
  };

  sf.postMessage("ucinewgame");
  sf.postMessage(`position fen ${fen}`);
  sf.postMessage(`go depth ${depth}`);
};
