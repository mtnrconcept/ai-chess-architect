import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let validatePublicSupabaseKey: (value: string | undefined) => string | null;
let validatePublicSupabaseTarget: (input: {
  url: string | undefined;
  projectId?: string;
  customHost?: string;
}) => string[];

beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://testprojectref12345.supabase.co");
  vi.stubEnv(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  );
  vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "testprojectref12345");
  ({ validatePublicSupabaseKey, validatePublicSupabaseTarget } = await import(
    "./client"
  ));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const jwtForRole = (role: string): string => {
  const payload = globalThis
    .btoa(JSON.stringify({ role }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
};

describe("validatePublicSupabaseKey", () => {
  it("accepts publishable and legacy anon keys", () => {
    expect(
      validatePublicSupabaseKey("sb_publishable_abcdefghijklmnopqrstuvwxyz"),
    ).toBeNull();
    expect(validatePublicSupabaseKey(jwtForRole("anon"))).toBeNull();
  });

  it("rejects privileged browser keys", () => {
    expect(
      validatePublicSupabaseKey("sb_secret_abcdefghijklmnopqrstuvwxyz"),
    ).toContain("privilégiée");
    expect(validatePublicSupabaseKey(jwtForRole("service_role"))).toContain(
      "n'est pas une clé anon",
    );
  });
});

describe("validatePublicSupabaseTarget", () => {
  const projectId = "abcdefghijklmnopqrst";

  it.each([
    {
      name: "an exact hosted project target",
      input: {
        url: `https://${projectId}.supabase.co`,
        projectId,
      },
    },
    {
      name: "an HTTP localhost target",
      input: {
        url: "http://localhost:54321",
      },
    },
    {
      name: "an HTTP IPv4 loopback target",
      input: {
        url: "http://127.0.0.1:54321",
      },
    },
    {
      name: "an HTTP IPv6 loopback target",
      input: {
        url: "http://[::1]:54321",
      },
    },
    {
      name: "an explicitly confirmed custom host",
      input: {
        url: "https://rules.example.dev",
        customHost: "rules.example.dev",
      },
    },
  ])("accepts $name", ({ input }) => {
    expect(validatePublicSupabaseTarget(input)).toEqual([]);
  });

  it.each([
    {
      name: "HTTP outside localhost",
      input: {
        url: `http://${projectId}.supabase.co`,
        projectId,
      },
      expected: "HTTPS hors localhost",
    },
    {
      name: "a hosted target without an explicit project id",
      input: {
        url: `https://${projectId}.supabase.co`,
      },
      expected: "VITE_SUPABASE_PROJECT_ID est obligatoire",
    },
    {
      name: "a hosted target with a different project id",
      input: {
        url: `https://${projectId}.supabase.co`,
        projectId: "uvwxyzabcdefghijklmn",
      },
      expected: "ne correspond pas exactement",
    },
    {
      name: "a custom target without an explicit host",
      input: {
        url: "https://supabase.chess.test",
      },
      expected: "VITE_SUPABASE_CUSTOM_HOST est obligatoire",
    },
    {
      name: "a custom target with a different host",
      input: {
        url: "https://supabase.chess.test",
        customHost: "attacker.chess.test",
      },
      expected: "ne correspond pas exactement",
    },
    {
      name: "a hostname containing a hosted project suffix",
      input: {
        url: `https://${projectId}.supabase.co.attacker.test`,
        projectId,
      },
      expected: "VITE_SUPABASE_CUSTOM_HOST est obligatoire",
    },
    {
      name: "an invalid hosted project reference",
      input: {
        url: "https://short.supabase.co",
        projectId: "short",
      },
      expected: "référence de projet Supabase invalide",
    },
    {
      name: "embedded URL credentials",
      input: {
        url: `https://user:secret@${projectId}.supabase.co`,
        projectId,
      },
      expected: "sans identifiants",
    },
  ])("rejects $name", ({ input, expected }) => {
    expect(validatePublicSupabaseTarget(input).join(" ")).toContain(expected);
  });
});
