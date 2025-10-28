// supabase/functions/generate-chess-rule/index.ts
// GROQ-ONLY hardened edge function

// ---------- Utils ----------
const DEFAULT_TIMEOUT = Number(Deno.env.get("AI_REQUEST_TIMEOUT") || "15000");

function timeoutPromise(ms: number, msg = "timeout") {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
}

function snippet(s: string, n = 2000) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function ensureUUID(v?: string) {
  if (v && isUUID(v)) return v;
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;
  const hex = Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function nowISO() {
  return new Date().toISOString();
}

function cleanFences(t: string) {
  return t
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
}

function extractJsonBlock(txt: string) {
  const re = /(\{[\s\S]*\}|\[[\s\S]*\])/g;
  const matches = [...txt.matchAll(re)].map((m) => m[0]);
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.length - a.length);
  for (const block of matches) {
    try {
      return JSON.parse(block);
    } catch (_error) {
      continue;
    }
  }
  return null;
}

// ---------- CORS ----------
const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "apikey",
  "X-Client-Info",
  "x-client-info",
  "Prefer",
].join(", ");

const defaultCors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
};

// ---------- Prompting ----------
function makeEnrichedPrompt(userPrompt: string) {
  return `Tu es un expert en création de variantes de jeu d'échecs.
Génère une règle complète et détaillée pour une partie d'échecs basée sur cette idée : "${userPrompt}"

IMPORTANT : Réponds UNIQUEMENT avec un objet JSON valide suivant EXACTEMENT ce schéma :
{
  "id": "string (UUID)",
  "created_at": "string (ISO 8601 date)",
  "prompt": "string (le prompt original de l'utilisateur)",
  "rules": [
    {
      "id": "string (identifiant unique)",
      "title": "string (titre court)",
      "description": "string (description détaillée)",
      "metadata": {
        "category": "string",
        "pieces_affected": ["array of strings"],
        "difficulty": "string",
        "impact": "string"
      }
    }
  ]
}

Consignes: crée 2-4 règles, descriptions 3-5 phrases, jouables, pas de texte hors JSON.`;
}

