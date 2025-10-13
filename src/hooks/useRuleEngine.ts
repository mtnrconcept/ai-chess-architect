import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createRuleEngine, EventBus, Cooldown, StateStore } from '@/engine/bootstrap';
import { EngineContracts, RuleJSON, UIActionSpec } from '@/engine/types';
import { ChessBoardAdapter } from '@/engine/adapters/chessBoardAdapter';
import { UIAdapter } from '@/engine/adapters/uiAdapter';
import { VFXAdapter } from '@/engine/adapters/vfxAdapter';
import { MatchAdapter } from '@/engine/adapters/matchAdapter';
import { GameState } from '@/types/chess';
import { useSoundEffects } from './useSoundEffects';

export const useRuleEngine = (gameState: GameState, rules: RuleJSON[] = []) => {
  const { playSound } = useSoundEffects();
  const engineRef = useRef<ReturnType<typeof createRuleEngine> | null>(null);
  const contractsRef = useRef<EngineContracts | null>(null);

  const boardAdapter = useMemo(
    () => new ChessBoardAdapter(gameState.board),
    [gameState.board]
  );

  const uiAdapter = useMemo(() => new UIAdapter(), []);
  const vfxAdapter = useMemo(() => new VFXAdapter(), []);
  const matchAdapter = useMemo(
    () => new MatchAdapter(gameState.currentPlayer),
    [gameState.currentPlayer]
  );

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
    if (engineRef.current) return engineRef.current;

    const eventBus = new EventBus();
    const cooldown = new Cooldown();
    const stateStore = new StateStore();

    const contracts: EngineContracts = {
      board: boardAdapter,
      ui: uiAdapter,
      vfx: vfxAdapter,
      match: matchAdapter,
      cooldown,
      state: stateStore,
      eventBus,
      util: {
        uuid: () => crypto.randomUUID()
      },
      capturePiece: (id: string, reason?: string) => {
        console.log(`Capturing piece ${id} - ${reason || 'rule effect'}`);
        boardAdapter.removePiece(id);
      }
    };

    contractsRef.current = contracts;
    const engine = createRuleEngine(contracts, rules);
    engineRef.current = engine;

    return engine;
  }, [boardAdapter, uiAdapter, vfxAdapter, matchAdapter, rules]);

  const engine = useMemo(() => initializeEngine(), [initializeEngine]);

  const triggerLifecycleEvent = useCallback(
    (event: string, payload: any) => {
      if (contractsRef.current) {
        contractsRef.current.eventBus.emit(event, payload);
      }
    },
    []
  );

  const onEnterTile = useCallback(
    (pieceId: string, to: string) => {
      triggerLifecycleEvent('lifecycle.onEnterTile', { pieceId, to });
    },
    [triggerLifecycleEvent]
  );

  const onMoveCommitted = useCallback(
    (payload: { pieceId: string; from: string; to: string }) => {
      triggerLifecycleEvent('lifecycle.onMoveCommitted', payload);
    },
    [triggerLifecycleEvent]
  );

  const onUndo = useCallback(() => {
    triggerLifecycleEvent('lifecycle.onUndo', {});
  }, [triggerLifecycleEvent]);

  const onPromote = useCallback(
    (pieceId: string, fromType: string, toType: string) => {
      triggerLifecycleEvent('lifecycle.onPromote', { pieceId, fromType, toType });
    },
    [triggerLifecycleEvent]
  );

  const runUIAction = useCallback(
    (actionId: string, pieceId?: string, targetTile?: string) => {
      if (contractsRef.current) {
        contractsRef.current.eventBus.emit('ui.runAction', {
          actionId,
          pieceId,
          targetTile
        });
      }
    },
    []
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
      cooldowns: contractsRef.current.cooldown.serialize()
    };
  }, []);

  const deserializeState = useCallback((state: any) => {
    if (!contractsRef.current) return;
    if (state.rules) {
      contractsRef.current.state.deserialize(state.rules);
    }
    if (state.cooldowns) {
      contractsRef.current.cooldown.deserialize(state.cooldowns);
    }
  }, []);

  return {
    engine,
    onEnterTile,
    onMoveCommitted,
    onUndo,
    onPromote,
    runUIAction,
    tickCooldowns,
    getUIActions,
    serializeState,
    deserializeState,
    boardAdapter,
    uiAdapter,
    vfxAdapter
  };
};
