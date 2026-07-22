import { Home, RefreshCcw, TriangleAlert } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { describeRouteError } from "@/routing/route-error";

export default function RouteErrorPage() {
  const error = useRouteError();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <section
        role="alert"
        className="w-full max-w-xl space-y-5 rounded-3xl border bg-card p-6 shadow-xl sm:p-8"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            Cette page a rencontré un problème
          </h1>
          <p className="text-sm text-muted-foreground">
            {describeRouteError(error)}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => window.location.reload()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Réessayer
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Retour à l’accueil
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
