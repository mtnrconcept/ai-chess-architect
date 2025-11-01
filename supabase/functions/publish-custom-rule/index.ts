import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.2?target=deno";
import { jsonResponse, preflightIfOptions } from "../_shared/cors.ts";

interface RulePayload {
  rule_name: string;
  description?: string | null;
  rule_json: unknown;
  category?: string;
  rule_id?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "publish-custom-rule: Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars",
  );
}

serve(async (req) => {
  const preflight = preflightIfOptions(req);
  if (preflight) {
    return preflight;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, req);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "missing_authorization" }, 401, req);
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      const message = userError?.message ?? "authentication_failed";
      return jsonResponse({ error: message }, 401, req);
    }

    const payload = (await req.json()) as RulePayload;

    if (!payload?.rule_name || !payload.rule_json) {
      return jsonResponse({ error: "missing_required_fields (rule_name, rule_json)" }, 400, req);
    }

    // Extract rule_id from rule_json if available
    const ruleJson = payload.rule_json as Record<string, unknown>;
    const metaData = ruleJson?.meta as Record<string, unknown> | undefined;
    const ruleId = payload.rule_id || (metaData?.key as string) || `custom-${Date.now()}`;
    const category = payload.category || (metaData?.category as string) || "custom";

    const { data, error } = await supabaseClient
      .from("chess_rules")
      .insert({
        created_by: user.id,
        rule_id: ruleId,
        rule_name: payload.rule_name,
        description: payload.description || metaData?.description as string || "",
        category: category,
        rule_json: payload.rule_json,
        source: "custom",
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("publish-custom-rule insert error", error);
      return jsonResponse({ error: error.message }, 400, req);
    }

    return jsonResponse(data, 201, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("publish-custom-rule unexpected error", message);
    return jsonResponse({ error: message }, 400, req);
  }
});
