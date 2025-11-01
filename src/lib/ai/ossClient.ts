// src/lib/ai/ossClient.ts
// Client pour appeler l'edge function generate-chess-rule via Supabase
// Remplace les appels directs au modèle local

import { supabase } from "@/integrations/supabase/client";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OssCompileResponse = {
  rule: unknown;
  rawContent: string;
};

type EdgeFunctionResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  result?: {
    rule?: unknown;
    choices?: Array<{ message?: { content?: string } }>;
    rawModelResponse?: {
      content?: string;
    };
  };
  error?: string;
};

export class OssClient {
  async chat(messages: ChatMessage[]): Promise<OssCompileResponse> {
    const userMessage = messages.find((m) => m.role === "user");
    if (!userMessage) {
      throw new Error("No user message provided");
    }

    const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
      "generate-chess-rule",
      {
        body: { prompt: userMessage.content },
      }
    );

    if (error) {
      throw new Error(`Edge function network error: ${error.message}`);
    }

    if (!data || !data.ok) {
      const errorMsg = data?.error ?? "unknown error";
      
      // Special case: model asking for clarification
      if (data?.status === "need_info") {
        throw new Error(
          `Le modèle IA a besoin de plus d'informations. Essayez de décrire votre règle plus précisément.\n\n` +
          `Détails: ${data.message ?? "Aucun détail disponible"}`
        );
      }
      
      throw new Error(`Edge function failed: ${errorMsg}`);
    }

    // Try to get content from new format first
    let content = data.result?.rawModelResponse?.content;
    
    // Fallback to choices format if available
    if (!content) {
      content = data.result?.choices?.[0]?.message?.content ?? "";
    }
    
    // If still no content but we have a rule directly, use it
    if (!content && data.result?.rule) {
      return {
        rule: data.result.rule,
        rawContent: JSON.stringify(data.result.rule, null, 2)
      };
    }
    
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Empty response from AI");
    }

    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    const candidate = fenced ? (fenced[1] ?? "") : trimmed;

    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error(`No JSON object found: ${trimmed.slice(0, 500)}`);
    }

    const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);

    try {
      const parsed = JSON.parse(jsonSlice);
      return { rule: parsed, rawContent: trimmed };
    } catch {
      throw new Error(`JSON parse error: ${jsonSlice.slice(0, 500)}`);
    }
  }
}
