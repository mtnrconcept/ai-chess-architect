import { useCallback, useRef, useState } from "react";

type Insights = { summary: string; points?: number; [k: string]: unknown };
type Params = { userId: string; gameHash: string; payload: Record<string, unknown> };

const CACHE_TTL = 60_000; // 60s
const cache = new Map<string, { ts: number; data: Insights }>();

export function useChessInsights() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef<Promise<Insights> | null>(null);
  const debounceRef = useRef<number | null>(null);

  const run = useCallback((params: Params, delay = 800) => {
    const key = `${params.userId}:${params.gameHash}`;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    return new Promise<Insights>((resolve, reject) => {
      debounceRef.current = window.setTimeout(async () => {
        try {
          const cached = cache.get(key);
          if (cached && Date.now() - cached.ts < CACHE_TTL) return resolve(cached.data);

          if (inflightRef.current) return resolve(await inflightRef.current);

          setLoading(true); setError(null);
          abortRef.current?.abort();
          abortRef.current = new AbortController();

          const p = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chess-insights`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(params.payload),
            signal: abortRef.current.signal,
          })
            .then(async (r) => {
              if (r.status === 429) throw new Error("Rate limited (429)");
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return (await r.json()) as Insights;
            })
            .finally(() => {
              inflightRef.current = null;
              setLoading(false);
            });

          inflightRef.current = p;
          const data = await p;
          cache.set(key, { ts: Date.now(), data });
          resolve(data);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setError(message);
          reject(error);
        }
      }, delay);
    });
  }, []);

  return { run, loading, error };
}
