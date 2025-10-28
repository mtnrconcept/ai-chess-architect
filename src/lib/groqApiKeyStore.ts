const STORAGE_KEY = "voltus.groq_api_key";

type Listener = (value: string | null) => void;

let cachedValue: string | null | undefined;
const listeners = new Set<Listener>();
let storageListenerAttached = false;

const isBrowser = () =>
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function";

const normalise = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readFromStorage = (): string | null => {
  if (!isBrowser()) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return normalise(stored);
  } catch (_error) {
    return null;
  }
};

const writeToStorage = (value: string | null) => {
  if (!isBrowser()) {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (_error) {
    // Ignore storage errors (e.g. private mode) to avoid crashing the UI.
  }
};

const notify = (value: string | null) => {
  for (const listener of listeners) {
    listener(value);
  }
};

const ensureStorageListener = () => {
  if (storageListenerAttached || !isBrowser()) {
    return;
  }

  storageListenerAttached = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    const nextValue = normalise(event.newValue);
    cachedValue = nextValue;
    notify(nextValue);
  });
};

export const getGroqApiKey = (): string | null => {
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  cachedValue = readFromStorage();
  ensureStorageListener();
  return cachedValue;
};

export const setGroqApiKey = (value: string | null | undefined) => {
  const normalised = normalise(value);
  cachedValue = normalised;
  writeToStorage(normalised);
  notify(normalised);
};

export const subscribeToGroqApiKey = (listener: Listener) => {
  listeners.add(listener);
  ensureStorageListener();

  listener(getGroqApiKey());

  return () => {
    listeners.delete(listener);
  };
};

export const resetGroqApiKeyStoreForTests = () => {
  cachedValue = null;
  listeners.clear();
  storageListenerAttached = false;
};
