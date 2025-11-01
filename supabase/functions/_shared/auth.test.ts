import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_ENV_KEYS = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_REFERENCE_ID",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_REF",
  "VITE_SUPABASE_REFERENCE_ID",
  "SUPABASE_PROJECT_NAME",
  "VITE_SUPABASE_PROJECT_NAME",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE",
  "SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "VITE_ANON_KEY",
];

type AuthModule = typeof import("./auth.ts");

type TestEnv = Record<string, string | undefined>;

const resetGlobalDiagnostics = () => {
  const scope = globalThis as Record<string, unknown>;
  delete scope.__LOVABLE_CLOUD_SUPABASE_DIAGNOSTICS__;
  delete scope.__LOVABLE_CLOUD_SUPABASE_LOGGED__;
};

const withAuthModule = async (
  env: TestEnv,
  assertions: (mod: AuthModule) => Promise<void> | void,
) => {
  const originalEnv = new Map<string, string | undefined>();

  for (const key of SUPABASE_ENV_KEYS) {
    originalEnv.set(key, Deno.env.get(key) ?? undefined);
    try {
      Deno.env.delete(key);
    } catch (_error) {
      // Ignore environments where delete may not be supported.
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      Deno.env.set(key, value);
    }
  }

  resetGlobalDiagnostics();

  try {
    const mod = await import(`./auth.ts?test=${crypto.randomUUID()}`);
    await assertions(mod);
  } finally {
    resetGlobalDiagnostics();

    for (const key of SUPABASE_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        try {
          Deno.env.delete(key);
        } catch (_error) {
          // Ignore environments where delete may not be supported.
        }
      } else {
        Deno.env.set(key, value);
      }
    }
  }
};

Deno.test(
  "authenticateRequest grants guest access when publishable key is provided via headers",
  async () => {
    await withAuthModule({}, async (auth) => {
      const request = new Request("https://example.test", {
        headers: {
          Authorization: "Bearer publishable-token",
          apikey: "publishable-token",
        },
      });

      const result = await auth.authenticateRequest(request);

      assert(result.success);
      assertEquals(result.user, null);
      assertEquals(result.isGuest, true);
    });
  },
);

Deno.test(
  "authenticateRequest falls back to 500 when publishable credentials are absent",
  async () => {
    await withAuthModule({}, async (auth) => {
      const request = new Request("https://example.test", {
        headers: {
          Authorization: "Bearer some-other-token",
        },
      });

      const result = await auth.authenticateRequest(request);

      assertEquals(result.success, false);
      if (!result.success) {
        assertEquals(result.status, 500);
        assertEquals(result.error, "Supabase client misconfigured");
      }
    });
  },
);

Deno.test(
  "authenticateRequest recognizes configured publishable keys when service role is missing",
  async () => {
    await withAuthModule({ SUPABASE_ANON_KEY: "anon-123" }, async (auth) => {
      const request = new Request("https://example.test", {
        headers: {
          Authorization: "Bearer anon-123",
        },
      });

      const result = await auth.authenticateRequest(request);

      assert(result.success);
      assertEquals(result.user, null);
      assertEquals(result.isGuest, true);
    });
  },
);
