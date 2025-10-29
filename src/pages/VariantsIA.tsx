// src/pages/VariantsIA.tsx
// UI complète : saisie, config endpoint/modèle, rendu résultat.
// Appelle directement le serveur OSS local via OssClient (Mode A).

import React, { useMemo, useState, useCallback } from "react";
import { OssClient, ChatMessage } from "../lib/ai/ossClient";

const envVars =
  (
    import.meta as unknown as {
      env?: { VITE_OSS_ENDPOINT?: string; VITE_OSS_MODEL?: string };
    }
  ).env ?? {};

const DEFAULT_ENDPOINT =
  envVars.VITE_OSS_ENDPOINT ?? "http://192.168.0.33:1234/v1/chat/completions";

const DEFAULT_MODEL = envVars.VITE_OSS_MODEL ?? "openai/gpt-oss-20b:2";

// Prompt système strict-JSON
const SYSTEM_PROMPT =
  "Tu es un compilateur pour un moteur de règles d'échecs JSON. " +
  "Respecte strictement le schéma des règles: meta, scope, ui, state, parameters, logic. " +
  "Ne réponds qu'en JSON valide, sans texte additionnel.";

type HeuristicsPayload = { instruction: string };

const buildUserPrompt = (instruction: string): string => {
  const heuristics: HeuristicsPayload = { instruction };
  return [
    `Instruction utilisateur:\n${instruction}\n`,
    `Données heuristiques (JSON):\n${JSON.stringify(heuristics, null, 2)}\n`,
    "Objectif: génère la règle JSON STRICTE (aucun texte hors JSON).",
  ].join("\n");
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

const ConfigBlock: React.FC<{
  endpoint: string;
  setEndpoint: (s: string) => void;
  model: string;
  setModel: (s: string) => void;
}> = ({ endpoint, setEndpoint, model, setModel }) => (
  <div
    style={{
      marginTop: 24,
      padding: 16,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(0,0,0,0.3)",
    }}
  >
    <h3 style={{ marginTop: 0 }}>Configuration modèle local / LAN</h3>

    <div style={{ display: "grid", gap: 12 }}>
      <label>
        URL (OpenAI-compatible) :
        <input
          style={{ width: "100%", marginTop: 6 }}
          value={endpoint}
          onChange={(e) => setEndpoint(e.currentTarget.value)}
          placeholder="http://192.168.0.33:1234/v1/chat/completions"
        />
      </label>
      <label>
        Modèle :
        <input
          style={{ width: "100%", marginTop: 6 }}
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          placeholder="openai/gpt-oss-20b:2"
        />
      </label>
    </div>

    <div
      style={{
        marginTop: 16,
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      {`Test rapide (depuis une machine du LAN) :

curl -X POST '${endpoint}' \\
  -H 'content-type: application/json' \\
  -d '{
    "model": "${model}",
    "messages": [
      { "role": "system", "content": "You are a chess rules compiler. Output JSON only."},
      { "role": "user", "content": "Propose une règle originale pour les cavaliers."}
    ]
  }'
`}
    </div>
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
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [model, setModel] = useState(DEFAULT_MODEL);

  const client = useMemo(
    () => new OssClient({ endpoint, model }),
    [endpoint, model],
  );

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

      // Optionnel : validation locale + save en base si OK
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

      <ConfigBlock
        endpoint={endpoint}
        setEndpoint={setEndpoint}
        model={model}
        setModel={setModel}
      />

      {error && <JsonBlock title="Erreur" data={{ error }} />}
      {rawContent && (
        <JsonBlock title="Réponse brute du modèle" data={rawContent} />
      )}
      {rule && <JsonBlock title="Règle JSON" data={rule} />}
    </div>
  );
};

export default VariantsIA;
