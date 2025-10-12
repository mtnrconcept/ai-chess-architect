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

type StockfishCcall = (
  name: string,
  returnType: string | null,
  argTypes: string[],
  args: unknown[],
  options?: { async?: boolean },
) => unknown;

interface StockfishModule {
  readonly ccall: StockfishCcall;
  listener?: (line: string) => void;
  terminate?: () => void;
}

interface StockfishModuleConfig {
  wasmBinary: Uint8Array;
  locateFile(file: string): string;
  print?(line: string): void;
  printErr?(line: string): void;
}

type StockfishInitializer = (config: StockfishModuleConfig) => Promise<StockfishModule>;

type StockfishModuleFactory = () => StockfishInitializer;

export class StockfishWasmEngine implements Engine {
  private readonly factory?: StockfishFactory;
  private instance: StockfishLike | null = null;
  private ready = false;

  public constructor(factory: StockfishFactory | undefined = defaultEngineFactory) {
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

class WasmStockfishWorker implements StockfishLike {
  private readonly listeners = new Set<MessageListener>();
  private disposed = false;

  public constructor(private readonly module: StockfishModule) {}

  public addMessageListener(listener: MessageListener): void {
    this.listeners.add(listener);
  }

  public removeMessageListener(listener: MessageListener): void {
    this.listeners.delete(listener);
  }

  public postMessage(message: string): void {
    if (this.disposed) {
      throw new Error('Cannot send messages to a disposed Stockfish worker.');
    }

    const command = message.trim();
    if (!command) {
      return;
    }

    const asyncCommand = /^(go|bench|perft)/.test(command);
    const schedule = typeof setImmediate === 'function' ? setImmediate : (fn: () => void) => setTimeout(fn, 0);
    schedule(() => {
      this.module.ccall('command', null, ['string'], [command], { async: asyncCommand });
    });
  }

  public terminate(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    try {
      this.module.ccall('command', null, ['string'], ['quit']);
    } catch (error) {
      // Ignore errors while shutting down the engine.
    }

    try {
      this.module.terminate?.();
    } catch (error) {
      // Ignore errors from optional terminate hook.
    }

    try {
      this.module.listener = undefined;
    } catch (error) {
      // Ignore errors if the listener property is read-only.
    }

    this.listeners.clear();
  }

  public handleOutput(message: unknown): void {
    if (this.disposed) {
      return;
    }

    if (typeof message !== 'string') {
      return;
    }

    const sanitized = message.replace(/\r/g, '');
    for (const raw of sanitized.split('\n')) {
      const line = raw.trim();
      if (!line) {
        continue;
      }
      for (const listener of this.listeners) {
        listener(line);
      }
    }
  }
}

async function loadStockfishModule(): Promise<{
  initializer: StockfishInitializer;
  wasmPath: string;
  wasmBinary: Uint8Array;
  locateFile: (file: string) => string;
}>
{
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error('The default Stockfish factory requires a Node.js environment.');
  }

  const [{ readdir, readFile }, { join }, { fileURLToPath, pathToFileURL }, { Buffer }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
    import('node:url'),
    import('node:buffer'),
  ]);

  const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
  const stockfishDir = join(rootDir, 'node_modules', 'stockfish', 'src');
  const entries = await readdir(stockfishDir);

  const pickEntry = (pattern: RegExp): string | undefined => entries.find((file) => pattern.test(file));

  const entryJs =
    pickEntry(/stockfish-.*-8e4d048\.js$/) ??
    pickEntry(/stockfish-.*-single-.*\.js$/) ??
    pickEntry(/stockfish-.*-lite-single-.*\.js$/);

  if (!entryJs) {
    throw new Error('Unable to locate the Stockfish WASM bundle. Did you install the "stockfish" package?');
  }

  const baseName = entryJs.replace(/\.js$/, '');
  const wasmPath = join(stockfishDir, `${baseName}.wasm`);
  const partFiles = entries
    .filter((file) => file.startsWith(`${baseName}-part-`) && file.endsWith('.wasm'))
    .sort();

  let wasmBinary: Uint8Array;
  if (partFiles.length > 0) {
    const buffers = await Promise.all(partFiles.map((file) => readFile(join(stockfishDir, file))));
    wasmBinary = Buffer.concat(buffers);
  } else {
    wasmBinary = await readFile(wasmPath);
  }

  const moduleUrl = pathToFileURL(join(stockfishDir, entryJs)).href;
  const moduleExports = await import(moduleUrl);
  const moduleFactory = (moduleExports.default ?? moduleExports.Stockfish ?? moduleExports) as StockfishModuleFactory;

  if (typeof moduleFactory !== 'function') {
    throw new Error('Invalid Stockfish module export.');
  }

  return {
    initializer: moduleFactory(),
    wasmPath,
    wasmBinary,
    locateFile(file: string): string {
      if (file.endsWith('.wasm')) {
        return wasmPath;
      }
      return join(stockfishDir, file);
    },
  };
}

export const defaultEngineFactory: StockfishFactory | undefined = async () => {
  const { initializer, wasmPath, wasmBinary, locateFile } = await loadStockfishModule();
  const outputBuffer: string[] = [];

  const captureOutput = (line: string): void => {
    if (typeof line === 'string') {
      outputBuffer.push(line);
    }
  };

  const module = await initializer({
    wasmBinary,
    locateFile,
    print: captureOutput,
    printErr: captureOutput,
  });

  const worker = new WasmStockfishWorker(module);
  module.listener = (line: string) => worker.handleOutput(line);
  outputBuffer.forEach((line) => worker.handleOutput(line));

  return worker;
};

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
