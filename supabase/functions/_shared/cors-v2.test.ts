import { handlePreflight, jsonResponse } from "./cors-v2.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const withAllowedOrigins = (value: string | null, run: () => void) => {
  const previous = Deno.env.get("ALLOWED_ORIGINS");
  try {
    if (value === null) {
      Deno.env.delete("ALLOWED_ORIGINS");
    } else {
      Deno.env.set("ALLOWED_ORIGINS", value);
    }
    run();
  } finally {
    if (previous === undefined) {
      Deno.env.delete("ALLOWED_ORIGINS");
    } else {
      Deno.env.set("ALLOWED_ORIGINS", previous);
    }
  }
};

Deno.test({
  name: "CORS V2 refuse toute origine navigateur sans allowlist",
  permissions: { env: true },
  fn: () => {
    withAllowedOrigins(null, () => {
      const response = handlePreflight(
        new Request("https://edge.example.test", {
          method: "POST",
          headers: {
            Origin: "https://app.example.test",
          },
        }),
      );

      assert(
        response?.status === 403,
        "Une origine non configurée doit être refusée.",
      );
      assert(
        response.headers.get("Access-Control-Allow-Origin") === null,
        "Une origine refusée ne doit jamais être reflétée.",
      );
    });
  },
});

Deno.test({
  name: "CORS V2 reflète seulement une origine exacte autorisée",
  permissions: { env: true },
  fn: () => {
    withAllowedOrigins("https://app.example.test", () => {
      const request = new Request("https://edge.example.test", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.example.test",
        },
      });
      const response = handlePreflight(request);

      assert(response?.status === 204, "Le preflight autorisé doit réussir.");
      assert(
        response.headers.get("Access-Control-Allow-Origin") ===
          "https://app.example.test",
        "L'origine exacte doit être reflétée.",
      );

      const error = jsonResponse(
        new Request("https://edge.example.test", {
          headers: {
            Origin: "https://app.example.test",
          },
        }),
        400,
        { success: false },
      );
      assert(
        error.headers.get("Access-Control-Allow-Origin") ===
          "https://app.example.test",
        "Les erreurs doivent conserver les en-têtes CORS autorisés.",
      );
    });
  },
});

Deno.test({
  name: "CORS V2 n'autorise localhost que lorsqu'il est explicite",
  permissions: { env: true },
  fn: () => {
    const localhostRequest = () =>
      new Request("https://edge.example.test", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
        },
      });

    withAllowedOrigins("https://app.example.test", () => {
      assert(
        handlePreflight(localhostRequest())?.status === 403,
        "localhost ne doit pas être implicite.",
      );
    });

    withAllowedOrigins("http://localhost:5173", () => {
      assert(
        handlePreflight(localhostRequest())?.status === 204,
        "localhost explicite doit être autorisé.",
      );
    });
  },
});
