import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as PIXI from "pixi.js";
import type { PropsWithChildren } from "react";
import type { FxContext, FxIntent, FxPayload } from "./types";
import { runFxIntents } from "./runner";
import { disposeFxForApp } from "./registry";

type FxRuntime = {
  ctx: FxContext | null;
  trigger: (
    intents: FxIntent[] | undefined,
    payload?: FxPayload,
  ) => Promise<void>;
};

const FxContextInternal = createContext<FxRuntime | null | undefined>(
  undefined,
);

type FxProviderProps = PropsWithChildren<{
  boardRef: React.RefObject<HTMLElement>;
  canvasHostRef: React.RefObject<HTMLDivElement>;
  toCellPos: (cell: string) => { x: number; y: number };
}>;

export const FxProvider = ({
  boardRef,
  canvasHostRef,
  toCellPos,
  children,
}: FxProviderProps) => {
  const [runtime, setRuntime] = useState<FxRuntime | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    const container = canvasHostRef.current;
    if (!board || !container) return;

    let cancelled = false;
    let appInstance: PIXI.Application | null = null;

    const initPixi = async () => {
      // A React-managed, empty host prevents the canvas from mutating the
      // set of children owned by the live chessboard reconciler.
      try {
        const app = new PIXI.Application();

        await app.init({
          backgroundAlpha: 0,
          resizeTo: board,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
        });

        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }

        // Pixi v8 exposes the HTML canvas directly on Application.canvas.
        // renderer.view.canvas is a v7-era access and prevents any FX from mounting.
        const canvas = app.canvas;
        if (!canvas) throw new Error("PIXI_CANVAS_UNAVAILABLE");

        appInstance = app;
        appRef.current = app;

        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
        container.appendChild(canvas);

        const ctx: FxContext = {
          app,
          layer: { ui: board },
          toCellPos,
        };

        const trigger = async (
          intents: FxIntent[] | undefined,
          payload?: FxPayload,
        ) => {
          await runFxIntents(intents, ctx, payload ?? {});
        };

        setRuntime({ ctx, trigger });
      } catch (error) {
        console.error("[FxProvider] Failed to initialize Pixi", error);
      }
    };

    initPixi();

    return () => {
      cancelled = true;
      if (appInstance) {
        disposeFxForApp(appInstance);
        appInstance.destroy(true, { children: true });
      }
      appRef.current = null;
      // React owns the host's lifecycle. The Pixi Application owns only
      // its canvas; never remove an element managed by React itself.
    };
  }, [boardRef, canvasHostRef, toCellPos]);

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
      if (!runtime?.ctx) {
        // Reject so the VFXAdapter can render its DOM fallback instead of
        // silently swallowing a requested custom-rule animation.
        throw new Error("FX_RUNTIME_UNAVAILABLE");
      }
      await runtime.trigger(intents, payload);
    },
    [runtime],
  );
};
