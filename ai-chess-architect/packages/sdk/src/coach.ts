export class CoachSDK {
  constructor(private baseUrl: string, private token?: string) {}

  private headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
    };
  }

  async ingestGame(body: any) {
    const r = await fetch(`${this.baseUrl}/coach/games/ingest`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    return r.json();
  }

  async queueAnalysis(gameId: string) {
    const r = await fetch(`${this.baseUrl}/coach/analyses/${gameId}/queue`, {
      method: 'POST',
      headers: this.headers()
    });
    return r.json();
  }

  async pollStatus(gameId: string) {
    const r = await fetch(`${this.baseUrl}/coach/analyses/${gameId}/status`, {
      headers: this.headers()
    });
    return r.json();
  }

  async getReport(gameId: string) {
    const r = await fetch(`${this.baseUrl}/coach/analyses/${gameId}/report`, {
      headers: this.headers()
    });
    return r.json();
  }
}
