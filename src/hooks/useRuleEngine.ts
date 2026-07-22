import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cooldown,
  createRuleEngine,
  EventBus,
  StateStore,
  type RuleEngineOptions,
} from "@/engine/bootstrap";
import type {
  EngineContracts,
  EngineEventMap,
  EngineEventName,
  PieceID,
  RuleActionExecutionResult,
  RuleJSON,
  Side,
  Tile,
  UIActionSpec,
} from "@/engine/types";
import {
  ChessBoardAdapter,
  type ChessBoardSnapshot,
} from "@/engine/adapters/chessBoardAdapter";
import { UIAdapter } from "@/engine/adapters/uiAdapter";
import { VFXAdapter } from "@/engine/adapters/vfxAdapter";
import { MatchAdapter } from "@/engine/adapters/matchAdapter";
import {
  resolveCapturedTargetPieceId,
  type MoveCommittedPayload,
} from "@/engine/capture-context";
import type { ChessMove, GameState } from "@/types/chess";
import { createDeterministicIdGenerator } from "@/rules-v2";
import { useSoundEffects } from "./useSoundEffects";

export interface UseRuleEngineOptions extends RuleEngineOptions {
  onBoardChange?: (board: ChessBoardSnapshot) => void;
  onRuntimeError?: (message: string) => void;
  onTurnEnd?: () => void;
}

export type RuleActionRunResult = RuleActionExecutionResult;

const ACTION_LOCK_MS = 450;
const TILE_PATTERN = /^[a-h][1-8]$/;

const safeRuntimeMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message.slice(0, 300)
    : "La règle n’a pas pu être exécutée.";

