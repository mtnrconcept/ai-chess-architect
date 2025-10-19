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
  readonly status: "queued" | "running" | "done" | "error";
}

export interface CoachReportResponse {
  readonly summary: string;
  readonly keyMoments: Array<{
    ply: number;
    classification: string;
    delta: number;
  }>;
  readonly accuracyWhite: number;
  readonly accuracyBlack: number;
}

export interface CoachSdkOptions {
  readonly baseUrl: string;
  readonly ownerId?: string;
  readonly authToken?: string;
  readonly pathPrefix?: string;
  readonly fetchImpl?: typeof fetch;
}

export class CoachSdk {
  private readonly baseUrl: string;
  private readonly ownerId?: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pathPrefix: string;

  public constructor(options: CoachSdkOptions) {
    const normalisedBase = options.baseUrl.replace(/\/$/, "");
    const defaultPrefix =
      options.pathPrefix ?? (normalisedBase.endsWith("/coach") ? "" : "/coach");

    this.baseUrl = normalisedBase;
    this.ownerId = options.ownerId;
    this.authToken = options.authToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pathPrefix = CoachSdk.normalisePrefix(defaultPrefix);
  }

  public async ingestGame(
    payload: IngestGamePayload,
  ): Promise<{ gameId: string }> {
    return this.request<{ gameId: string }>("/games/ingest", {
      method: "POST",
      body: payload,
    });
  }

  public async queueAnalysis(gameId: string): Promise<QueueAnalysisResponse> {
    return this.request<QueueAnalysisResponse>(`/analyses/${gameId}/queue`, {
      method: "POST",
    });
  }

  public async pollStatus(gameId: string): Promise<AnalysisStatusResponse> {
    return this.request<AnalysisStatusResponse>(`/analyses/${gameId}/status`, {
      method: "GET",
    });
  }

  public async getReport(gameId: string): Promise<CoachReportResponse> {
    return this.request<CoachReportResponse>(`/analyses/${gameId}/report`, {
      method: "GET",
    });
  }

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<T> {
    const response = await this.fetchImpl(this.buildUrl(path), {
      method: init.method,
      headers: this.buildHeaders(),
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(
        `Coach API request failed: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const prefix = this.pathPrefix === "/" ? "" : this.pathPrefix;
    return `${this.baseUrl}${prefix}${cleanPath}`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (this.ownerId) {
      headers["x-owner-id"] = this.ownerId;
    }

    if (this.authToken) {
      headers.authorization = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  private static normalisePrefix(prefix: string | undefined): string {
    if (!prefix) {
      return "";
    }

    if (prefix === "/") {
      return "/";
    }

    return prefix.startsWith("/")
      ? prefix.replace(/\/$/, "")
      : `/${prefix.replace(/\/$/, "")}`;
  }
}
