import { useEffect, useState } from "react";
import {
  fetchTournaments,
  fetchTournamentOverview,
  type TournamentOverviewRow,
  type TournamentRow,
} from "@/lib/supabase/queries";

export default function TournamentsAdmin() {
  const [list, setList] = useState<TournamentRow[]>([]);
  const [overview, setOverview] = useState<TournamentOverviewRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([fetchTournaments(), fetchTournamentOverview()]);
        setList(a); setOverview(b);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setErr(message);
      }
    })();
  }, []);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Tournois</h1>
      {err && <div className="text-red-400 mb-3">Erreur: {err}</div>}

      <h2 className="text-xl font-semibold mt-4">Liste</h2>
      <ul className="space-y-2">
        {list.map(t => (
          <li key={t.id} className="border border-white/10 p-3 rounded">
            <div className="font-medium">{t.name}</div>
            <div className="text-xs opacity-70">
              {new Date(t.start_time).toLocaleString()} → {new Date(t.end_time).toLocaleString()} — {t.status}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="text-xl font-semibold mt-6">Overview</h2>
      <ul className="space-y-2">
        {overview.map(o => (
          <li key={o.id} className="border border-white/10 p-3 rounded">
            <div className="font-medium">{o.name}</div>
            <div className="text-xs opacity-70">Players: {o.players} — Matches: {o.matches}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
