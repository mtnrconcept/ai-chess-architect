import type { FxIntent, FxPayload } from "./types";

export const FX_RUNTIME_EVENT = "ai-chess:fx:v1" as const;
const MAX_INTENTS_PER_EVENT = 32;

type RuntimeFxDetail = {
  intents: FxIntent[];
  payload: FxPayload;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseDetail = (value: unknown): RuntimeFxDetail | null => {
  if (!isRecord(value) || !Array.isArray(value.intents)) return null;
  if (
    value.intents.length === 0 ||
    value.intents.length > MAX_INTENTS_PER_EVENT ||
    value.intents.some(
      (intent) => !isRecord(intent) || typeof intent.intent !== "string",
    )
  ) {
    return null;
  }

  return {
    intents: value.intents as FxIntent[],
    payload: isRecord(value.payload) ? (value.payload as FxPayload) : {},
  };
};

export const dispatchRuntimeFxEvent = (
  intents: FxIntent[] | undefined,
  payload: FxPayload = {},
): void => {
  if (
    typeof window === "undefined" ||
    !Array.isArray(intents) ||
    intents.length === 0 ||
    intents.length > MAX_INTENTS_PER_EVENT
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(FX_RUNTIME_EVENT, {
      detail: {
        intents,
        payload,
      } satisfies RuntimeFxDetail,
    }),
  );
};

export const subscribeRuntimeFxEvents = (
  callback: (intents: FxIntent[], payload: FxPayload) => void,
): (() => void) => {
  if (typeof window === "undefined") return () => undefined;

  const listener: EventListener = (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = parseDetail(event.detail);
    if (!detail) return;
    callback(detail.intents, detail.payload);
  };

  window.addEventListener(FX_RUNTIME_EVENT, listener);
  return () => window.removeEventListener(FX_RUNTIME_EVENT, listener);
};
