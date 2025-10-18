import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import type { PropsWithChildren } from "react";
import type { FxContext, FxIntent, FxPayload } from "./types";
import { runFxIntents } from "./runner";

type FxRuntime = {
  ctx: FxContext | null;
  trigger: (intents: FxIntent[] | undefined, payload?: FxPayload) => Promise<void>;
};

const FxContextInternal = createContext<FxRuntime | null | undefined>(undefined);

type FxProviderProps = PropsWithChildren<{
  boardRef: React.RefObject<HTMLElement>;
  toCellPos: (cell: string) => { x: number; y: number };
}>;

export const FxProvider = ({ boardRef, toCellPos, children }: FxProviderProps) => {
  const [runtime, setRuntime] = useState<FxRuntime | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!boardRef.current) return;
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.top = "0";
    container.style.left = "0";
    container.style.right = "0";
    container.style.bottom = "0";
    container.style.pointerEvents = "none";
    container.style.zIndex = "8";
    overlayRef.current = container;
    boardRef.current.appendChild(container);

    const app = new PIXI.Application({
      backgroundAlpha: 0,
      resizeTo: boardRef.current,
      antialias: true,
      autoDensity: true,
    });
    container.appendChild(app.view as HTMLCanvasElement);

    const ctx: FxContext = {
      app,
      layer: { ui: boardRef.current },
      toCellPos,
    };

    const trigger = async (intents: FxIntent[] | undefined, payload?: FxPayload) => {
      await runFxIntents(intents, ctx, payload ?? {});
    };

    setRuntime({ ctx, trigger });

    return () => {
      app.destroy(true, { children: true });
      container.remove();
      overlayRef.current = null;
      setRuntime(null);
    };
  }, [boardRef, toCellPos]);

  const value = useMemo(() => runtime, [runtime]);

  return <FxContextInternal.Provider value={value}>{children}</FxContextInternal.Provider>;
};

export const useFxRuntime = () => {
  const runtime = useContext(FxContextInternal);
  if (runtime === undefined) {
    throw new Error("useFxRuntime must be used inside FxProvider");
  }
  return runtime;
};

export const useFxTrigger = () => {
  const runtime = useFxRuntime();
  return useCallback(
    async (intents: FxIntent[] | undefined, payload?: FxPayload) => {
      if (!runtime || !runtime.ctx) return;
      await runtime.trigger(intents, payload);
    },
    [runtime],
  );
};
