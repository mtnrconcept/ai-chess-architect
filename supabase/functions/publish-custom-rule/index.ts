import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.2?target=deno";
import { jsonResponse, preflightIfOptions } from "../_shared/cors.ts";

interface RulePayload {
  name: string;
  description?: string | null;
  rule_metadata: unknown;
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

    if (!payload?.name || !payload.rule_metadata) {
      return jsonResponse({ error: "missing_required_fields" }, 400, req);
    }

    const { data, error } = await supabaseClient
      .from("custom_rules")
      .insert({
        user_id: user.id,
        name: payload.name,
        description: payload.description ?? null,
        rule_metadata: payload.rule_metadata,
        status: "published",
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
