// /src/features/rules/Generator.tsx
import { useState } from "react";
import {
  invokeGenerateRule,
  type GeneratedRule,
} from "@/lib/supabase/functions";

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
  const [result, setResult] = useState<GeneratedRule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const rule = await invokeGenerateRule({
        prompt,
        locale: "fr",
        temperature: 0.4,
      });
      setResult(rule);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-bold">Générateur de règle</h2>
      <textarea
        className="w-full border rounded p-2"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button
        onClick={onGenerate}
        disabled={loading}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {loading ? "Génération…" : "Générer"}
      </button>

      {error && <pre className="text-red-600 whitespace-pre-wrap">{error}</pre>}

      {result && (
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
