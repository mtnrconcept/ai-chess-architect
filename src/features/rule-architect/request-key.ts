const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bytesToUuid = (bytes: Uint8Array): string => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

export const createRequestKey = (): string => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error(
      "Ce navigateur ne permet pas de générer une clé de requête sûre.",
    );
  }

  if (typeof cryptoApi.randomUUID === "function") {
    const requestKey = cryptoApi.randomUUID();
    if (UUID_PATTERN.test(requestKey)) {
      return requestKey;
    }
  }

  if (typeof cryptoApi.getRandomValues === "function") {
    return bytesToUuid(cryptoApi.getRandomValues(new Uint8Array(16)));
  }

  throw new Error(
    "Ce navigateur ne permet pas de générer une clé de requête sûre.",
  );
};
