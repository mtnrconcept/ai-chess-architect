from __future__ import annotations

from pathlib import Path

PLAY = Path("src/pages/Play.tsx")
text = PLAY.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    'import { FxProvider, useFxTrigger } from "@/fx/context";\nimport type { RuleJSON } from "@/engine/types";\nimport LiveCoachAvatar from "@/features/coach/LiveCoachAvatar";',
    'import { FxProvider } from "@/fx/context";\nimport type { RuleJSON } from "@/engine/types";\nimport LiveCoachAvatar from "@/features/coach/LiveCoachAvatar";\nimport RuleActionDock from "@/features/play/RuleActionDock";\nimport RuleRuntimeBridge from "@/features/play/RuleRuntimeBridge";',
    "imports",
)

replace_once(
    '''  const {\n    onEnterTile,\n    onMoveCommitted,\n    onTurnStart,\n    runUIAction,\n    boardAdapter,\n  } = useRuleEngine(gameState, activeRuleJsons, {\n    matchSeed:\n      locationState?.ruleArchitectMatchSeed ??\n      locationState?.lobbyId ??\n      "local-match",\n    maxEffectsPerRuleEvent: 128,\n    maxNestedDepth: 8,\n  });\n\n  // Déclenche l'événement de début de tour au montage\n  useEffect(() => {\n    onTurnStart(gameState.currentPlayer);\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, []);''',
    '''  const handleRuleBoardChange = useCallback(\n    (nextBoard: (ChessPiece | null)[][]) => {\n      setGameState((previous) => {\n        if (previous.board === nextBoard) return previous;\n        return { ...previous, board: nextBoard };\n      });\n    },\n    [],\n  );\n\n  const handleRuleRuntimeError = useCallback(\n    (message: string) => {\n      safeToast({\n        title: "Règle interrompue",\n        description: message,\n        variant: "destructive",\n      });\n    },\n    [safeToast],\n  );\n\n  const handleRuleTurnEnd = useCallback(() => {\n    setGameState((previous) => {\n      if (previous.gameStatus !== "active" && previous.gameStatus !== "check") {\n        return previous;\n      }\n      const nextPlayer: PieceColor =\n        previous.currentPlayer === "white" ? "black" : "white";\n      return {\n        ...previous,\n        currentPlayer: nextPlayer,\n        turnNumber:\n          previous.currentPlayer === "black"\n            ? previous.turnNumber + 1\n            : previous.turnNumber,\n        movesThisTurn: 0,\n        selectedPiece: null,\n        validMoves: [],\n      };\n    });\n  }, []);\n\n  const {\n    onEnterTile,\n    onMoveCommitted,\n    onTurnStart,\n    runUIAction,\n    tickCooldowns,\n    boardAdapter,\n    uiActions,\n    vfxAdapter,\n  } = useRuleEngine(gameState, activeRuleJsons, {\n    matchSeed:\n      locationState?.ruleArchitectMatchSeed ??\n      locationState?.lobbyId ??\n      "local-match",\n    maxEffectsPerRuleEvent: 128,\n    maxNestedDepth: 8,\n    onBoardChange: handleRuleBoardChange,\n    onRuntimeError: handleRuleRuntimeError,\n    onTurnEnd: handleRuleTurnEnd,\n  });\n\n  const lastRuleTurnSideRef = useRef<PieceColor | null>(null);\n  useEffect(() => {\n    if (lastRuleTurnSideRef.current === gameState.currentPlayer) return;\n    if (lastRuleTurnSideRef.current !== null) tickCooldowns();\n    lastRuleTurnSideRef.current = gameState.currentPlayer;\n    onTurnStart(gameState.currentPlayer);\n  }, [gameState.currentPlayer, onTurnStart, tickCooldowns]);''',
    "rule-engine wiring",
)

replace_once(
    '''    onMoveCommitted({ pieceId: movedPieceId, from: fromTile, to: toTile });\n    onEnterTile(movedPieceId, toTile);\n    onTurnStart(gameState.currentPlayer);\n  }, [\n    boardAdapter,\n    gameState.moveHistory,\n    gameState.currentPlayer,\n    onEnterTile,\n    onMoveCommitted,\n    onTurnStart,\n  ]);''',
    '''    onMoveCommitted({ pieceId: movedPieceId, from: fromTile, to: toTile });\n    onEnterTile(movedPieceId, toTile);\n  }, [\n    boardAdapter,\n    gameState.moveHistory,\n    onEnterTile,\n    onMoveCommitted,\n  ]);''',
    "move lifecycle",
)

