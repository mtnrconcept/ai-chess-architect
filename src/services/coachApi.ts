export const coachApi = {
  async ingest(baseUrl: string, body: unknown) {
    const response = await fetch(`${baseUrl}/coach/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  },

  async queue(baseUrl: string, gameId: string) {
    const response = await fetch(`${baseUrl}/coach/queue/${gameId}`, {
      method: "POST",
    });
    return response.json();
  },

  async status(baseUrl: string, gameId: string) {
    const response = await fetch(`${baseUrl}/coach/status/${gameId}`);
    return response.json();
  },

  async report(baseUrl: string, gameId: string) {
    const response = await fetch(`${baseUrl}/coach/report/${gameId}`);
    return response.json();
  },
};
