/*
 * Stockfish WASM bridge used by the coaching pipeline.
 *
 * The implementation is split into two layers:
 *  - a thin UCI controller capable of driving a Stockfish Web Worker;
 *  - a deterministic heuristic fallback that keeps the rest of the codebase
 *    testable when the real WASM binary is not available (e.g. CI).
 *
 * Consumers can provide a custom factory that returns a Stockfish-compatible
 * worker (for instance created via `@stockfish/wasm`). When the factory is not
 * supplied the fallback heuristic is used, which favours quick unit tests.
 */

export interface EngineEvaluation {
  readonly depth: number;
  readonly pv: string[];
  readonly bestmove: string;
  readonly score: { cp?: number; mate?: number };
  readonly nodes: number;
  readonly timeMs: number;
}

export interface EvaluateFenOptions {
  readonly depth: number;
  readonly multiPV: number;
}

export interface EngineInitOptions {
  readonly threads: number;
  readonly hashMB: number;
}

export interface Engine {
  init(options: EngineInitOptions): Promise<void>;
  evalFen(fen: string, options: EvaluateFenOptions): Promise<EngineEvaluation>;
  dispose(): Promise<void>;
}

type MessageListener = (message: string) => void;

interface StockfishLike {
  postMessage(message: string): void;
  addMessageListener(listener: MessageListener): void;
  removeMessageListener(listener: MessageListener): void;
  terminate(): void;
}

export type StockfishFactory = () => Promise<StockfishLike>;

const STOCKFISH_READY_REGEX = /uciok|readyok/;
const INFO_REGEX = /^info .*/;
const BESTMOVE_REGEX = /^bestmove (\S+)/;

export class StockfishWasmEngine implements Engine {
  private readonly factory?: StockfishFactory;
  private instance: StockfishLike | null = null;
  private ready = false;

  public constructor(factory?: StockfishFactory) {
    this.factory = factory;
  }

  public async init(options: EngineInitOptions): Promise<void> {
    if (!this.factory) {
      // The heuristic fallback does not require initialization.
      this.ready = true;
      return;
    }

    this.instance = await this.factory();
    await this.runUciHandshake(options);
  }

  public async evalFen(fen: string, options: EvaluateFenOptions): Promise<EngineEvaluation> {
    if (!this.factory) {
      return heuristicEvaluateFen(fen, options);
    }

    if (!this.instance || !this.ready) {
      throw new Error('Stockfish engine not ready. Call init() before evalFen().');
    }

    return this.queryStockfish(fen, options);
  }

  public async dispose(): Promise<void> {
    if (this.instance) {
      this.instance.terminate();
    }
    this.instance = null;
    this.ready = false;
  }

  private async runUciHandshake(options: EngineInitOptions): Promise<void> {
    if (!this.instance) {
      throw new Error('Cannot run handshake without a Stockfish instance.');
    }

    await new Promise<void>((resolve, reject) => {
      const instance = this.instance as StockfishLike;
      const onMessage = (message: string): void => {
        if (STOCKFISH_READY_REGEX.test(message)) {
          instance.removeMessageListener(onMessage);
          this.ready = true;
          resolve();
        }
      };

      const timer = setTimeout(() => {
        instance.removeMessageListener(onMessage);
        reject(new Error('Timed out while waiting for Stockfish to become ready.'));
      }, 5000);

      const initialListener = (message: string): void => {
        if (STOCKFISH_READY_REGEX.test(message)) {
          clearTimeout(timer);
          instance.removeMessageListener(initialListener);
          this.ready = true;
          resolve();
        }
      };

      instance.addMessageListener(initialListener);
      instance.postMessage('uci');
      instance.postMessage(`setoption name Threads value ${options.threads}`);
      instance.postMessage(`setoption name Hash value ${options.hashMB}`);
      instance.postMessage('setoption name Use NNUE value true');
      instance.postMessage('isready');
    });
  }

