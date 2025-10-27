import Stripe from "stripe";

import { getSupabaseServiceRoleClient } from "../_shared/auth.ts";
import { jsonResponse, preflightIfOptions } from "../_shared/cors.ts";

type ProcessResult = {
  handled: boolean;
  actions: string[];
  warnings: string[];
};

type UpsertResult = {
  ok: boolean;
  warning?: string;
};

const normaliseEnv = (value: string | undefined | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const stripeSecretKey = normaliseEnv(Deno.env.get("STRIPE_SECRET_KEY"));
const webhookSecret = normaliseEnv(Deno.env.get("STRIPE_WEBHOOK_SECRET"));

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = getSupabaseServiceRoleClient();

const corsOptions = { methods: ["POST"] } as const;

const logPrefix = "[stripe-webhook]";

const nullSupabaseWarning =
  "Client Supabase non initialisé (service role key manquante ?).";

const nowIso = () => new Date().toISOString();

const upsertInto = async (
  table: "payments" | "invoices",
  payload: Record<string, unknown>,
): Promise<UpsertResult> => {
  if (!supabase) {
    return { ok: false, warning: nullSupabaseWarning };
  }

  try {
    const { error } = await supabase.from(table).upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      return { ok: false, warning: `${table}: ${error.message}` };
    }

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    return { ok: false, warning: `${table}: ${message}` };
  }
};

const handleCheckoutSessionCompleted = async (
  event: Stripe.Event,
): Promise<ProcessResult> => {
  const actions: string[] = [];
  const warnings: string[] = [];

  if (!supabase) {
    warnings.push(nullSupabaseWarning);
    return { handled: false, actions, warnings };
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const paymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.id;

  const record = {
    id: paymentId,
    stripe_event_id: event.id,
    stripe_event_type: event.type,
    customer_id: typeof session.customer === "string" ? session.customer : null,
    customer_email: session.customer_details?.email ?? null,
    status: session.payment_status ?? session.status ?? null,
    amount_subtotal: session.amount_subtotal ?? null,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null,
    mode: session.mode ?? null,
    metadata: session.metadata ?? {},
    webhook_received_at: nowIso(),
  } satisfies Record<string, unknown>;

  const result = await upsertInto("payments", record);
  if (!result.ok && result.warning) {
    warnings.push(result.warning);
  }

  if (result.ok) {
    actions.push("payments");
  }

  return { handled: result.ok, actions, warnings };
};

const handleInvoiceEvent = async (
  event: Stripe.Event,
): Promise<ProcessResult> => {
  const actions: string[] = [];
  const warnings: string[] = [];

  if (!supabase) {
    warnings.push(nullSupabaseWarning);
    return { handled: false, actions, warnings };
  }

  const invoice = event.data.object as Stripe.Invoice;
  const invoiceId = invoice.id ?? `evt_${event.id}`;

  const record = {
    id: invoiceId,
    stripe_event_id: event.id,
    stripe_event_type: event.type,
    customer_id: typeof invoice.customer === "string" ? invoice.customer : null,
    status: invoice.status ?? null,
    amount_due: invoice.amount_due ?? null,
    amount_paid: invoice.amount_paid ?? null,
    amount_remaining: invoice.amount_remaining ?? null,
    currency: invoice.currency ?? null,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    metadata: invoice.metadata ?? {},
    webhook_received_at: nowIso(),
  } satisfies Record<string, unknown>;

  const result = await upsertInto("invoices", record);
  if (!result.ok && result.warning) {
    warnings.push(result.warning);
  }

  if (result.ok) {
    actions.push("invoices");
  }

  return { handled: result.ok, actions, warnings };
};

const processStripeEvent = async (
  event: Stripe.Event,
): Promise<ProcessResult> => {
  switch (event.type) {
    case "checkout.session.completed":
      return await handleCheckoutSessionCompleted(event);
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.finalized":
    case "invoice.payment_failed":
      return await handleInvoiceEvent(event);
    default:
      return { handled: false, actions: [], warnings: [] };
  }
};

export const config = { auth: false } as const;

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = preflightIfOptions(req, corsOptions);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405, req);
  }

  if (!stripe || !webhookSecret) {
    console.error(
      `${logPrefix} Stripe n'est pas configuré (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET).`,
    );
    return jsonResponse(
      { error: "Stripe n'est pas configuré côté serveur." },
      500,
      req,
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ error: "Signature Stripe manquante." }, 400, req);
  }

  let payload: string;
  try {
    payload = await req.text();
  } catch (error) {
    console.error(
      `${logPrefix} Impossible de lire le corps de la requête:`,
      error,
    );
    return jsonResponse({ error: "Corps de requête illisible." }, 400, req);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    console.error(`${logPrefix} Signature Stripe invalide:`, error);
    return jsonResponse({ error: "Signature Stripe invalide." }, 400, req);
  }

  const result = await processStripeEvent(event);

  const status = result.handled ? 200 : 202;

  return jsonResponse(
    {
      received: true,
      eventId: event.id,
      type: event.type,
      handled: result.handled,
      actions: result.actions,
      warnings: result.warnings,
    },
    status,
    req,
  );
});
