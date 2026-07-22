export interface GuidanceTokenPayload {
  version: 1;
  userId: string;
  issuedAt: number;
  expiresAt: number;
  originalPrompt: string;
  guidance: Record<string, unknown>;
}

const MAX_TOKEN_LENGTH = 60_000;
const TOKEN_TTL_SECONDS = 60 * 60;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const signingSecret = (): string => {
  const value =
    Deno.env.get("RULE_GUIDANCE_SIGNING_SECRET")?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!value) throw new Error("GUIDANCE_SIGNING_SECRET_MISSING");
  if (value.length < 32) throw new Error("GUIDANCE_SIGNING_SECRET_INVALID");
  return value;
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
};

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("GUIDANCE_TOKEN_ENCODING_INVALID");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const importSigningKey = async (): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

export async function issueGuidanceToken(input: {
  userId: string;
  originalPrompt: string;
  guidance: Record<string, unknown>;
  nowSeconds?: number;
}): Promise<string> {
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: GuidanceTokenPayload = {
    version: 1,
    userId: input.userId,
    issuedAt,
    expiresAt: issuedAt + TOKEN_TTL_SECONDS,
    originalPrompt: input.originalPrompt,
    guidance: input.guidance,
  };
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyGuidanceToken(input: {
  token: string;
  userId: string;
  nowSeconds?: number;
}): Promise<GuidanceTokenPayload> {
  if (!input.token || input.token.length > MAX_TOKEN_LENGTH) {
    throw new Error("GUIDANCE_TOKEN_INVALID");
  }
  const parts = input.token.split(".");
  if (parts.length !== 2) throw new Error("GUIDANCE_TOKEN_INVALID");
  const [encodedPayload, encodedSignature] = parts;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await importSigningKey(),
    fromBase64Url(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );
  if (!valid) throw new Error("GUIDANCE_TOKEN_SIGNATURE_INVALID");

  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload)),
    );
  } catch {
    throw new Error("GUIDANCE_TOKEN_PAYLOAD_INVALID");
  }
  if (!isRecord(decoded) || !isRecord(decoded.guidance)) {
    throw new Error("GUIDANCE_TOKEN_PAYLOAD_INVALID");
  }

  const payload = decoded as unknown as GuidanceTokenPayload;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    payload.version !== 1 ||
    payload.userId !== input.userId ||
    typeof payload.originalPrompt !== "string" ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > now + 60 ||
    payload.expiresAt <= now ||
    payload.expiresAt - payload.issuedAt !== TOKEN_TTL_SECONDS
  ) {
    throw new Error("GUIDANCE_TOKEN_CLAIMS_INVALID");
  }

  return payload;
}
