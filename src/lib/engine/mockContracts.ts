import { EngineContracts, Piece } from '@/engine/types';

export function createMockEngineContracts(): EngineContracts & { getExecutedActions: () => string[] } {
  const executedActions: string[] = [];
  const mockPieces = new Map<string, Piece>();

  // Créer quelques pièces de test
  mockPieces.set('mock_p1', { id: 'mock_p1', type: 'pawn', side: 'white', tile: 'e2' });
  mockPieces.set('mock_p2', { id: 'mock_p2', type: 'knight', side: 'white', tile: 'g1' });

  return {
    board: {
      tiles: () => ['a1', 'a2', 'e2', 'e4', 'g1', 'f3'],
      isEmpty: (tile: string) => !mockPieces.has(tile),
      getPieceAt: (tile: string) => {
        const piece = Array.from(mockPieces.values()).find(p => p.tile === tile);
        return piece?.id || null;
      },
      getPiece: (id: string) => mockPieces.get(id) || null,
      setPieceTile: (id: string, tile: string) => { 
        executedActions.push(`setPieceTile:${id}→${tile}`);
        const piece = mockPieces.get(id);
        if (piece) piece.tile = tile;
      },
      removePiece: (id: string) => { 
        executedActions.push(`removePiece:${id}`);
        mockPieces.delete(id);
      },
      spawnPiece: (type: string, side: string, tile: string) => { 
        const id = `mock_${type}_${tile}`;
        executedActions.push(`spawnPiece:${type}@${tile}`);
        mockPieces.set(id, { id, type: type as any, side: side as any, tile });
        return id;
      },
      withinBoard: () => true,
      neighbors: (tile: string) => ['e3', 'e5', 'd4', 'f4'],
      setDecal: () => {},
      clearDecal: () => {}
    },
    ui: {
      toast: (msg: string) => { executedActions.push(`toast:${msg}`); },
      registerAction: () => {}
    },
    vfx: {
      spawnDecal: () => { executedActions.push('vfx:decal'); },
      clearDecal: () => {},
      playAnimation: () => { executedActions.push('vfx:animation'); },
      playAudio: () => { executedActions.push('audio:play'); }
    },
    cooldown: {
      set: (pieceId: string, actionId: string, turns: number) => { 
        executedActions.push(`cooldown:${actionId}=${turns}`); 
      },
      isReady: () => true,
      tickAll: () => {},
      serialize: () => '',
      deserialize: () => {}
    },
    state: {
      getOrInit: (ns: string, initial: any) => initial,
      serialize: () => '',
      deserialize: () => {},
      pushUndo: () => {},
      undo: () => {}
    },
    match: {
      get: () => ({ ply: 1, turnSide: 'white' as const }),
      setTurn: () => {},
      endTurn: () => { executedActions.push('turn:end'); }
    },
    util: {
      uuid: () => `mock_uuid_${Date.now()}`
    },
    capturePiece: (pieceId: string) => { 
      executedActions.push(`capture:${pieceId}`);
      mockPieces.delete(pieceId);
    },
    eventBus: {
      emit: () => {},
      on: () => {}
    } as any,
    getExecutedActions: () => executedActions
  };
}
