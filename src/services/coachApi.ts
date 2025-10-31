import { supabase } from "@/integrations/supabase/client";

export const coachApi = {
  async analyze(body: { moves: string[]; fen?: string; duration?: number; result?: string }) {
    const { data, error } = await supabase.functions.invoke("coach-analysis", {
      body,
    });

    if (error) {
      throw new Error(`Coach analysis error: ${error.message}`);
    }

    return data;
  },

  async insights(body: unknown) {
    const { data, error } = await supabase.functions.invoke("chess-insights", {
      body,
    });

    if (error) {
      throw new Error(`Chess insights error: ${error.message}`);
    }

    return data;
  },

  // Stub methods for legacy compatibility (no longer implemented)
  async ingest(_baseUrl: string, _body: unknown) {
    console.warn("coachApi.ingest is deprecated and no longer implemented");
    return { gameId: null };
  },

  async queue(_baseUrl: string, _gameId: string) {
    console.warn("coachApi.queue is deprecated and no longer implemented");
    return { status: "not_implemented" };
  },

  async status(_baseUrl: string, _gameId: string) {
    console.warn("coachApi.status is deprecated and no longer implemented");
    return { status: "not_implemented" };
  },

  async report(_baseUrl: string, _gameId: string) {
    console.warn("coachApi.report is deprecated and no longer implemented");
    return { report: null, moves: [] };
  },
};
