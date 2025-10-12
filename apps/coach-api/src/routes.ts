import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AnalysisResult } from '../coach-worker/src/pipeline';
import { AnalysisPipeline } from '../coach-worker/src/pipeline';
import { LLMProvider } from '../../../packages/llm/src';

export interface CoachApiOptions {
  readonly pipeline?: AnalysisPipeline;
  readonly service?: CoachService;
}

export interface HttpContext {
  readonly request: Request;
  readonly params: Record<string, string>;
  readonly json: (body: unknown, init?: ResponseInit) => Response;
}

export interface CoachService {
  ingestGame(payload: IngestBody, ownerId: string): Promise<{ gameId: string }>;
  queueAnalysis(gameId: string, ownerId: string): Promise<void>;
  getAnalysisStatus(gameId: string, ownerId: string): Promise<{ status: string }>;
  getReport(gameId: string, ownerId: string): Promise<AnalysisResult>;
  rebuild(gameId: string): Promise<void>;
  listMoves(gameId: string, ownerId: string): Promise<MoveRecord[]>;
}

export interface MoveRecord {
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly timeSpentMs?: number;
}

const ingestSchema = z.object({
  pgn: z.string().optional(),
  moves: z
    .array(
      z.object({
        san: z.string(),
        uci: z.string(),
        fen_before: z.string(),
        fen_after: z.string(),
        time_ms: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
  source: z.string().optional(),
});

type IngestBody = z.infer<typeof ingestSchema>;

interface RouteDefinition {
  readonly method: string;
  readonly pattern: RegExp;
  readonly paramNames: string[];
  readonly handler: (ctx: HttpContext) => Promise<Response>;
}

export function createCoachRouter(options: CoachApiOptions = {}) {
  const routes: RouteDefinition[] = [];
  const service = options.service ?? new InMemoryCoachService();

  routes.push(createRoute('POST', '/games/ingest', async (ctx) => {
    const body = await ctx.request.json();
    const parseResult = ingestSchema.safeParse(body);
    if (!parseResult.success) {
      return ctx.json({ error: 'Invalid payload', details: parseResult.error.flatten() }, { status: 400 });
    }

    const ownerId = getOwnerFromRequest(ctx.request);
    const result = await service.ingestGame(parseResult.data, ownerId);
    return ctx.json(result, { status: 201 });
  }));

  routes.push(createRoute('POST', '/analyses/:gameId/queue', async (ctx) => {
    const ownerId = getOwnerFromRequest(ctx.request);
    await service.queueAnalysis(ctx.params.gameId, ownerId);
    return ctx.json({ ok: true });
  }));

  routes.push(createRoute('GET', '/analyses/:gameId/status', async (ctx) => {
    const ownerId = getOwnerFromRequest(ctx.request);
    const status = await service.getAnalysisStatus(ctx.params.gameId, ownerId);
    return ctx.json(status);
  }));

  routes.push(createRoute('GET', '/analyses/:gameId/report', async (ctx) => {
    const ownerId = getOwnerFromRequest(ctx.request);
    const report = await service.getReport(ctx.params.gameId, ownerId);
    return ctx.json(report);
  }));

  routes.push(createRoute('POST', '/analyses/:gameId/rebuild', async (ctx) => {
    await service.rebuild(ctx.params.gameId);
    return ctx.json({ ok: true });
  }));

  routes.push(createRoute('GET', '/moves/:gameId', async (ctx) => {
    const ownerId = getOwnerFromRequest(ctx.request);
    const moves = await service.listMoves(ctx.params.gameId, ownerId);
    return ctx.json({ moves });
  }));

  return {
    async handle(request: Request, params: Record<string, string> = {}): Promise<Response> {
      const pathname = getRouteKey(new URL(request.url).pathname);
      for (const route of routes) {
        if (route.method !== request.method) {
          continue;
        }
        const match = route.pattern.exec(pathname);
        if (match) {
          const extractedParams: Record<string, string> = { ...params };
          route.paramNames.forEach((name, index) => {
            extractedParams[name] = match[index + 1];
          });
          const ctx: HttpContext = {
            request,
            params: extractedParams,
            json: (body, init) =>
              new Response(JSON.stringify(body), {
                ...init,
                headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
              }),
          };
          return route.handler(ctx);
        }
      }
      return new Response('Not found', { status: 404 });
    },
  };
}

function createRoute(
  method: string,
  template: string,
  handler: (ctx: HttpContext) => Promise<Response>,
): RouteDefinition {
  const paramNames: string[] = [];
  const pattern = new RegExp(
    '^' +
      template
        .split('/')
        .map((segment) => {
          if (segment.startsWith(':')) {
            paramNames.push(segment.slice(1));
            return '([^/]+)';
          }
          return segment;
        })
        .join('/') +
      '$',
  );
  return { method, pattern, paramNames, handler };
}

function getRouteKey(pathname: string): string {
  if (pathname.startsWith('/api/coach/')) {
    return pathname.replace('/api/coach', '');
  }
  return pathname;
}

function getOwnerFromRequest(request: Request): string {
  const header = request.headers.get('x-owner-id');
  if (!header) {
    throw new Error('Missing owner header');
  }
  return header;
}

class InMemoryCoachService implements CoachService {
  private readonly store = new Map<string, { ownerId: string; moves: MoveRecord[]; analysis?: AnalysisResult }>();
  private readonly pipeline: AnalysisPipeline;

  public constructor() {
    let llmProvider: LLMProvider | undefined;
    try {
      llmProvider = new LLMProvider({ order: ['lovable', 'groq', 'gemini'] });
    } catch (error) {
      console.warn('LLM provider disabled for in-memory coach service:', error);
    }
    this.pipeline = new AnalysisPipeline({
      depth: 14,
      multiPV: 3,
      threads: 1,
      hashMB: 32,
      llmProvider,
    });
  }

  public async ingestGame(payload: IngestBody, ownerId: string): Promise<{ gameId: string }> {
    const gameId = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : randomUUID();
    const moves = (payload.moves ?? []).map((move, index) => ({
      ply: index + 1,
      san: move.san,
      uci: move.uci,
      fenBefore: move.fen_before,
      fenAfter: move.fen_after,
      timeSpentMs: move.time_ms,
    }));

    this.store.set(gameId, { ownerId, moves });
    return { gameId };
  }

  public async queueAnalysis(gameId: string, ownerId: string): Promise<void> {
    const game = this.store.get(gameId);
    if (!game || game.ownerId !== ownerId) {
      throw new Error('Forbidden');
    }
    game.analysis = await this.pipeline.run(game.moves);
  }

  public async getAnalysisStatus(gameId: string, ownerId: string): Promise<{ status: string }> {
    const game = this.store.get(gameId);
    if (!game || game.ownerId !== ownerId) {
      throw new Error('Forbidden');
    }
    return { status: game.analysis ? 'done' : 'queued' };
  }

  public async getReport(gameId: string, ownerId: string): Promise<AnalysisResult> {
    const game = this.store.get(gameId);
    if (!game || game.ownerId !== ownerId || !game.analysis) {
      throw new Error('Analysis not available');
    }
    return game.analysis;
  }

  public async rebuild(gameId: string): Promise<void> {
    const game = this.store.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }
    game.analysis = await this.pipeline.run(game.moves);
  }

  public async listMoves(gameId: string, ownerId: string): Promise<MoveRecord[]> {
    const game = this.store.get(gameId);
    if (!game || game.ownerId !== ownerId) {
      throw new Error('Forbidden');
    }
    return game.moves;
  }
}
