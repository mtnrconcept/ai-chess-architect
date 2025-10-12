import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

import { handleOptions, jsonResponse } from "../_shared/cors.ts";

type SupportedPlan = "starter" | "pro";
type BillingInterval = "monthly" | "yearly";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const defaultSiteUrl = (Deno.env.get("SITE_URL") ?? "https://ucaqbhmyutlnitnedowk.supabase.co").replace(/\/$/, "");

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

const priceMatrix: Record<SupportedPlan, Record<BillingInterval, string | undefined>> = {
  starter: {
    monthly: Deno.env.get("STRIPE_PRICE_STARTER_MONTHLY"),
    yearly: Deno.env.get("STRIPE_PRICE_STARTER_YEARLY"),
  },
  pro: {
    monthly: Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"),
    yearly: Deno.env.get("STRIPE_PRICE_PRO_YEARLY"),
  },
};

const requestSchema = z.object({
  planId: z.enum(["starter", "pro"]),
  billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
  quantity: z.number().int().min(1).max(50).optional().default(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata: z.record(z.string()).optional(),
});

const gatherPriceId = (plan: SupportedPlan, interval: BillingInterval) => priceMatrix[plan]?.[interval];

const normaliseUrl = (value: string | undefined, fallback: string) => {
  if (!value || value.trim().length === 0) return fallback;
  try {
    const url = new URL(value);
    return url.toString();
  } catch (_error) {
    return fallback;
  }
};

const buildBaseUrl = (req: Request) => {
  const origin = req.headers.get("Origin") ?? req.headers.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      parsed.pathname = "";
      parsed.hash = "";
      parsed.search = "";
      return parsed.toString().replace(/\/$/, "");
    } catch (_error) {
      return defaultSiteUrl;
    }
  }
  return defaultSiteUrl;
};

const warnIfMisconfigured = (plan: SupportedPlan, interval: BillingInterval) => {
  if (!stripeSecretKey) {
    console.error("[Stripe] Clé secrète manquante (STRIPE_SECRET_KEY).");
  }
  if (!gatherPriceId(plan, interval)) {
    console.error(`[Stripe] Price ID manquant pour ${plan} (${interval}).`);
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(
      req,
      { error: "Méthode non autorisée" },
      { status: 405, headers: { "Allow": "POST, OPTIONS" } },
    );
  }

  if (!stripe || !stripeSecretKey) {
    console.error("[Stripe] La clé secrète est absente. Configurez STRIPE_SECRET_KEY dans vos variables projet.");
    return jsonResponse(req, { error: "Stripe n'est pas configuré côté serveur." }, { status: 500 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse(req, { error: "Payload JSON invalide." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonResponse(req, { error: "Paramètres invalides.", details: parsed.error.flatten() }, { status: 422 });
  }

  const { planId, billingInterval, quantity, successUrl, cancelUrl, metadata } = parsed.data;

  const priceId = gatherPriceId(planId, billingInterval);
  if (!priceId) {
    warnIfMisconfigured(planId, billingInterval);
    return jsonResponse(
      req,
      { error: `Aucun prix Stripe configuré pour ${planId} (${billingInterval}).` },
      { status: 500 },
    );
  }

  const baseUrl = buildBaseUrl(req);
  const effectiveSuccessUrl = normaliseUrl(successUrl, `${baseUrl}/pricing?status=success&plan=${planId}`);
  const effectiveCancelUrl = normaliseUrl(cancelUrl, `${baseUrl}/pricing?status=cancelled&plan=${planId}`);

  const sessionMetadata = {
    planId,
    billingInterval,
    ...(metadata ?? {}),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      customer_creation: "always",
      automatic_tax: { enabled: true },
      success_url: effectiveSuccessUrl,
      cancel_url: effectiveCancelUrl,
      metadata: sessionMetadata,
      subscription_data: {
        metadata: sessionMetadata,
      },
    });

    return jsonResponse(req, { sessionId: session.id, url: session.url }, { status: 200 });
  } catch (error) {
    console.error("[Stripe] Échec de la création de session Checkout:", error);
    return jsonResponse(
      req,
      {
        error: "Impossible de créer la session Stripe.",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 502 },
    );
  }
});