replace_once(
    '''        setCoachError(fallbackReason);\n        safeToast({\n          title: "Coach IA indisponible",\n          description: fallbackReason,\n          variant: "destructive",\n        });\n\n        const fallbackMessage = buildCoachFallbackMessage({''',
    '''        setCoachError(fallbackReason);\n        if (trigger === "manual") {\n          safeToast({\n            title: "Analyse locale activée",\n            description:\n              "Le coach distant est temporairement indisponible. Voltus poursuit avec l’analyse embarquée.",\n          });\n        }\n\n        const fallbackMessage = buildCoachFallbackMessage({''',
    "coach fallback",
)

replace_once(
    '''  const openCoachPanel = useCallback(() => {\n    document.getElementById("coach-panel")?.scrollIntoView({\n      behavior: "smooth",\n      block: "start",\n    });\n  }, []);\n\n  /* ------------------------------------------------------------------------ */''',
    '''  const openCoachPanel = useCallback(() => {\n    document.getElementById("coach-panel")?.scrollIntoView({\n      behavior: "smooth",\n      block: "start",\n    });\n  }, []);\n\n  const boardFxRef = useRef<HTMLDivElement>(null);\n  const toFxCellPosition = useCallback((cell: string) => {\n    const boardElement = boardFxRef.current;\n    const cellElement = boardElement?.querySelector<HTMLElement>(\n      `[data-chess-cell="${cell}"]`,\n    );\n    if (!boardElement || !cellElement) return { x: 0, y: 0 };\n    const boardRect = boardElement.getBoundingClientRect();\n    const cellRect = cellElement.getBoundingClientRect();\n    return {\n      x: cellRect.left - boardRect.left + cellRect.width / 2,\n      y: cellRect.top - boardRect.top + cellRect.height / 2,\n    };\n  }, []);\n\n  /* ------------------------------------------------------------------------ */''',
    "fx geometry",
)

replace_once(
    '''  return (\n    <main className="mx-auto w-full max-w-7xl px-4 py-6">''',
    '''  return (\n    <FxProvider boardRef={boardFxRef} toCellPos={toFxCellPosition}>\n      <RuleRuntimeBridge vfxAdapter={vfxAdapter} />\n      <main className="mx-auto w-full max-w-7xl px-4 py-6">''',
    "provider opening",
)

replace_once(
    '''        <div className="rounded-lg border border-white/10 bg-black/20 p-4">\n          <ChessBoard\n            board={gameState.board}\n            selected={gameState.selectedPiece?.position || null}\n            validMoves={gameState.validMoves}\n            visualEffects={gameState.visualEffects}\n            specialAttacks={gameState.specialAttacks}\n            lastMove={gameState.moveHistory[gameState.moveHistory.length - 1]}\n            currentPlayer={gameState.currentPlayer}\n            onSquareClick={handleSquareClick}\n          />\n        </div>''',
    '''        <div\n          ref={boardFxRef}\n          className="relative rounded-lg border border-white/10 bg-black/20 p-4"\n        >\n          <ChessBoard\n            board={gameState.board}\n            selected={gameState.selectedPiece?.position || null}\n            validMoves={gameState.validMoves}\n            visualEffects={gameState.visualEffects}\n            specialAttacks={gameState.specialAttacks}\n            lastMove={gameState.moveHistory[gameState.moveHistory.length - 1]}\n            currentPlayer={gameState.currentPlayer}\n            onSquareClick={handleSquareClick}\n          />\n          <div className="mt-4">\n            <RuleActionDock\n              actions={uiActions}\n              boardAdapter={boardAdapter}\n              selectedPiecePosition={\n                gameState.selectedPiece?.position ?? null\n              }\n              currentPlayer={gameState.currentPlayer}\n              disabled={\n                gameState.gameStatus !== "active" || waitingForOpponent\n              }\n              runAction={runUIAction}\n            />\n          </div>\n        </div>''',
    "board and action dock",
)

replace_once(
    '''        error={coachError}\n        moveCount={gameState.moveHistory.length}''',
    '''        remoteUnavailable={Boolean(coachError)}\n        moveCount={gameState.moveHistory.length}''',
    "coach avatar prop",
)

replace_once(
    '''      />\n    </main>\n  );\n};''',
    '''      />\n      </main>\n    </FxProvider>\n  );\n};''',
    "provider closing",
)

PLAY.write_text(text, encoding="utf-8")
print("Play.tsx wired to stable rule runtime, FX provider, actions and coach fallback")
