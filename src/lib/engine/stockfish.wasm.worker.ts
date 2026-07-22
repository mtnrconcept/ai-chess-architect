// Stockfish worker disabled for compatibility
// import StockfishFactory from "stockfish";

const STOCKFISH_UNAVAILABLE = "Stockfish engine not available";

self.onmessage = async (
  event: MessageEvent<{ fen: string; depth?: number }>,
) => {
  const { fen, depth = 12 } = event.data;
  // Keep the worker protocol deterministic while the WASM factory is disabled:
  // callers receive a terminal error instead of a null dereference.
  self.postMessage({
    type: "error",
    message: STOCKFISH_UNAVAILABLE,
    fen,
    depth,
  });
};
