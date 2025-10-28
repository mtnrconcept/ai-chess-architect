// supabase/functions/generate-chess-rule/index.ts
// --- GROQ-ONLY, JSON racine, CORS strict, mock optionnel ---
const DEFAULT_TIMEOUT = Number(Deno.env.get("AI_REQUEST_TIMEOUT") || "10000");
function timeoutPromise(ms, msg = "timeout") {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
}
function snippet(s, n = 2000) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}
const defaultCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

function buildSuccessResponse(result: unknown) {
  return new Response(
    JSON.stringify({
      ok: true,
      result,
    }),
    {
      status: 200,
      headers: {
        ...defaultCors,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

function buildErrorResponse(error: string, details?: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      ok: false,
      error,
      details,
    }),
    {
      status,
      headers: {
        ...defaultCors,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
function buildMock(userPrompt) {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    prompt: userPrompt,
    rules: [
      {
        id: "r1",
        title: "Tir royal",
        description:
          "La reine peut tirer une fois par partie sur une case à portée de tour. La case devient inutilisable pendant un tour. Le roi adverse ne peut pas être pris par un tir.",
        metadata: {
          category: "spécial",
          pieces_affected: ["reine"],
          difficulty: "moyen",
          impact: "modéré",
        },
      },
      {
        id: "r2",
        title: "Reine surchauffe",
        description:
          "Après un tir, la reine ne peut plus se déplacer au tour suivant (surchauffe). Elle retrouve toutes ses capacités ensuite.",
        metadata: {
          category: "contrainte",
          pieces_affected: ["reine"],
          difficulty: "facile",
          impact: "mineur",
        },
      },
    ],
  };
}
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...defaultCors,
        "Access-Control-Max-Age": "3600",
      },
    });
  }
  // Auth facultative (garde si tu veux imposer un JWT Supabase)
  const auth = req.headers.get("authorization");
  if (!auth) {
    return buildErrorResponse("missing_authorization", null, 401);
  }
  try {
    const url = new URL(req.url);
    const test = url.searchParams.get("test") === "true";
    const body = await req.json().catch(() => ({}));
    const conversation = Array.isArray(body.conversation)
      ? body.conversation.filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            typeof entry.role === "string" &&
            typeof entry.content === "string",
        )
      : [];
    const lastUserMessage = [...conversation]
      .reverse()
      .find((entry) => entry.role === "user");
    const fallbackPrompt =
      typeof body.prompt === "string"
        ? body.prompt
        : typeof body.message === "string"
          ? body.message
          : typeof lastUserMessage?.content === "string"
            ? lastUserMessage.content
            : "";
    const userPrompt = fallbackPrompt;
    // Prompt enrichi + consigne "JSON only"
    const enrichedPrompt = [
      "Tu es un expert en création de variantes d'échecs.",
      `Idée utilisateur: "${userPrompt}"`,
      "Génère UNIQUEMENT un objet JSON valide respectant strictement ce schéma:",
      "{",
      '  "id": "string (UUID)",',
      '  "created_at": "string (ISO 8601)",',
      '  "prompt": "string",',
      '  "rules": [',
      '    { "id":"string", "title":"string", "description":"string", "metadata":{',
      '      "category":"string", "pieces_affected":["string"], "difficulty":"string", "impact":"string"',
      "    }}",
      "  ]",
      "}",
      "Crée 2 à 4 règles, descriptions 3 à 5 phrases, jouables, pas de texte hors JSON.",
    ].join("\n");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const timeoutMs = DEFAULT_TIMEOUT;
    // Mode mock si test=true ou clé absente
    if (test || !groqKey) {
      console.info("MOCK response used (GROQ disabled or test=true)");
      const latestUserMessage = lastUserMessage?.content ?? userPrompt ?? "";
      const promptValue =
        typeof latestUserMessage === "string" && latestUserMessage.trim().length
          ? latestUserMessage.trim()
          : "";
      const mock = buildMock(latestUserMessage);
      const result = {
        status: "ready" as const,
        rule: mock,
        prompt: promptValue,
        promptHash: undefined,
        rawModelResponse: {
          model: "mock",
          text: JSON.stringify(mock),
        },
        provider: "mock",
        correlationId: crypto.randomUUID(),
      };
      return buildSuccessResponse(result);
    }
    // ---- GROQ call (OpenAI-compatible) ----
    const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
    const conversationMessages = (() => {
      if (!conversation.length) {
        return userPrompt
          ? [
              {
                role: "user",
                content: enrichedPrompt,
              },
            ]
          : [];
      }
      const normalized = conversation.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));
      const lastUserIndex = [...normalized]
        .map((entry, index) => ({ entry, index }))
        .reverse()
        .find(({ entry }) => entry.role === "user")?.index;
      if (typeof lastUserIndex === "number") {
        normalized[lastUserIndex] = {
          role: "user",
          content: enrichedPrompt,
        };
      } else if (userPrompt) {
        normalized.push({ role: "user", content: enrichedPrompt });
      }
      return normalized;
    })();

    const reqBody = {
      model: "llama-3.1-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "Réponds uniquement avec un JSON valide. Aucun texte hors JSON.",
        },
        ...conversationMessages,
      ],
      temperature: 0.7,
      max_tokens: 1200,
    };
    console.info("Calling GROQ", {
      url: groqUrl,
      model: reqBody.model,
    });
    const fetchPromise = fetch(groqUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });
    const res = await Promise.race([
      fetchPromise,
      timeoutPromise(timeoutMs, "ai_provider_timeout"),
    ]);
    const status = res.status;
    const raw = await res.text();
    if (!res.ok) {
      console.error("GROQ http error", {
        status,
        bodySnippet: snippet(raw),
      });
      return buildErrorResponse("groq_http_error", {
        status,
        detail: snippet(raw),
      });
    }
    // Tentative de parse
    let candidateText = raw;
    try {
      const parsedTop = JSON.parse(raw);
      candidateText =
        parsedTop?.choices?.[0]?.message?.content ??
        parsedTop?.choices?.[0]?.text ??
        candidateText;
    } catch {
      // Le top-level n'est pas JSON (peu probable ici), on garde raw
    }
    // Nettoyage éventuel des fences ```json
    candidateText = candidateText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    // Extraction JSON robuste
    function extractJson(txt) {
      const objects = [];
      const re = /\{[\s\S]*\}|\[[\s\S]*\]/g;
      let m;
      while ((m = re.exec(txt)) !== null) objects.push(m[0]);
      if (!objects.length) return null;
      // privilégier le plus gros bloc
      objects.sort((a, b) => b.length - a.length);
      for (const o of objects) {
        try {
          return JSON.parse(o);
        } catch (_e) {
          continue;
        }
      }
      return null;
    }
    let normalized = null;
    try {
      normalized = JSON.parse(candidateText);
    } catch {
      normalized = extractJson(candidateText);
    }
    if (!normalized) {
      console.error("invalid_json_from_model", {
        bodySnippet: snippet(candidateText),
      });
      return buildErrorResponse("invalid_json_from_model", {
        bodySnippet: snippet(candidateText),
      });
    }
    // Validation minimale
    const errors = [];
    if (!normalized.id) errors.push("missing id");
    if (!normalized.created_at) errors.push("missing created_at");
    if (!normalized.prompt) errors.push("missing prompt");
    if (!Array.isArray(normalized.rules) || normalized.rules.length === 0)
      errors.push("rules empty");
    if (errors.length) {
      console.error("validation_errors", {
        errors,
        bodySnippet: snippet(JSON.stringify(normalized)),
      });
      return buildErrorResponse("validation_failed", { errors });
    }
    const normalizedRecord =
      normalized && typeof normalized === "object" ? normalized : {};
    const promptValue = (() => {
      if (typeof userPrompt === "string" && userPrompt.trim().length > 0) {
        return userPrompt.trim();
      }
      const embeddedPrompt =
        typeof (normalizedRecord as { prompt?: unknown }).prompt === "string"
          ? (normalizedRecord as { prompt?: string }).prompt
          : undefined;
      if (embeddedPrompt && embeddedPrompt.trim().length > 0) {
        return embeddedPrompt.trim();
      }
      return "";
    })();

    const promptHashValue = (() => {
      const candidate =
        (normalizedRecord as { promptHash?: unknown }).promptHash ??
        (normalizedRecord as { prompt_hash?: unknown }).prompt_hash;
      return typeof candidate === "string" && candidate.trim().length > 0
        ? candidate.trim()
        : null;
    })();

    const result = {
      status: "ready" as const,
      rule: normalizedRecord,
      prompt: promptValue,
      promptHash: promptHashValue ?? undefined,
      rawModelResponse: {
        model: reqBody.model,
        text: candidateText,
        status,
      },
      provider: "groq",
      correlationId: crypto.randomUUID(),
    };

    // ✅ SUCCÈS : renvoie la structure attendue par le frontend
    return buildSuccessResponse(result);
  } catch (err) {
    console.error("Unhandled error", String(err));
    return buildErrorResponse("internal_error", String(err), 500);
  }
});