// ---------- Types ----------
type Rule = {
  id?: string;
  title?: string;
  description?: string;
  metadata?: {
    category?: string;
    pieces_affected?: string[];
    difficulty?: string;
    impact?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

type ModelShape = {
  id?: string;
  created_at?: string;
  prompt?: string;
  rules?: Rule[];
  [k: string]: unknown;
};

// ---------- Normalisation/Validation souple ----------
function normalizeAndValidate(
  modelJson: unknown,
  userPrompt: string,
): ModelShape {
  const obj: ModelShape =
    typeof modelJson === "string"
      ? (() => {
          try {
            return JSON.parse(modelJson);
          } catch {
            const extracted = extractJsonBlock(modelJson);
            if (!extracted) throw new Error("invalid_json");
            return extracted;
          }
        })()
      : (modelJson as ModelShape);

  const genericObj = (obj ?? {}) as Record<string, unknown>;

  const out: ModelShape = {
    id: ensureUUID(obj?.id),
    created_at:
      obj?.created_at && !isNaN(Date.parse(obj.created_at))
        ? obj.created_at
        : nowISO(),
    prompt: obj?.prompt || userPrompt || "",
    rules: Array.isArray(obj?.rules) && obj.rules.length > 0 ? obj.rules : [],
  };

  if (!out.rules || out.rules.length === 0) {
    const maybeRule: Rule = {
      id: ensureUUID(),
      title:
        typeof genericObj.title === "string"
          ? (genericObj.title as string)
          : "Règle",
      description:
        typeof genericObj.description === "string"
          ? (genericObj.description as string)
          : "Description manquante.",
      metadata: {
        category: "spécial",
        pieces_affected: [],
        difficulty: "moyen",
        impact: "modéré",
      },
    };
    out.rules = [maybeRule];
  }

  out.rules = out.rules.map((r, idx) => {
    const metadata = r?.metadata ?? {};
    const pieces = Array.isArray(metadata.pieces_affected)
      ? metadata.pieces_affected
      : [];

    const normalizedMetadata = {
      ...(metadata as Record<string, unknown>),
      category:
        typeof metadata.category === "string" &&
        metadata.category.trim().length > 0
          ? metadata.category
          : "spécial",
      pieces_affected: pieces,
      difficulty:
        typeof metadata.difficulty === "string" &&
        metadata.difficulty.trim().length > 0
          ? metadata.difficulty
          : "moyen",
      impact:
        typeof metadata.impact === "string" && metadata.impact.trim().length > 0
          ? metadata.impact
          : "modéré",
    };

    return {
      ...r,
      id: ensureUUID(r?.id || undefined),
      title: r?.title || `Règle ${idx + 1}`,
      description: r?.description || "Description manquante.",
      metadata: normalizedMetadata,
    };
  });

  return out;
}

// ---------- Mock ----------
function buildMock(userPrompt: string) {
  return {
    id: ensureUUID(),
    created_at: nowISO(),
    prompt: userPrompt,
    rules: [
      {
        id: ensureUUID(),
        title: "Mines fantômes",
        description:
          "À leur premier déplacement, les pions déposent une « mine fantôme » sur la case quittée. Une pièce adverse qui termine dessus est immobilisée un tour. Une seule mine par case. Le roi dissipe la mine s'il s'y arrête.",
        metadata: {
          category: "piège",
          pieces_affected: ["pion", "roi"],
          difficulty: "moyen",
          impact: "modéré",
        },
      },
      {
        id: ensureUUID(),
        title: "Fou balistique",
        description:
          "Chaque fou peut, une fois par partie, neutraliser une pièce située sur sa diagonale au lieu de se déplacer. La cible saute son prochain tour. Ne traverse pas les pièces et ne fonctionne pas sur le roi.",
        metadata: {
          category: "spécial",
          pieces_affected: ["fou"],
          difficulty: "moyen",
          impact: "significatif",
        },
      },
    ],
  };
}

// ---------- GROQ adapter ----------
async function callGroq(url: string, key: string, enrichedPrompt: string) {
  const body = {
    model: Deno.env.get("GROQ_MODEL") || "mixtral-8x7b-32768",
    messages: [
      { role: "system", content: "Réponds uniquement en JSON." },
      { role: "user", content: enrichedPrompt },
    ],
    max_tokens: 1200,
    temperature: 0.7,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`GROQ ${res.status}: ${snippet(raw)}`);
  try {
    const parsed = JSON.parse(raw);
    return cleanFences(
      parsed?.choices?.[0]?.message?.content ??
        parsed?.choices?.[0]?.text ??
        raw,
    );
  } catch {
    return cleanFences(raw);
  }
}

// ---------- HTTP handler (GROQ only) ----------
Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...defaultCors, "Access-Control-Max-Age": "3600" },
      });
    }

    // Auth minimale côté edge (transmets anon key ou JWT user depuis le front)
    const auth = req.headers.get("authorization");
    if (!auth) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_authorization" }),
        {
          status: 401,
          headers: { ...defaultCors, "Content-Type": "application/json" },
        },
      );
    }

    const url = new URL(req.url);
    const forceMock =
      url.searchParams.get("test") === "true" ||
      Deno.env.get("TEST_AI_MOCK") === "true";

    const bodyJson = await req.json().catch(() => ({}));
    const userPrompt: string = bodyJson.prompt || bodyJson.message || "";
    const enrichedPrompt = makeEnrichedPrompt(userPrompt);

    const groqKey = Deno.env.get("GROQ_API_KEY");
    const groqUrl =
      Deno.env.get("GROQ_API_URL") ||
      "https://api.groq.com/openai/v1/chat/completions";

    // Mode mock si clé manquante ou test explicite
    if (!groqKey || forceMock) {
      const mock = buildMock(userPrompt);
      console.info("MOCK response used (GROQ disabled or test=true)");
      return new Response(
        JSON.stringify({ ok: true, provider: "MOCK", data: mock }),
        {
          status: 200,
          headers: { ...defaultCors, "Content-Type": "application/json" },
        },
      );
    }

    let lastError: unknown = null;
    const timeoutMs = Number(
      Deno.env.get("AI_REQUEST_TIMEOUT") || DEFAULT_TIMEOUT,
    );

    try {
      console.info(`Calling GROQ url=${groqUrl}`);
      const candidateText = (await Promise.race([
        callGroq(groqUrl, groqKey, enrichedPrompt),
        timeoutPromise(timeoutMs, "ai_provider_timeout"),
      ])) as string;

      console.info(`GROQ candidate length=${candidateText?.length ?? 0}`);
      const normalized = normalizeAndValidate(candidateText, userPrompt);

      return new Response(
        JSON.stringify({ ok: true, provider: "GROQ", data: normalized }),
        {
          status: 200,
          headers: { ...defaultCors, "Content-Type": "application/json" },
        },
      );
    } catch (err) {
      console.error("GROQ call failed", { error: String(err) });
      lastError = { provider: "GROQ", error: String(err) };
    }

    // Fallback final
    if (Deno.env.get("ALLOW_MOCK_ON_FAILURE") === "true") {
      const mock = buildMock(userPrompt);
      console.warn("GROQ failed → returning MOCK due to ALLOW_MOCK_ON_FAILURE");
      return new Response(
        JSON.stringify({
          ok: true,
          provider: "MOCK",
          data: mock,
          fallback: true,
          detail: lastError,
        }),
        {
          status: 200,
          headers: { ...defaultCors, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "groq_failed", detail: lastError }),
      {
        status: 502,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unhandled error", String(err));
    return new Response(
      JSON.stringify({
        ok: false,
        error: "internal_error",
        detail: String(err),
      }),
      {
        status: 500,
        headers: { ...defaultCors, "Content-Type": "application/json" },
      },
    );
  }
});
