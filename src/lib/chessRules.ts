import { requireSupabaseClient } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ChessRule = {
  rule_id: string;
  variant_id?: string | null;
  name?: string | null;
  version?: number | null;
  payload: Record<string, unknown>;
};

export async function upsertRule(input: ChessRule) {
  const supabase = requireSupabaseClient();
  const record = {
    rule_id: input.rule_id,
    rule_name: input.name ?? input.rule_id,
    description:
      typeof input.payload.description === "string"
        ? input.payload.description
        : (input.name ?? input.rule_id),
    category:
      typeof input.payload.category === "string"
        ? input.payload.category
        : "custom",
    rule_json: {
      ...input.payload,
      compatibility: {
        variantId: input.variant_id ?? null,
        version: input.version ?? 1,
      },
    } as Json,
  };

  const { data, error } = await supabase
    .from("chess_rules")
    .upsert(record, {
      onConflict: "rule_id",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[upsertRule] error", error);
    throw error;
  }
  return data;
}
