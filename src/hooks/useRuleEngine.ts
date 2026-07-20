import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createRuleEngine,
  EventBus,
  Cooldown,
  StateStore,
  type RuleEngineOptions,
} from "@/engine/bootstrap";
import type {
  EngineContracts,
  EngineEventMap,
  EngineEventName,
  RuleJSON,
  Side,
  UIActionSpec,
} from "@/engine/types";
import { ChessBoardAdapter } from "@/engine/adapters/chessBoardAdapter";
import { UIAdapter } from "@/engine/adapters/uiAdapter";
import { VFXAdapter } from "@/engine/adapters/vfxAdapter";
import { MatchAdapter } from "@/engine/adapters/matchAdapter";
import type { ChessMove, GameState } from "@/types/chess";
import { createDeterministicIdGenerator } from "@/rules-v2";
import { resolveCapturedTargetPieceId } from "@/engine/capture-context";
import { useSoundEffects } from "./useSoundEffects";

export type UseRuleEngineOptions = RuleEngineOptions;

export const useRuleEngine = (
  gameState: GameState,
  rules: RuleJSON[] = [],
  options: UseRuleEngineOptions = {},
) => {
  const { playSound } = useSoundEffects();
  const engineRef = useRef<ReturnType<typeof createRuleEngine> | null>(null);
  const contractsRef = useRef<EngineContracts | null>(null);
  const rulesSignatureRef = useRef<string | null>(null);
  const latestMoveRef = useRef<{
    move: ChessMove | undefined;
    moveNumber: number;
  }>({ move: undefined, moveNumber: 0 });
  latestMoveRef.current = {
    move: gameState.moveHistory[gameState.moveHistory.length - 1],
    moveNumber: gameState.moveHistory.length,
  };

  // The adapters must survive normal board updates. The previous
  // implementation recreated the engine whenever the board array changed.
  const boardAdapterRef = useRef<ChessBoardAdapter | null>(null);
  if (!boardAdapterRef.current) {
    boardAdapterRef.current = new ChessBoardAdapter(gameState.board);
  }
  const boardAdapter = boardAdapterRef.current;
  const uiAdapter = useMemo(() => new UIAdapter(), []);
  const vfxAdapter = useMemo(() => new VFXAdapter(), []);
  const matchAdapterRef = useRef<MatchAdapter | null>(null);
  if (!matchAdapterRef.current) {
    matchAdapterRef.current = new MatchAdapter(gameState.currentPlayer);
  }
  const matchAdapter = matchAdapterRef.current;

  const matchSeed = options.matchSeed ?? "local-match";
  const maxEffectsPerRuleEvent = options.maxEffectsPerRuleEvent ?? 128;
  const maxNestedDepth = options.maxNestedDepth ?? 8;

  const rulesSignature = useMemo(
    () =>
      JSON.stringify({
        rules: rules ?? [],
        matchSeed: String(matchSeed),
        maxEffectsPerRuleEvent,
        maxNestedDepth,
      }),
    [matchSeed, maxEffectsPerRuleEvent, maxNestedDepth, rules],
  );

  useEffect(() => {
    vfxAdapter.setPlaySoundCallback(playSound);
  }, [vfxAdapter, playSound]);

  useEffect(() => {
    boardAdapter.updateBoard(gameState.board);
  }, [boardAdapter, gameState.board]);

  useEffect(() => {
    matchAdapter.setCurrentTurn(gameState.currentPlayer);
  }, [gameState.currentPlayer, matchAdapter]);

  const initializeEngine = useCallback(() => {
    const signature = rulesSignature;

    if (engineRef.current && rulesSignatureRef.current === signature) {
      return engineRef.current;
    }

    const eventBus = new EventBus();
    const cooldown = new Cooldown();
    const stateStore = new StateStore();
    const nextDeterministicId = createDeterministicIdGenerator(
      `${String(matchSeed)}|entities`,
    );

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
        uuid: nextDeterministicId,
      },
      capturePiece: (id: string, reason?: string) => {
        console.log(`Capturing piece ${id} - ${reason || "rule effect"}`);
        boardAdapter.removePiece(id);
      },
    };

    contractsRef.current = contracts;

    const engine = createRuleEngine(contracts, rules, {
      matchSeed,
      maxEffectsPerRuleEvent,
      maxNestedDepth,
    });

    engineRef.current = engine;
    rulesSignatureRef.current = signature;
    return engine;
  }, [
    boardAdapter,
    matchAdapter,
    matchSeed,
    maxEffectsPerRuleEvent,
    maxNestedDepth,
    rules,
    rulesSignature,
    uiAdapter,
    vfxAdapter,
  ]);

  const engine = useMemo(() => initializeEngine(), [initializeEngine]);

  const triggerLifecycleEvent = useCallback(
    <Event extends EngineEventName>(
      event: Event,
      payload: EngineEventMap[Event],
    ) => {
      contractsRef.current?.eventBus.emit(event, payload);
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
    (payload: EngineEventMap["lifecycle.onMoveCommitted"]) => {
      const targetPieceId =
        payload.targetPieceId ??
        resolveCapturedTargetPieceId(
          latestMoveRef.current.move,
          latestMoveRef.current.moveNumber,
          payload,
        );
      triggerLifecycleEvent("lifecycle.onMoveCommitted", {
        ...payload,
        targetPieceId,
      });
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

  const onTurnStart = useCallback(
    (side: Side) => {
      triggerLifecycleEvent("lifecycle.onTurnStart", { side });
    },
    [triggerLifecycleEvent],
  );

  const runUIAction = useCallback(
    (actionId: string, pieceId?: string, targetTile?: string) => {
      triggerLifecycleEvent("ui.runAction", {
        actionId,
        pieceId,
        targetTile,
      });
    },
    [triggerLifecycleEvent],
  );

  const tickCooldowns = useCallback(() => {
    contractsRef.current?.cooldown.tickAll();
  }, []);

  const getUIActions = useCallback((): UIActionSpec[] => {
    return uiAdapter.getAllActions();
  }, [uiAdapter]);

  const serializeState = useCallback(() => {
    if (!contractsRef.current) {
      return null;
    }

    return {
      rules: contractsRef.current.state.serialize(),
      cooldowns: contractsRef.current.cooldown.serialize(),
    };
  }, []);

  const deserializeState = useCallback((state: unknown) => {
    if (!contractsRef.current || !state || typeof state !== "object") {
      return;
    }

    const payload = state as {
      rules?: unknown;
      cooldowns?: unknown;
    };

    if (typeof payload.rules === "string") {
      contractsRef.current.state.deserialize(payload.rules);
    }

    if (typeof payload.cooldowns === "string") {
      contractsRef.current.cooldown.deserialize(payload.cooldowns);
    }
  }, []);

  return {
    engine,
    onEnterTile,
    onMoveCommitted,
    onUndo,
    onPromote,
    onTurnStart,
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
