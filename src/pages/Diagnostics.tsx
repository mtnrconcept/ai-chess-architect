import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isSupabaseConfigured, supabaseDiagnostics } from "@/integrations/supabase/client";
import { useIntegrationHealth } from "@/features/diagnostics/useIntegrationHealth";
import type { IntegrationCategory, IntegrationHealthResult } from "@/types/integration";

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  supabase: "Supabase",
  edge_function: "Edge Function",
  coach_api: "Coach IA",
  http: "HTTP",
};

const formatLatency = (latency: number | null) => {
  if (latency === null || Number.isNaN(latency)) return "—";
  return `${latency} ms`;
};

const formatStatus = (statusCode: number | null) => (statusCode ? statusCode.toString() : "—");

const formatDetails = (result: IntegrationHealthResult) => {
  if (!result.ok) {
    return result.error ?? "Échec du diagnostic";
  }

  if (result.notes) {
    return result.notes;
  }

  if (result.details && Object.keys(result.details).length > 0) {
    return Object.entries(result.details)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(" • ");
  }

  return "Connexion vérifiée";
};

const Diagnostics = () => {
  const { data, isLoading, isError, error, refetch, isFetching } = useIntegrationHealth();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Diagnostics de connectivité</h1>
          <p className="mt-2 text-sm text-cyan-100/70">
            Vérifie la disponibilité de Supabase, des Edge Functions et du coach IA selon le registre configuré dans Supabase.
          </p>
        </div>
        {isSupabaseConfigured && (
          <Button onClick={() => refetch()} disabled={isFetching} variant="outline" className="self-start sm:self-auto">
            {isFetching ? "Analyse en cours…" : "Relancer le diagnostic"}
          </Button>
        )}
      </div>

      {!isSupabaseConfigured && (
        <Alert variant="destructive" className="mb-6 border-rose-500/50 bg-rose-500/10 text-rose-100">
          <AlertTitle>Configuration Supabase incomplète</AlertTitle>
          <AlertDescription>
            Impossible de contacter Supabase tant que les variables d'environnement ne sont pas renseignées.
            {supabaseDiagnostics.problems.length > 0 && (
              <span className="mt-2 block text-xs text-rose-100/80">
                {supabaseDiagnostics.problems.join(" • ")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isLoading && isSupabaseConfigured && (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl bg-white/5" />
          <Skeleton className="h-64 rounded-2xl bg-white/5" />
        </div>
      )}

      {isError && isSupabaseConfigured && (
        <Alert variant="destructive" className="border-rose-500/50 bg-rose-500/10 text-rose-100">
          <AlertTitle>Impossible d'exécuter le diagnostic</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : String(error)}</AlertDescription>
        </Alert>
      )}

      {data && isSupabaseConfigured && (
        <div className="space-y-6">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>Résumé</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-cyan-100/60">Services analysés</p>
                <p className="text-2xl font-semibold text-white">{data.summary.total}</p>
              </div>
              <div>
                <p className="text-sm text-cyan-100/60">Connexions opérationnelles</p>
                <p className="text-2xl font-semibold text-emerald-300">{data.summary.ok}</p>
              </div>
              <div>
                <p className="text-sm text-cyan-100/60">Échecs détectés</p>
                <p className="text-2xl font-semibold text-rose-300">{data.summary.failed}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>Détails par service</CardTitle>
            </CardHeader>
            <CardContent>
              {data.results.length === 0 ? (
                <p className="text-sm text-cyan-100/70">
                  Aucun service n'est enregistré dans <code>public.api_registry</code>. Ajoutez des entrées dans Supabase pour
                  activer le diagnostic.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-cyan-100/70">Service</TableHead>
                      <TableHead className="text-cyan-100/70">Type</TableHead>
                      <TableHead className="text-cyan-100/70">Cible</TableHead>
                      <TableHead className="text-cyan-100/70">Statut</TableHead>
                      <TableHead className="text-cyan-100/70">Latence</TableHead>
                      <TableHead className="text-cyan-100/70">Réponse</TableHead>
                      <TableHead className="text-cyan-100/70">Commentaires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.results.map(result => (
                      <TableRow key={result.id} className="border-white/5">
                        <TableCell className="font-medium text-white">{result.service}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-cyan-400/40 text-xs uppercase tracking-wide text-cyan-100">
                            {CATEGORY_LABELS[result.category]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-cyan-100/80" title={result.target}>
                          {result.target}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={result.ok ? "bg-emerald-500/20 text-emerald-100" : "bg-rose-500/20 text-rose-100"}
                            variant="secondary"
                          >
                            {result.ok ? "OK" : "Échec"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-cyan-100/80">{formatLatency(result.latencyMs)}</TableCell>
                        <TableCell className="text-cyan-100/80">{formatStatus(result.statusCode)}</TableCell>
                        <TableCell className="text-sm text-cyan-100/90">{formatDetails(result)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Diagnostics;
