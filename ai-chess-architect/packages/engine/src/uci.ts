// Bridge UCI minimaliste autour de la lib 'stockfish' (WASM/asm.js).
import StockfishFactory from 'stockfish';

export type EngineOpts = { threads?: number; hashMB?: number };
export type EvalOut = {
  depth: number;
  bestmove: string;
  score: { cp?: number; mate?: number };
  pv: string[];
  timeMs: number;
};

export class UciEngine {
  private sf: any;
  private ready = false;

  async init(opts: EngineOpts = {}) {
    this.sf = await StockfishFactory();
    await this.cmd('uci');
    if (opts.threads) await this.cmd(`setoption name Threads value ${opts.threads}`);
    if (opts.hashMB) await this.cmd(`setoption name Hash value ${opts.hashMB}`);
    await this.cmd('isready');
    this.ready = true;
  }

  private cmd(s: string): Promise<void> {
    return new Promise((res) => {
      this.sf.postMessage(s);
      // stockfish 'isready' triggers 'readyok' but we keep simple (fire&forget)
      setTimeout(res, 10);
    });
  }

  async evalFen(fen: string, depth = 18, multiPV = 3): Promise<EvalOut> {
    if (!this.ready) await this.init();
    const start = performance.now();
    let bestmove = '';
    let pv: string[] = [];
    let score: { cp?: number; mate?: number } = {};
    let curDepth = 0;

    const onMsg = (line: string) => {
      if (typeof line !== 'string') return;
      if (line.startsWith('info')) {
        const d = line.match(/ depth (\d+)/);
        if (d) curDepth = parseInt(d[1], 10);
        const scMate = line.match(/ score mate (-?\d+)/);
        const scCp = line.match(/ score cp (-?\d+)/);
        if (scMate) score = { mate: parseInt(scMate[1], 10) };
        else if (scCp) score = { cp: parseInt(scCp[1], 10) };
        const pvMatch = line.match(/ pv (.+)$/);
        if (pvMatch) pv = pvMatch[1].trim().split(' ');
      }
      if (line.startsWith('bestmove')) {
        bestmove = line.split(' ')[1];
      }
    };

    this.sf.onmessage = (e: MessageEvent<string>) => onMsg(e.data);
    await this.cmd('ucinewgame');
    await this.cmd(`position fen ${fen}`);
    await this.cmd(`setoption name MultiPV value ${multiPV}`);
    await this.cmd(`go depth ${depth}`);
    // Attente simplifiée: on lit bestmove en callback; on met un timeout de garde
    await new Promise((r) => setTimeout(r, Math.max(100, depth * 60)));
    const timeMs = Math.round(performance.now() - start);
    return { depth: curDepth, bestmove, pv, score, timeMs };
  }
}
