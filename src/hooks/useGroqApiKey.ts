import { useCallback, useEffect, useState } from "react";
import {
  getGroqApiKey,
  setGroqApiKey,
  subscribeToGroqApiKey,
} from "@/lib/groqApiKeyStore";

export const useGroqApiKey = () => {
  const [groqApiKey, setGroqApiKeyState] = useState<string | null>(() =>
    getGroqApiKey(),
  );

  useEffect(() => {
    const unsubscribe = subscribeToGroqApiKey((value) => {
      setGroqApiKeyState(value);
    });
    return unsubscribe;
  }, []);

  const updateGroqApiKey = useCallback((value: string) => {
    setGroqApiKey(value);
  }, []);

  const clearGroqApiKey = useCallback(() => {
    setGroqApiKey(null);
  }, []);

  return {
    groqApiKey,
    setGroqApiKey: updateGroqApiKey,
    clearGroqApiKey,
  } as const;
};
