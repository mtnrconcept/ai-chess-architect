import type { Tables } from "@/integrations/supabase/types";

export type IntegrationCategory = Tables<"api_registry">["category"];

export interface IntegrationHealthResult {
  id: string;
  service: string;
  category: IntegrationCategory;
  target: string;
  ok: boolean;
  error: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  details: Record<string, unknown> | null;
  notes: string | null;
  checkedAt: string;
}

export interface IntegrationHealthSummary {
  total: number;
  ok: number;
  failed: number;
}

export interface IntegrationHealthResponse {
  checkedAt: string;
  summary: IntegrationHealthSummary;
  results: IntegrationHealthResult[];
}
