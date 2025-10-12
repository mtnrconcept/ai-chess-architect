export function evalQuick(fen: string): Promise<{ best: string }> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./stockfish.wasm.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<any>) => {
      if (event.data?.type === "done") {
        resolve({ best: event.data.best });
        worker.terminate();
      }
    };

    worker.postMessage({ fen, depth: 12 });
  });
}
