// src/pages/Tournaments.tsx
import React, { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase/client";

type Tournament = {
  id: string;
  name: string;
  starts_at: string | null;
  published: boolean;
  visibility: "public" | "private" | string;
  creator_id: string;
};

const Tournaments: React.FC = () => {
  const supabase = getSupabase();
  const [rows, setRows] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Liste publique + mes tournois + tournois où je suis inscrit → géré par policies RLS.
        // Ici, on demande tout simplement, les policies décideront de ce qui est visible.
        const { data, error } = await supabase
          .from("tournaments")
          .select("*")
          .order("starts_at", { ascending: true });

        if (error) throw error;
        setRows((data ?? []) as Tournament[]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Tournois</h1>
      {loading && <div>Chargement…</div>}
      {err && <div style={{ color: "#ff6b6b" }}>Erreur: {err}</div>}
      {!loading && !err && rows.length === 0 && (
        <div>Aucun tournoi disponible.</div>
      )}
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {rows.map((t) => (
          <div
            key={t.id}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{t.name}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Début:{" "}
              {t.starts_at ? new Date(t.starts_at).toLocaleString() : "—"}
              {" • "}
              Visibilité: {t.visibility}
              {" • "}
              {t.published ? "Publié" : "Brouillon"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tournaments;
