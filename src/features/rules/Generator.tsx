// /src/features/rules/Generator.tsx
import { useState } from "react";
import {
  invokeGenerateRule,
  type GeneratedRule,
} from "@/lib/supabase/functions";
import { transformAiRuleToEngineRule, validateAiRuleActions } from "@/lib/aiRuleTransformer";
import type { RuleJSON } from "@/engine/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const toErrorMessage = (value: unknown): string => {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "Unknown error";
  }
};

export default function RuleGenerator() {
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("les pions peuvent déposer des mines");
  const [aiResult, setAiResult] = useState<GeneratedRule | null>(null);
  const [engineResult, setEngineResult] = useState<RuleJSON | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const onGenerate = async () => {
    setLoading(true);
    setError(null);
    setAiResult(null);
    setEngineResult(null);
    setWarnings([]);
    
    try {
      const aiRule = await invokeGenerateRule({
        prompt,
        locale: "fr",
        temperature: 0.4,
      });
      
      setAiResult(aiRule);
      
      // Valider les actions
      const unknownActions = validateAiRuleActions(aiRule);
      if (unknownActions.length > 0) {
        setWarnings([`Actions inconnues détectées : ${unknownActions.join(", ")}`]);
      }
      
      // Transformer vers le format moteur
      const engineRule = transformAiRuleToEngineRule(aiRule);
      setEngineResult(engineRule);
      
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Générateur de règle IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Description de la règle</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: les pions peuvent déposer des mines qui explosent après 2 tours"
              rows={3}
            />
          </div>
          
          <Button
            onClick={onGenerate}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Génération en cours…" : "Générer la règle"}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {warnings.length > 0 && (
            <Alert>
              <AlertDescription>
                {warnings.map((w, i) => <div key={i}>{w}</div>)}
              </AlertDescription>
            </Alert>
          )}

          {aiResult && engineResult && (
            <Tabs defaultValue="engine" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="engine">Format Moteur</TabsTrigger>
                <TabsTrigger value="ai">Format IA (brut)</TabsTrigger>
              </TabsList>
              
              <TabsContent value="engine" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Format compatible avec le moteur de règles
                </p>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                  {JSON.stringify(engineResult, null, 2)}
                </pre>
              </TabsContent>
              
              <TabsContent value="ai" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  JSON brut généré par l'IA (Lovable AI)
                </p>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                  {JSON.stringify(aiResult, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
