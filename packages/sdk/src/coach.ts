export interface IngestGamePayload {
  readonly pgn?: string;
  readonly moves?: Array<{
    readonly san: string;
    readonly uci: string;
    readonly fen_before: string;
    readonly fen_after: string;
    readonly time_ms?: number;
  }>;
  readonly source?: string;
}

export interface QueueAnalysisResponse {
  readonly ok: boolean;
}

export interface AnalysisStatusResponse {
  readonly status: 'queued' | 'running' | 'done' | 'error';
}

export interface CoachReportResponse {
  readonly summary: string;
  readonly keyMoments: Array<{ ply: number; classification: string; delta: number }>;
  readonly accuracyWhite: number;
  readonly accuracyBlack: number;
}

export interface CoachSdkOptions {
  readonly baseUrl: string;
  readonly ownerId: string;
  readonly fetchImpl?: typeof fetch;
}

export class CoachSdk {
  private readonly baseUrl: string;
  private readonly ownerId: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: CoachSdkOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.ownerId = options.ownerId;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async ingestGame(payload: IngestGamePayload): Promise<{ gameId: string }> {
    return this.request<{ gameId: string }>('/games/ingest', {
      method: 'POST',
      body: payload,
    });
  }

  public async queueAnalysis(gameId: string): Promise<QueueAnalysisResponse> {
    return this.request<QueueAnalysisResponse>(`/analyses/${gameId}/queue`, { method: 'POST' });
  }

  public async pollStatus(gameId: string): Promise<AnalysisStatusResponse> {
    return this.request<AnalysisStatusResponse>(`/analyses/${gameId}/status`, { method: 'GET' });
  }

  public async getReport(gameId: string): Promise<CoachReportResponse> {
    return this.request<CoachReportResponse>(`/analyses/${gameId}/report`, { method: 'GET' });
  }

  private async request<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method,
      headers: {
        'content-type': 'application/json',
        'x-owner-id': this.ownerId,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Coach API request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}
