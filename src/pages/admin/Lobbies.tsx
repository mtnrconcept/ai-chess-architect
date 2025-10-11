import { useEffect, useState } from "react";
import { fetchWaitingLobbies, type LobbyRow } from "@/lib/supabase/queries";

export default function LobbiesAdmin() {
  const [rows, setRows] = useState<LobbyRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setRows(await fetchWaitingLobbies());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setErr(message);
      }
    })();
  }, []);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Lobbies en attente</h1>
      {err && <div className="text-red-400 mb-3">Erreur: {err}</div>}
      <table className="w-full text-sm">
        <thead><tr><th>ID</th><th>Nom</th><th>Créateur</th><th>Status</th><th>Créé</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-white/10">
              <td>{r.id}</td><td>{r.name}</td><td>{r.creator_id}</td><td>{r.status}</td><td>{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