export const useRuleEngine = (
  gameState: GameState,
  rules: RuleJSON[] = [],
  options: UseRuleEngineOptions = {},
) => {
  const { playSound } = useSoundEffects();
  const [engine, setEngine] = useState<ReturnType<
    typeof createRuleEngine
  > | null>(null);
  const [uiActions, setUiActions] = useState<UIActionSpec[]>([]);

  const engineRef = useRef<ReturnType<typeof createRuleEngine> | null>(null);
  const contractsRef = useRef<EngineContracts | null>(null);
  const latestMoveRef = useRef<{
    move: ChessMove | undefined;
    moveNumber: number;
  }>({ move: undefined, moveNumber: 0 });
  const actionLocksRef = useRef(new Map<string, number>());
  const onBoardChangeRef = useRef(options.onBoardChange);
  const onRuntimeErrorRef = useRef(options.onRuntimeError);
  const onTurnEndRef = useRef(options.onTurnEnd);

  const boardAdapter = useMemo(
    () => new ChessBoardAdapter(gameState.board),
    // Adapter identity must remain stable for the whole mounted match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const uiAdapter = useMemo(() => new UIAdapter(), []);
  const vfxAdapter = useMemo(() => new VFXAdapter(), []);
  const matchAdapter = useMemo(
    () => new MatchAdapter(gameState.currentPlayer),
    // MatchAdapter is synchronized through setCurrentTurn below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  latestMoveRef.current = {
    move: gameState.moveHistory[gameState.moveHistory.length - 1],
    moveNumber: gameState.moveHistory.length,
  };
  onBoardChangeRef.current = options.onBoardChange;
  onRuntimeErrorRef.current = options.onRuntimeError;
  onTurnEndRef.current = options.onTurnEnd;

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

  useEffect(() => uiAdapter.subscribe(setUiActions), [uiAdapter]);

  useEffect(() => {
    boardAdapter.setBoardChangeListener((nextBoard) => {
      onBoardChangeRef.current?.(nextBoard);
    });
    return () => boardAdapter.setBoardChangeListener(undefined);
  }, [boardAdapter]);

  useEffect(() => {
    vfxAdapter.setPlaySoundCallback(playSound);
    return () => vfxAdapter.setPlaySoundCallback(undefined);
  }, [playSound, vfxAdapter]);

  useEffect(() => {
    boardAdapter.updateBoard(gameState.board);
  }, [boardAdapter, gameState.board]);

  useEffect(() => {
    matchAdapter.setCurrentTurn(gameState.currentPlayer);
  }, [gameState.currentPlayer, matchAdapter]);

  useEffect(() => {
    matchAdapter.setTurnEndCallback(() => onTurnEndRef.current?.());
    return () => matchAdapter.setTurnEndCallback(() => undefined);
  }, [matchAdapter]);

  useEffect(() => {
    const eventBus = new EventBus();
    const cooldown = new Cooldown();
    const stateStore = new StateStore();
    const nextDeterministicId = createDeterministicIdGenerator(
      `${String(matchSeed)}|entities`,
    );
    uiAdapter.clearActions(false);

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
      capturePiece: (pieceId: PieceID, reason?: string) => {
        try {
          boardAdapter.removePiece(pieceId);
        } catch (error) {
          const message = safeRuntimeMessage(error);
          console.warn("[rule-runtime] capture failed", {
            pieceId,
            reason: String(reason ?? "rule-effect").slice(0, 120),
            message,
          });
          onRuntimeErrorRef.current?.(message);
        }
      },
    };

    contractsRef.current = contracts;
    const nextEngine = createRuleEngine(contracts, rules, {
      matchSeed,
      maxEffectsPerRuleEvent,
      maxNestedDepth,
    });
    engineRef.current = nextEngine;
    setEngine(nextEngine);
    uiAdapter.flush();

    return () => {
      if (contractsRef.current === contracts) contractsRef.current = null;
      if (engineRef.current === nextEngine) engineRef.current = null;
    };
    // rulesSignature deliberately controls engine rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    boardAdapter,
    matchAdapter,
    matchSeed,
    maxEffectsPerRuleEvent,
    maxNestedDepth,
    rulesSignature,
    uiAdapter,
    vfxAdapter,
  ]);

  const triggerLifecycleEvent = useCallback(
    <Event extends EngineEventName>(
      event: Event,
      payload: EngineEventMap[Event],
    ): boolean => {
      const contracts = contractsRef.current;
      if (!contracts) return false;
      try {
        contracts.eventBus.emit(event, payload);
        return true;
      } catch (error) {
        const message = safeRuntimeMessage(error);
        console.warn("[rule-runtime] lifecycle event failed", {
          event,
          message,
        });
        onRuntimeErrorRef.current?.(message);
        return false;
      }
    },
    [],
  );

  const onEnterTile = useCallback(
    (pieceId: PieceID, to: Tile) =>
      triggerLifecycleEvent("lifecycle.onEnterTile", { pieceId, to }),
    [triggerLifecycleEvent],
  );

  const onMoveCommitted = useCallback(
    (payload: MoveCommittedPayload) => {
      matchAdapter.syncCommittedMoves(latestMoveRef.current.moveNumber);
      const targetPieceId =
        payload.targetPieceId ??
        resolveCapturedTargetPieceId(
          latestMoveRef.current.move,
          latestMoveRef.current.moveNumber,
          payload,
        );
      return triggerLifecycleEvent("lifecycle.onMoveCommitted", {
        ...payload,
        targetPieceId,
      });
    },
    [matchAdapter, triggerLifecycleEvent],
  );

  const onUndo = useCallback(
    () => triggerLifecycleEvent("lifecycle.onUndo", {}),
    [triggerLifecycleEvent],
  );

  const onPromote = useCallback(
    (pieceId: PieceID, fromType: string, toType: string) =>
      triggerLifecycleEvent("lifecycle.onPromote", {
        pieceId,
        fromType,
        toType,
      }),
    [triggerLifecycleEvent],
  );

  const onTurnStart = useCallback(
    (side: Side) => triggerLifecycleEvent("lifecycle.onTurnStart", { side }),
    [triggerLifecycleEvent],
  );

  const runUIAction = useCallback(
    (
      actionId: string,
      pieceId?: PieceID,
      targetTile?: Tile,
    ): RuleActionRunResult => {
      const currentEngine = engineRef.current;
      if (!currentEngine) return { ok: false, reason: "Moteur indisponible." };

      const action = uiAdapter.getAction(actionId);
      if (!action) return { ok: false, reason: "Action inconnue ou inactive." };

      if (action.availability?.requiresSelection && !pieceId) {
        return { ok: false, reason: "Sélectionne d’abord une pièce." };
      }
      if (pieceId) {
        try {
          boardAdapter.getPiece(pieceId);
        } catch {
          return { ok: false, reason: "La pièce sélectionnée n’existe plus." };
        }
      }

      const targetMode = action.targeting?.mode ?? "none";
      if (targetMode !== "none") {
        if (!targetTile || !TILE_PATTERN.test(String(targetTile))) {
          return { ok: false, reason: "Choisis une case valide." };
        }
        if (!boardAdapter.withinBoard(targetTile)) {
          return { ok: false, reason: "Cette case est hors du plateau." };
        }
      }

      const lockKey = `${actionId}:${pieceId ?? "none"}:${targetTile ?? "none"}`;
      const now = Date.now();
      const lockedUntil = actionLocksRef.current.get(lockKey) ?? 0;
      if (lockedUntil > now) {
        return { ok: false, reason: "Action déjà envoyée." };
      }
      actionLocksRef.current.set(lockKey, now + ACTION_LOCK_MS);

      try {
        return currentEngine.runUIAction(
          actionId,
          pieceId,
          targetMode === "none" ? undefined : targetTile,
        );
      } catch (error) {
        const message = safeRuntimeMessage(error);
        onRuntimeErrorRef.current?.(message);
        return { ok: false, reason: message };
      } finally {
        window.setTimeout(() => {
          const value = actionLocksRef.current.get(lockKey);
          if (value && value <= Date.now())
            actionLocksRef.current.delete(lockKey);
        }, ACTION_LOCK_MS + 25);
      }
    },
    [boardAdapter, uiAdapter],
  );

  const getUIActions = useCallback(
    (): UIActionSpec[] => uiAdapter.getAllActions(),
    [uiAdapter],
  );

  const serializeState = useCallback(() => {
    const contracts = contractsRef.current;
    if (!contracts) return null;
    return {
      rules: contracts.state.serialize(),
      cooldowns: contracts.cooldown.serialize(),
    };
  }, []);

  const deserializeState = useCallback((state: unknown) => {
    const contracts = contractsRef.current;
    if (!contracts || !state || typeof state !== "object") return;
    const payload = state as { rules?: unknown; cooldowns?: unknown };
    if (typeof payload.rules === "string") {
      contracts.state.deserialize(payload.rules);
    }
    if (typeof payload.cooldowns === "string") {
      contracts.cooldown.deserialize(payload.cooldowns);
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
    getUIActions,
    uiActions,
    serializeState,
    deserializeState,
    boardAdapter,
    uiAdapter,
    vfxAdapter,
  };
};
