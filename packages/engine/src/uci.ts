import type {
  Engine,
  EngineEvaluation,
  EngineInitOptions,
  EvaluateFenOptions,
} from "./stockfishWasm";

// The stockfish package exposes a default factory that resolves to a WebWorker-like
// interface in Node and browsers. Typings are not provided so we rely on the runtime shape.
import StockfishFactory from "stockfish";

const performanceNow = (): number => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export type EngineOptions = EngineInitOptions;

export type EvaluationResult = EngineEvaluation;

type StockfishFactoryResult = Awaited<ReturnType<typeof StockfishFactory>>;

type Listener = (message: string) => void;

type StockfishInstance = StockfishFactoryResult & {
  postMessage(message: string): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  addMessageListener?(listener: Listener): void;
  removeMessageListener?(listener: Listener): void;
};

export class UciEngine implements Engine {
  private stockfish: StockfishInstance | null = null;
  private ready = false;

  public async init(options: EngineOptions = {}): Promise<void> {
    if (this.ready) {
      return;
    }

    this.stockfish = (await StockfishFactory()) as StockfishInstance;
    await this.sendCommand("uci");

    if (options.threads) {
      await this.sendCommand(`setoption name Threads value ${options.threads}`);
    }

    if (options.hashMB) {
      await this.sendCommand(`setoption name Hash value ${options.hashMB}`);
    }

    await this.sendCommand("isready");
    this.ready = true;
  }

  public async evalFen(
    fen: string,
    options: EvaluateFenOptions,
  ): Promise<EvaluationResult> {
    if (!this.ready || !this.stockfish) {
      await this.init();
    }

    if (!this.stockfish) {
      throw new Error("Stockfish instance unavailable.");
    }

    const start = performanceNow();

    return new Promise<EvaluationResult>((resolve, reject) => {
      let depth = 0;
      let bestmove = "";
      let pv: string[] = [];
      let score: { cp?: number; mate?: number } = {};

      const timeout = setTimeout(
        () => {
          detach();
          reject(new Error("Engine evaluation timed out."));
        },
        Math.max(5000, options.depth * 250),
      );

      const onMessage: Listener = (raw) => {
        const line = typeof raw === "string" ? raw : "";
        if (!line) {
          return;
        }

        if (line.startsWith("info")) {
          const depthMatch = line.match(/ depth (\d+)/);
          if (depthMatch) {
            depth = Number.parseInt(depthMatch[1], 10);
          }

          const mateMatch = line.match(/ score mate (-?\d+)/);
          const cpMatch = line.match(/ score cp (-?\d+)/);
          if (mateMatch) {
            score = { mate: Number.parseInt(mateMatch[1], 10) };
          } else if (cpMatch) {
            score = { cp: Number.parseInt(cpMatch[1], 10) };
          }

          const pvMatch = line.match(/ pv (.+)$/);
          if (pvMatch) {
            pv = pvMatch[1].trim().split(/\s+/);
          }
        }

        if (line.startsWith("bestmove")) {
          const [, move = "0000"] = line.split(/\s+/);
          bestmove = move;
          detach();
          resolve({
            depth,
            bestmove,
            pv,
            score,
            nodes: 0,
            timeMs: Math.round(performanceNow() - start),
          });
        }
      };

      const detach = () => {
        clearTimeout(timeout);
        if (this.stockfish) {
          this.stockfish.removeMessageListener?.(onMessage);
          this.stockfish.onmessage = null;
        }
      };

      if (typeof this.stockfish.addMessageListener === "function") {
        this.stockfish.addMessageListener(onMessage);
      } else {
        this.stockfish.onmessage = (event: MessageEvent<string>) =>
          onMessage(event.data);
      }

      this.sendCommand("ucinewgame").catch(reject);
      this.sendCommand(`position fen ${fen}`).catch(reject);
      this.sendCommand(`setoption name MultiPV value ${options.multiPV}`).catch(
        reject,
      );
      this.sendCommand(`go depth ${options.depth}`).catch(reject);
    });
  }

  public async dispose(): Promise<void> {
    if (!this.stockfish) {
      return;
    }

    try {
      await this.sendCommand("quit");
    } finally {
      this.stockfish = null;
      this.ready = false;
    }
  }

  private async sendCommand(command: string): Promise<void> {
    if (!this.stockfish) {
      throw new Error("Stockfish instance not initialised.");
    }

    return new Promise((resolve) => {
      this.stockfish?.postMessage(command);
      setTimeout(resolve, 10);
    });
  }
}
