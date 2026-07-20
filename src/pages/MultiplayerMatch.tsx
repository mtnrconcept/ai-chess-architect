import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, LockKeyhole, SearchX } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import NeonBackground from "@/components/layout/NeonBackground";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  classifyMatchBootstrapFailure,
  isStrictMatchUuid,
  MultiplayerMatchSessionView,
  SupabaseMultiplayerAdapter,
  type ProcessMoveFunctionsClient,
} from "@/features/multiplayer";
import { supabase } from "@/integrations/supabase/client";

export function MultiplayerMatch() {
  const { matchId } = useParams<{ matchId: string }>();
  const { user, loading: authLoading } = useAuth();
  const validMatchId = isStrictMatchUuid(matchId)
    ? matchId.toLowerCase()
    : null;
  const adapter = useMemo(
    () => (supabase ? new SupabaseMultiplayerAdapter(supabase) : null),
    [],
  );
  const snapshotQuery = useQuery({
    queryKey: ["chess-platform", "match-snapshot", validMatchId, user?.id],
    queryFn: async () => {
      if (!adapter || !validMatchId) {
        throw new Error("MATCH_NOT_FOUND");
      }
      const snapshot = await adapter.loadSnapshot(validMatchId);
      if (!snapshot) throw new Error("MATCH_NOT_FOUND");
      if (snapshot.identity.matchId !== validMatchId) {
        throw new Error("MATCH_STATE_INTEGRITY_FAILED");
      }
      return snapshot;
    },
    enabled: Boolean(user && adapter && validMatchId),
    retry: false,
    staleTime: 0,
  });

  if (authLoading) {
    return (
      <NeonBackground contentClassName="items-center justify-center px-4 py-12">
        <div
          className="h-52 w-full max-w-xl animate-pulse rounded-2xl border border-white/10 bg-slate-950/70"
          aria-label="Chargement de la session"
        />
      </NeonBackground>
    );
  }

  if (!user) {
    return (
      <NeonBackground contentClassName="items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl border-cyan-300/25 bg-slate-950/85 text-center text-white">
          <CardHeader>
            <LockKeyhole
              className="mx-auto h-10 w-10 text-cyan-300"
              aria-hidden="true"
            />
            <CardTitle>Connexion requise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-slate-300">
            <p>
              Un compte authentifié est obligatoire pour lire le snapshot
              protégé, rejoindre Realtime et soumettre un coup.
            </p>
            <Button asChild>
              <Link to="/signup">Se connecter</Link>
            </Button>
          </CardContent>
        </Card>
      </NeonBackground>
    );
  }

  if (!validMatchId) {
    return (
      <NeonBackground contentClassName="items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl border-amber-300/25 bg-slate-950/85 text-center text-white">
          <CardHeader>
            <SearchX
              className="mx-auto h-10 w-10 text-amber-300"
              aria-hidden="true"
            />
            <CardTitle>Lien de match invalide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-slate-300">
            <p>
              L'identifiant doit être un UUID de match complet. Aucun appel
              serveur n'a été effectué avec cette valeur.
            </p>
            <Button asChild variant="outline">
              <Link to="/play-hub">Retour au hub</Link>
            </Button>
          </CardContent>
        </Card>
      </NeonBackground>
    );
  }

  if (!adapter || !supabase) {
    return (
      <NeonBackground contentClassName="items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl border-red-400/25 bg-slate-950/85 text-center text-white">
          <CardHeader>
            <AlertTriangle
              className="mx-auto h-10 w-10 text-red-300"
              aria-hidden="true"
            />
            <CardTitle>Service multijoueur indisponible</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            La connexion publique Supabase n'est pas initialisée dans cet
            environnement.
          </CardContent>
        </Card>
      </NeonBackground>
    );
  }

  if (snapshotQuery.isPending) {
    return (
      <NeonBackground contentClassName="items-center justify-center px-4 py-12">
        <div
          className="w-full max-w-3xl space-y-4"
          aria-label="Chargement du match"
        >
          <div className="h-24 animate-pulse rounded-2xl border border-white/10 bg-slate-950/70" />
          <div className="aspect-square animate-pulse rounded-2xl border border-white/10 bg-slate-950/70" />
        </div>
      </NeonBackground>
    );
  }

  if (snapshotQuery.isError) {
    const failure = classifyMatchBootstrapFailure(snapshotQuery.error);
    return (
      <NeonBackground contentClassName="items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl border-red-400/25 bg-slate-950/85 text-center text-white">
          <CardHeader>
            {failure === "not-found" ? (
              <SearchX
                className="mx-auto h-10 w-10 text-amber-300"
                aria-hidden="true"
              />
            ) : (
              <LockKeyhole
                className="mx-auto h-10 w-10 text-red-300"
                aria-hidden="true"
              />
            )}
            <CardTitle>
              {failure === "not-found"
                ? "Match introuvable (404)"
                : failure === "forbidden"
                  ? "Accès refusé (403)"
                  : "Impossible de charger le match"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-slate-300">
            <p>
              {failure === "forbidden"
                ? "Ce compte ne fait pas partie de la salle protégée, ou la session n'est plus valide."
                : failure === "not-found"
                  ? "Ce match n'existe pas ou n'est plus disponible."
                  : "Le serveur n'a pas pu fournir un snapshot canonique. Aucun état local n'est utilisé en remplacement."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                onClick={() => void snapshotQuery.refetch()}
              >
                Réessayer
              </Button>
              <Button asChild variant="outline">
                <Link to="/play-hub">Retour au hub</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </NeonBackground>
    );
  }

  return (
    <NeonBackground>
      <MultiplayerMatchSessionView
        adapter={adapter}
        functionsClient={supabase as unknown as ProcessMoveFunctionsClient}
        identity={snapshotQuery.data.identity}
        userId={user.id}
      />
    </NeonBackground>
  );
}
