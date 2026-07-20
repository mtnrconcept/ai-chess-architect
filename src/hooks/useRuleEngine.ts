import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Cooldown,
  createRuleEngine,
  EventBus,
  StateStore,
  type RuleEngineOptions,
} from "@/engine/bootstrap";
import { ChessBoardAdapter } from "@/engine/adapters/chessBoardAdapter";
import { MatchAdapter } from "@/engine/adapters/matchAdapter";
import { UIAdapter } from "@/engine/adapters/uiAdapter";
import { VFXAdapter } from "@/engine/adapters/vfxAdapter";
import type {
  EngineContracts,
  EngineEventMap,
  EngineEventName,
  RuleJSON,
  Side,
  UIActionSpec,
} from "@/engine/types";
import { extractRulePresentationManifests } from "@/rule-presentation/manifest";
import { createDeterministicIdGenerator } from "@/rules-v2";
import type { GameState, Position } from "@/types/chess";
import { useSoundEffects } from "./useSoundEffects";

export type UseRuleEngineOptions = RuleEngineOptions;

const positionToTile = (position: Position): string =>
  `${"abcdefgh"[position.col] ?? "a"}${8 - position.row}`;

export const useRuleEngine = (
  gameState: GameState,
  rules: RuleJSON[] = [],
  options: UseRuleEngineOptions = {},
) => {
  const { playSound } = useSoundEffects();
  const engineRef = useRef<ReturnType<typeof createRuleEngine> | null>(null);
  const contractsRef = useRef<EngineContracts | null>(null);
  const rulesSignatureRef = useRef<string | null>(null);
  const processedPresentationMovesRef = useRef(gameState.moveHistory.length);
  const previousGameStatusRef = useRef(gameState.gameStatus);

  // Adapters survive normal board updates. Recreating the engine for every board
  // array would also replay visual and rule events.
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

  const presentationManifests = useMemo(
    () => extractRulePresentationManifests(rules),
    [rules],
  );

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
    vfxAdapter.setPresentationManifests(presentationManifests);
  }, [presentationManifests, vfxAdapter]);

  useEffect(() => {
    boardAdapter.updateBoard(gameState.board);
  }, [boardAdapter, gameState.board]);

  useEffect(() => {
    matchAdapter.setCurrentTurn(gameState.currentPlayer);
  }, [gameState.currentPlayer, matchAdapter]);

  useEffect(() => {
    const currentCount = gameState.moveHistory.length;
    const previousCount = processedPresentationMovesRef.current;

    if (currentCount < previousCount) {
      processedPresentationMovesRef.current = currentCount;
      return;
    }
    if (currentCount === previousCount) return;

    for (let index = previousCount; index < currentCount; index += 1) {
      const move = gameState.moveHistory[index];
      if (!move) continue;

      const fromTile = positionToTile(move.from);
      const toTile = positionToTile(move.to);
      vfxAdapter.playPresentationEvent("move", {
        tile: toTile,
        fromTile,
      });

      if (move.captured) {
        vfxAdapter.playPresentationEvent("capture", {
          tile: toTile,
          fromTile,
          capturedPieceType: move.captured.type,
          capturedPieceColor: move.captured.color,
        });
      }

      for (const specialCapture of move.specialCaptures ?? []) {
        vfxAdapter.playPresentationEvent("capture", {
          tile: positionToTile(specialCapture.piece.position),
          fromTile,
          capturedPieceType: specialCapture.piece.type,
          capturedPieceColor: specialCapture.piece.color,
        });
      }

      if (move.promotion) {
        vfxAdapter.playPresentationEvent("promotion", {
          tile: toTile,
          fromTile,
          promotedPieceType: move.promotion,
        });
      }
    }

    processedPresentationMovesRef.current = currentCount;
  }, [gameState.moveHistory, vfxAdapter]);

  useEffect(() => {
    const previousStatus = previousGameStatusRef.current;
    previousGameStatusRef.current = gameState.gameStatus;
    if (gameState.gameStatus !== "check" || previousStatus === "check") return;

    const checkedKing = gameState.board
      .flat()
      .find(
        (piece) =>
          piece?.type === "king" && piece.color === gameState.currentPlayer,
      );
    if (!checkedKing) return;

    vfxAdapter.playPresentationEvent("check", {
      tile: positionToTile(checkedKing.position),
    });
  }, [gameState.board, gameState.currentPlayer, gameState.gameStatus, vfxAdapter]);

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
