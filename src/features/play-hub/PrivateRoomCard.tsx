import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  KeyRound,
  Link2,
  LockKeyhole,
  WandSparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseRuleLobbyInvite } from "./invite";

export function PrivateRoomCard() {
  const navigate = useNavigate();
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lobbyId = parseRuleLobbyInvite(invite);
    if (!lobbyId) {
      setError(
        "Colle un lien d'invitation Voltus valide ou l'identifiant UUID du lobby.",
      );
      return;
    }

    setError(null);
    navigate(`/rule-lobby?lobbyId=${encodeURIComponent(lobbyId)}`);
  };

  return (
    <Card className="border-fuchsia-300/20 bg-[#0a0718]/90">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <Badge className="border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100">
            <LockKeyhole className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Salle privée
          </Badge>
          <KeyRound
            className="h-5 w-5 text-fuchsia-200/60"
            aria-hidden="true"
          />
        </div>
        <CardTitle>Jouer sur invitation</CardTitle>
        <CardDescription className="text-fuchsia-100/60">
          Les salles Rule Architect verrouillent la règle, son hash et le seed
          partagé avant le début du match.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <form onSubmit={joinRoom} className="space-y-3" noValidate>
          <Label htmlFor="private-room-invite">
            Lien ou identifiant du lobby
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Link2
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
                aria-hidden="true"
              />
              <Input
                id="private-room-invite"
                value={invite}
                onChange={(event) => {
                  setInvite(event.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={
                  error ? "private-room-error" : "private-room-help"
                }
                placeholder="https://…/rule-lobby?lobbyId=…"
                autoComplete="off"
                className="border-white/10 bg-black/30 pl-9"
              />
            </div>
            <Button type="submit" disabled={!invite.trim()}>
              Rejoindre
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {error ? (
            <p
              id="private-room-error"
              role="alert"
              className="text-sm text-rose-200"
            >
              {error}
            </p>
          ) : (
            <p
              id="private-room-help"
              className="text-xs leading-relaxed text-white/40"
            >
              L'accès reste contrôlé côté serveur : un lien ne donne pas accès
              aux règles privées d'un autre joueur.
            </p>
          )}
        </form>

        <div className="border-t border-white/10 pt-5">
          <Button
            asChild
            variant="outline"
            className="h-auto w-full justify-start gap-3 border-fuchsia-300/25 bg-fuchsia-400/10 px-4 py-3 text-left text-fuchsia-50 hover:bg-fuchsia-400/15 hover:text-white"
          >
            <Link to="/generator">
              <WandSparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">
                  Créer une salle personnalisée
                </span>
                <span className="block text-xs font-normal text-fuchsia-100/55">
                  Génère et publie d'abord ta règle avec Rule Architect
                </span>
              </span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
