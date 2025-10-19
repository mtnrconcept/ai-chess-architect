import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createRuleEngine,
  EventBus,
  Cooldown,
  StateStore,
} from "@/engine/bootstrap";
import { EngineContracts, RuleJSON, UIActionSpec } from "@/engine/types";
import { ChessBoardAdapter } from "@/engine/adapters/chessBoardAdapter";
import { UIAdapter } from "@/engine/adapters/uiAdapter";
import { VFXAdapter } from "@/engine/adapters/vfxAdapter";
import { MatchAdapter } from "@/engine/adapters/matchAdapter";
import { GameState } from "@/types/chess";
import { useSoundEffects } from "./useSoundEffects";

export const useRuleEngine = (gameState: GameState, rules: RuleJSON[] = []) => {
  const { playSound } = useSoundEffects();
  const engineRef = useRef<ReturnType<typeof createRuleEngine> | null>(null);
  const contractsRef = useRef<EngineContracts | null>(null);
  const rulesSignatureRef = useRef<string | null>(null);

  const boardAdapter = useMemo(
    () => new ChessBoardAdapter(gameState.board),
    [gameState.board],
  );

  const uiAdapter = useMemo(() => new UIAdapter(), []);
  const vfxAdapter = useMemo(() => new VFXAdapter(), []);
  const matchAdapter = useMemo(
    () => new MatchAdapter(gameState.currentPlayer),
    [gameState.currentPlayer],
  );

  const rulesSignature = useMemo(() => JSON.stringify(rules ?? []), [rules]);

  useEffect(() => {
    vfxAdapter.setPlaySoundCallback(playSound);
  }, [vfxAdapter, playSound]);

  useEffect(() => {
    boardAdapter.updateBoard(gameState.board);
  }, [boardAdapter, gameState.board]);

  useEffect(() => {
    matchAdapter.setCurrentTurn(gameState.currentPlayer);
  }, [matchAdapter, gameState.currentPlayer]);

  const initializeEngine = useCallback(() => {
    const signature = rulesSignature;
    if (engineRef.current && rulesSignatureRef.current === signature) {
      return engineRef.current;
    }

    const eventBus = new EventBus();
    const cooldown = new Cooldown();
    const stateStore = new StateStore();

    uiAdapter.clearActions();

    const contracts: EngineContracts = {
      board: boardAdapter,
      ui: uiAdapter,
      vfx: vfxAdapter,
      match: matchAdapter,
      cooldown,
      state: stateStore,
      eventBus,
      util: {
        uuid: () => crypto.randomUUID(),
      },
      capturePiece: (id: string, reason?: string) => {
        console.log(`Capturing piece ${id} - ${reason || "rule effect"}`);
        boardAdapter.removePiece(id);
      },
    };

    contractsRef.current = contracts;
    const engine = createRuleEngine(contracts, rules);
    engineRef.current = engine;
    rulesSignatureRef.current = signature;

    return engine;
  }, [
    boardAdapter,
    matchAdapter,
    rules,
    rulesSignature,
    uiAdapter,
    vfxAdapter,
  ]);

  const engine = useMemo(() => initializeEngine(), [initializeEngine]);

  const triggerLifecycleEvent = useCallback(
    (event: string, payload: unknown) => {
      if (contractsRef.current) {
        contractsRef.current.eventBus.emit(event, payload);
      }
    },
    [],
  );

  const onEnterTile = useCallback(
    (pieceId: string, to: string) => {
      triggerLifecycleEvent("lifecycle.onEnterTile", { pieceId, to });
    },
    [triggerLifecycleEvent],
  );

  const onMoveCommitted = useCallback(
    (payload: { pieceId: string; from: string; to: string }) => {
      triggerLifecycleEvent("lifecycle.onMoveCommitted", payload);
    },
    [triggerLifecycleEvent],
  );

  const onUndo = useCallback(() => {
    triggerLifecycleEvent("lifecycle.onUndo", {});
  }, [triggerLifecycleEvent]);

  const onPromote = useCallback(
    (pieceId: string, fromType: string, toType: string) => {
      triggerLifecycleEvent("lifecycle.onPromote", {
        pieceId,
        fromType,
        toType,
      });
    },
    [triggerLifecycleEvent],
  );

  const runUIAction = useCallback(
    (actionId: string, pieceId?: string, targetTile?: string) => {
      if (contractsRef.current) {
        contractsRef.current.eventBus.emit("ui.runAction", {
          actionId,
          pieceId,
          targetTile,
        });
      }
    },
    [],
  );

  const tickCooldowns = useCallback(() => {
    if (contractsRef.current) {
      contractsRef.current.cooldown.tickAll();
    }
  }, []);

  const getUIActions = useCallback((): UIActionSpec[] => {
    return uiAdapter.getAllActions();
  }, [uiAdapter]);

  const serializeState = useCallback(() => {
    if (!contractsRef.current) return null;
    return {
      rules: contractsRef.current.state.serialize(),
      cooldowns: contractsRef.current.cooldown.serialize(),
    };
  }, []);

  const deserializeState = useCallback((state: unknown) => {
    if (!contractsRef.current || !state || typeof state !== "object") return;
    const payload = state as { rules?: unknown; cooldowns?: unknown };
    if (payload.rules) {
      contractsRef.current.state.deserialize(payload.rules);
    }
    if (payload.cooldowns) {
      contractsRef.current.cooldown.deserialize(payload.cooldowns);
    }
  }, []);

  return {
    engine,
    onEnterTile,
    onMoveCommitted,
    onUndo,
    onPromote,
    onTurnStart: useCallback((side: string) => {
      if (contractsRef.current) {
        contractsRef.current.eventBus.emit("lifecycle.onTurnStart", { side });
      }
    }, []),
    runUIAction,
    tickCooldowns,
    getUIActions,
    serializeState,
    deserializeState,
    boardAdapter,
    uiAdapter,
    vfxAdapter,
  };
};
