import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import * as PIXI from "pixi.js";
import { subscribeRuntimeFxEvents } from "./eventBridge";
import { runFxIntents } from "./runner";
import type { FxContext, FxIntent, FxPayload } from "./types";

type FxRuntime = {
  ctx: FxContext | null;
  trigger: (
    intents: FxIntent[] | undefined,
    payload?: FxPayload,
  ) => Promise<void>;
};

const FxContextInternal = createContext<FxRuntime | null | undefined>(undefined);

type FxProviderProps = PropsWithChildren<{
  boardRef: React.RefObject<HTMLElement>;
  toCellPos: (cell: string) => { x: number; y: number };
}>;

export const FxProvider = ({
  boardRef,
  toCellPos,
  children,
}: FxProviderProps) => {
  const [runtime, setRuntime] = useState<FxRuntime | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    const boardElement = boardRef.current;
    if (!boardElement) return;

    let cancelled = false;
    let appInstance: PIXI.Application | null = null;

    const initPixi = async () => {
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "0";
      container.style.right = "0";
      container.style.bottom = "0";
      container.style.pointerEvents = "none";
      container.style.zIndex = "8";
      container.style.overflow = "visible";
      overlayRef.current = container;
      boardElement.appendChild(container);

      try {
        const app = new PIXI.Application();
        await app.init({
          backgroundAlpha: 0,
          resizeTo: boardElement,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
        });

        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }

        if (!app.renderer?.view) {
          console.error("[FxProvider] Renderer or canvas unavailable.");
          container.remove();
          return;
        }

        appInstance = app;
        appRef.current = app;

        const canvas = app.renderer.view.canvas as HTMLCanvasElement;
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.pointerEvents = "none";
        container.appendChild(canvas);

        const ctx: FxContext = {
          app,
          layer: { ui: boardElement },
          toCellPos,
        };

        const trigger = async (
          intents: FxIntent[] | undefined,
          payload?: FxPayload,
        ) => {
          await runFxIntents(intents, ctx, payload ?? {});
        };

        setRuntime({ ctx, trigger });
      } catch {
        container.remove();
        console.error("[FxProvider] Failed to initialize Pixi.");
      }
    };

    void initPixi();

    return () => {
      cancelled = true;
      if (appInstance) {
        appInstance.destroy(true, { children: true });
      }
      appRef.current = null;
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
      setRuntime(null);
    };
  }, [boardRef, toCellPos]);

  const value = useMemo(() => runtime, [runtime]);

  return (
    <FxContextInternal.Provider value={value}>
      {children}
    </FxContextInternal.Provider>
  );
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
      if (!runtime?.ctx) return;
      await runtime.trigger(intents, payload);
    },
    [runtime],
  );
};

export const FxRuntimeEventBridge = () => {
  const trigger = useFxTrigger();

  useEffect(
    () =>
      subscribeRuntimeFxEvents((intents, payload) => {
        void trigger(intents, payload).catch(() => {
          console.error("[FxRuntimeEventBridge] FX dispatch failed.");
        });
      }),
    [trigger],
  );

  return null;
};
