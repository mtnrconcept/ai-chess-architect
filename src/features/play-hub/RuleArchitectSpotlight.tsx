import {
  ArrowRight,
  Boxes,
  Fingerprint,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const safeguards = [
  { icon: ShieldCheck, label: "DSL fermé et validé" },
  { icon: Fingerprint, label: "Ruleset signé SHA-256" },
  { icon: Boxes, label: "Version immuable" },
] as const;

export function RuleArchitectSpotlight() {
  return (
    <Card className="relative overflow-hidden border-cyan-300/30 bg-gradient-to-br from-cyan-500/15 via-[#09091a] to-fuchsia-500/15 shadow-[0_28px_100px_-50px_rgba(236,72,153,0.9)]">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-fuchsia-400/15 blur-3xl" />
      <CardHeader className="relative gap-3">
        <Badge className="w-fit border-cyan-200/35 bg-cyan-300/10 text-cyan-50">
          <WandSparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Exclusivité Voltus
        </Badge>
        <CardTitle className="max-w-2xl text-2xl sm:text-3xl">
          Aucun autre échiquier ne joue selon tes idées
        </CardTitle>
        <CardDescription className="max-w-2xl text-base leading-relaxed text-cyan-50/65">
          Décris une mécanique en langage naturel. Rule Architect la transforme
          en règle vérifiable, équilibrée et identique pour les deux joueurs.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-5">
        <ul
          className="grid gap-2 sm:grid-cols-3"
          aria-label="Garanties Rule Architect"
        >
          {safeguards.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/75"
            >
              <Icon
                className="h-4 w-4 shrink-0 text-cyan-300"
                aria-hidden="true"
              />
              {label}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="bg-white text-slate-950 hover:bg-cyan-50">
            <Link to="/generator">
              Créer ma règle
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="text-cyan-100 hover:bg-cyan-300/10 hover:text-white"
          >
            <Link to="/rule-lobby">Explorer les lobbies Rule Architect</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
