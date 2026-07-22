// src/pages/VariantsIA.tsx
// UI complète : saisie et génération via edge function Supabase

import React, { useState, useCallback } from "react";
import { OssClient, ChatMessage } from "../lib/ai/ossClient";

const SYSTEM_PROMPT =
  "Tu es un compilateur pour un moteur de règles d'échecs JSON. " +
  "Respecte strictement le schéma des règles: meta, scope, ui, state, parameters, logic. " +
  "Ne réponds qu'en JSON valide, sans texte additionnel.";

type HeuristicsPayload = { instruction: string };

const buildUserPrompt = (instruction: string): string => {
  return `Generate a chess rule based on this instruction:

"${instruction}"

Important guidelines:
- Create a clear, descriptive name for meta.name
- Generate a unique key in meta.key (lowercase-with-dashes)
- Set appropriate scope: "game" (entire game), "turn" (per turn), or "move" (per move)
- Provide a concise description explaining what the rule does
- Use version "1.0.0"

Do NOT ask questions. Generate the best rule you can based on the instruction provided.`;
};

const AssistantBubble: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
    }}
  >
    {children}
  </div>
);

const JsonBlock: React.FC<{ title: string; data: unknown }> = ({
  title,
  data,
}) => (
  <div
    style={{
      marginTop: 16,
      padding: 16,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.03)",
      fontFamily: "monospace",
      whiteSpace: "pre-wrap",
      fontSize: 12,
    }}
  >
    <strong>{title}</strong>
    <pre style={{ marginTop: 8 }}>{JSON.stringify(data, null, 2)}</pre>
  </div>
);

const VariantsIA: React.FC = () => {
  const [instruction, setInstruction] = useState("");
  const client = useMemo(() => new OssClient(), []);

  const [loading, setLoading] = useState(false);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [rule, setRule] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRawContent(null);
    setRule(null);

    try {
      if (!instruction || instruction.trim().length < 12) {
        throw new Error("Votre description est trop courte (≥ 12 caractères).");
      }

      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(instruction.trim()) },
      ];

      const res = await client.chat(messages);
      setRawContent(res.rawContent);
      setRule(res.rule);

      // Success - could add validation + save to database here
    } catch (e) {
      let errorMsg = e instanceof Error ? e.message : String(e);

      // Translate technical errors to user-friendly messages
      if (
        errorMsg.includes("need_info") ||
        errorMsg.includes("need more information")
      ) {
        errorMsg =
          "❓ Le modèle IA a besoin de plus d'informations. Essayez de décrire votre règle de manière plus détaillée et spécifique.";
      } else if (
        errorMsg.includes("unable_to_parse") ||
        errorMsg.includes("parse")
      ) {
        errorMsg =
          "⚠️ Le modèle n'a pas généré un JSON valide. Essayez de reformuler votre demande de manière plus simple.";
      } else if (errorMsg.includes("empty_model_response")) {
        errorMsg =
          "🔇 Le modèle n'a pas généré de réponse. Veuillez réessayer.";
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [client, instruction]);

  const onReset = useCallback(() => {
    setInstruction("");
    setError(null);
    setRule(null);
    setRawContent(null);
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Générateur de Règles IA</h1>

      <AssistantBubble>
        <div>Assistant</div>
        <div style={{ opacity: 0.9 }}>
          Décrivez votre idée de règle d’échecs. Je proposerai une règle JSON
          strictement valide.
        </div>
      </AssistantBubble>

      <textarea
        placeholder="Décrivez votre idée de règle d’échecs…"
        value={instruction}
        onChange={(e) => setInstruction(e.currentTarget.value)}
        style={{ width: "100%", minHeight: 120, borderRadius: 8, padding: 12 }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button onClick={onSubmit} disabled={loading}>
          {loading ? "Génération…" : "Envoyer"}
        </button>
        <button onClick={onReset} disabled={loading}>
          Réinitialiser
        </button>
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <p style={{ fontSize: 14, opacity: 0.9 }}>
          ✨ Utilise Lovable AI (google/gemini-2.5-flash) via edge function
          Supabase
        </p>
      </div>

      {error && <JsonBlock title="Erreur" data={{ error }} />}
      {rawContent && (
        <JsonBlock title="Réponse brute du modèle" data={rawContent} />
      )}
      {rule && <JsonBlock title="Règle JSON" data={rule} />}
    </div>
  );
};

export default VariantsIA;
