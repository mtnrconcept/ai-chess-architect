import { useEffect, useState } from "react";
import { coachApi } from "@/services/coachApi";

type CoachStatus = { status: string } & Record<string, unknown>;
type CoachReport = { report: unknown; moves: unknown[] };

export function useCoach(baseUrl: string | null | undefined, gameId?: string | null) {
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [report, setReport] = useState<CoachReport | null>(null);

  useEffect(() => {
    if (!baseUrl || !gameId) {
      setStatus(null);
      setReport(null);
      return;
    }

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const nextStatus = await coachApi.status(baseUrl, gameId);
        if (!cancelled) {
          setStatus(nextStatus);
        }

        if (nextStatus?.status === "done") {
          const nextReport = await coachApi.report(baseUrl, gameId);
          if (!cancelled) {
            setReport(nextReport);
          }
          clearInterval(interval);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch coach status", error);
        }
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [baseUrl, gameId]);

  return { status, report };
}
