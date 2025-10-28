import type {
  Engine,
  EngineEvaluation,
  EngineInitOptions,
  EvaluateFenOptions,
} from "./stockfishWasm";

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

type Listener = (message: string) => void;

type StockfishInstance = {
  postMessage(message: string): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  addMessageListener?(listener: Listener): void;
  removeMessageListener?(listener: Listener): void;
};

type StockfishFactoryFn = () =>
  | StockfishInstance
  | Promise<StockfishInstance>
  | undefined;

type StockfishModuleLoader = () => Promise<Record<string, unknown>>;

const STOCKFISH_VARIANT_PRIORITY = [
  "lite-single",
  "lite",
  "single",
  "multi",
  "asm",
];

let customStockfishFactory: StockfishFactoryFn | null = null;
let cachedFactory: (() => Promise<StockfishInstance>) | null = null;

export function setStockfishFactory(factory: StockfishFactoryFn | null) {
  customStockfishFactory = factory;
  cachedFactory = null;
}

export class UciEngine implements Engine {
  private stockfish: StockfishInstance | null = null;
  private ready = false;

  public async init(options: EngineOptions = {}): Promise<void> {
    if (this.ready) {
      return;
    }

    this.stockfish = await resolveStockfishInstance();
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

async function resolveStockfishInstance(): Promise<StockfishInstance> {
  const factory = await resolveStockfishFactory();
  const instance = factory();
  return normalizeFactoryResult(instance);
}

async function resolveStockfishFactory(): Promise<
  () => Promise<StockfishInstance>
> {
  if (cachedFactory) {
    return cachedFactory;
  }

  const custom = getCustomFactory();
  if (custom) {
    cachedFactory = custom;
    return cachedFactory;
  }

  const fromImportMeta = await tryResolveFromImportMeta();
  if (fromImportMeta) {
    cachedFactory = fromImportMeta;
    return cachedFactory;
  }

  const fromNodeFs = await tryResolveFromNodeFs();
  if (fromNodeFs) {
    cachedFactory = fromNodeFs;
    return cachedFactory;
  }

  throw new Error(
    "Aucune implémentation Stockfish valide n'a été trouvée. Fournissez-en une via setStockfishFactory() ou exposez globalThis.Stockfish.",
  );
}

function getCustomFactory(): (() => Promise<StockfishInstance>) | null {
  if (customStockfishFactory) {
    return () => normalizeFactoryResult(customStockfishFactory!());
  }

  const maybeGlobal =
    (typeof globalThis !== "undefined" &&
      ((globalThis as Record<string, unknown>).__STOCKFISH_FACTORY__ as
        | StockfishFactoryFn
        | undefined)) ||
    (typeof globalThis !== "undefined"
      ? ((globalThis as Record<string, unknown>).Stockfish as
          | StockfishFactoryFn
          | undefined)
      : undefined);

  if (maybeGlobal && typeof maybeGlobal === "function") {
    return () => normalizeFactoryResult(maybeGlobal());
  }

  return null;
}

async function tryResolveFromImportMeta(): Promise<
  (() => Promise<StockfishInstance>) | null
> {
  const glob = (
    import.meta as unknown as {
      glob?: (pattern: string) => Record<string, StockfishModuleLoader>;
    }
  ).glob;

  if (typeof glob !== "function") {
    return null;
  }

  const modules = glob("stockfish/src/*.js");
  const loader = selectLoader(Object.entries(modules));

  if (!loader) {
    return null;
  }

  const module = await loader();
  const factory = extractFactory(module);
  if (!factory) {
    return null;
  }

  return () => normalizeFactoryResult(factory());
}

async function tryResolveFromNodeFs(): Promise<
  (() => Promise<StockfishInstance>) | null
> {
  if (typeof process === "undefined" || !process.versions?.node) {
    return null;
  }

  try {
    const [{ createRequire }, { readdir }, path, { pathToFileURL }] =
      await Promise.all([
        import("node:module"),
        import("node:fs/promises"),
        import("node:path"),
        import("node:url"),
      ]);

    const require = createRequire(import.meta.url);
    const packagePath = require.resolve("stockfish/package.json");
    const srcDir = path.join(path.dirname(packagePath), "src");
    const entries = await readdir(srcDir);
    const jsFiles = entries.filter((file) => file.endsWith(".js"));
    const selected = selectFile(jsFiles);

    if (!selected) {
      return null;
    }

    const moduleUrl = pathToFileURL(path.join(srcDir, selected)).href;
    const module = await import(moduleUrl);
    const factory = extractFactory(module);

    if (!factory) {
      return null;
    }

    return () => normalizeFactoryResult(factory());
  } catch (error) {
    console.warn(
      "Impossible de charger Stockfish via le système de fichiers:",
      error,
    );
    return null;
  }
}

function selectLoader(
  entries: [string, StockfishModuleLoader][],
): StockfishModuleLoader | null {
  if (!entries.length) {
    return null;
  }

  for (const token of STOCKFISH_VARIANT_PRIORITY) {
    const match = entries.find(([file]) => file.includes(token));
    if (match) {
      return match[1];
    }
  }

  return entries[0]?.[1] ?? null;
}

function selectFile(files: string[]): string | null {
  for (const token of STOCKFISH_VARIANT_PRIORITY) {
    const match = files.find((file) => file.includes(token));
    if (match) {
      return match;
    }
  }
  return files[0] ?? null;
}

function extractFactory(
  module: Record<string, unknown>,
): StockfishFactoryFn | null {
  const candidate =
    (module.default as StockfishFactoryFn | undefined) ??
    (module.Stockfish as StockfishFactoryFn | undefined);

  if (typeof candidate !== "function") {
    return null;
  }

  return candidate;
}

async function normalizeFactoryResult(
  result: StockfishInstance | Promise<StockfishInstance> | undefined,
): Promise<StockfishInstance> {
  const value =
    result && typeof (result as Promise<StockfishInstance>).then === "function"
      ? await (result as Promise<StockfishInstance>)
      : (result as StockfishInstance | undefined);

  if (!value) {
    throw new Error("La factory Stockfish n'a renvoyé aucune instance.");
  }

  if (typeof value.postMessage !== "function") {
    console.warn(
      "La factory Stockfish résolue ne renvoie pas un worker compatible. postMessage est manquant.",
    );
    throw new Error("Instance Stockfish invalide : postMessage manquant.");
  }

  if (
    typeof value.addMessageListener !== "function" &&
    typeof value.onmessage !== "object"
  ) {
    // Les builds Node exposent add/removeMessageListener, les builds web utilisent onmessage.
    value.onmessage = null;
  }

  return value;
}