  private async queryStockfish(fen: string, options: EvaluateFenOptions): Promise<EngineEvaluation> {
    if (!this.instance) {
      throw new Error('Stockfish instance not initialized.');
    }

    const instance = this.instance;

    return new Promise<EngineEvaluation>((resolve, reject) => {
      const infoLines: string[] = [];
      let bestMove: string | null = null;
      let evaluation: EngineEvaluation | null = null;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Stockfish evaluation timed out.'));
      }, Math.max(5000, options.depth * 500));

      const listener = (message: string): void => {
        if (INFO_REGEX.test(message)) {
          infoLines.push(message);
        }
        const bestMatch = message.match(BESTMOVE_REGEX);
        if (bestMatch) {
          bestMove = bestMatch[1];
          evaluation = parseEvaluation(infoLines, bestMove ?? '0000', options.multiPV);
          cleanup();
          resolve(evaluation);
        }
      };

      const cleanup = (): void => {
        clearTimeout(timeout);
        instance.removeMessageListener(listener);
      };

      instance.addMessageListener(listener);
      instance.postMessage('stop');
      instance.postMessage(`position fen ${fen}`);
      instance.postMessage(`setoption name MultiPV value ${options.multiPV}`);
      instance.postMessage(`go depth ${options.depth}`);
    });
  }
}

function parseEvaluation(infoLines: string[], bestmove: string, multiPV: number): EngineEvaluation {
  const latest = infoLines.reverse().find((line) => line.includes(' pv '));
  if (!latest) {
    return {
      depth: 0,
      pv: [],
      bestmove,
      score: { cp: 0 },
      nodes: 0,
      timeMs: 0,
    };
  }

  const tokens = latest.split(/\s+/);
  const depthIndex = tokens.indexOf('depth');
  const scoreIndex = tokens.indexOf('score');
  const pvIndex = tokens.indexOf('pv');
  const nodesIndex = tokens.indexOf('nodes');
  const timeIndex = tokens.indexOf('time');

  const depth = depthIndex >= 0 ? Number(tokens[depthIndex + 1]) : 0;
  let score: { cp?: number; mate?: number } = { cp: 0 };
  if (scoreIndex >= 0) {
    const type = tokens[scoreIndex + 1];
    const value = Number(tokens[scoreIndex + 2]);
    score = type === 'cp' ? { cp: value } : { mate: value };
  }
  const pv = pvIndex >= 0 ? tokens.slice(pvIndex + 1, pvIndex + 1 + multiPV) : [];
  const nodes = nodesIndex >= 0 ? Number(tokens[nodesIndex + 1]) : 0;
  const time = timeIndex >= 0 ? Number(tokens[timeIndex + 1]) : 0;

  return {
    depth,
    pv,
    bestmove,
    score,
    nodes,
    timeMs: time,
    // Add selDepth to pv for debugging purposes
  } satisfies EngineEvaluation;
}

/**
 * Heuristic fallback -------------------------------------------------------
 */

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

function heuristicEvaluateFen(fen: string, options: EvaluateFenOptions): EngineEvaluation {
  const [position] = fen.split(' ');
  const score = position
    .split('/')
    .flatMap((rank) => expandFenRank(rank))
    .reduce((acc, square) => acc + evaluateSquare(square), 0);

  const cp = Math.max(-900, Math.min(900, score));
  return {
    depth: options.depth,
    pv: [],
    bestmove: '0000',
    score: { cp },
    nodes: 0,
    timeMs: 0,
  };
}

function expandFenRank(rank: string): string[] {
  const squares: string[] = [];
  for (const char of rank) {
    if (/^[1-8]$/.test(char)) {
      const emptyCount = Number(char);
      for (let i = 0; i < emptyCount; i += 1) {
        squares.push('');
      }
    } else {
      squares.push(char);
    }
  }
  return squares;
}

function evaluateSquare(square: string): number {
  if (!square) {
    return 0;
  }
  const isWhite = square === square.toUpperCase();
  const piece = square.toLowerCase();
  const value = PIECE_VALUES[piece] ?? 0;
  return isWhite ? value : -value;
}

export const defaultEngineFactory: StockfishFactory | undefined = undefined;
