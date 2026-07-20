import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import NeonBackground from "@/components/layout/NeonBackground";
import { useAuth } from "@/contexts/AuthContext";
import RuleArchitectPanel from "@/features/rule-architect/RuleArchitectPanel";

export default function RuleArchitect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <NeonBackground>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </NeonBackground>
    );
  }

  if (!user) {
    return (
      <NeonBackground>
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Connexion requise</CardTitle>
              <CardDescription>
                Connecte-toi pour compiler, publier et enregistrer tes variantes
                dans un lobby.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/signup">Créer un compte</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Retour à l’accueil
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </NeonBackground>
    );
  }

  return (
    <NeonBackground>
      <RuleArchitectPanel />
    </NeonBackground>
  );
}
