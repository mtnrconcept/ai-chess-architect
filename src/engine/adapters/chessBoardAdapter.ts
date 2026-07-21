import type {
  BoardAPI,
  Piece,
  PieceID,
  Side,
  SpriteId,
  Tile,
} from "../types";
import type { ChessPiece, Position } from "@/types/chess";

type ChessPieceWithEngineId = ChessPiece & { __engineId?: PieceID };
export type ChessBoardSnapshot = (ChessPiece | null)[][];
export type BoardChangeListener = (board: ChessBoardSnapshot) => void;
export type DecalChangeListener = (
  tile: Tile,
  spriteId: SpriteId | null,
) => void;

interface PieceEntry {
  piece: ChessPieceWithEngineId;
  position: Position;
}

const BOARD_SIZE = 8;
const TILE_PATTERN = /^[a-h][1-8]$/;
const PIECE_ID_PATTERN = /^piece_(\d+)$/;

const clonePosition = (position: Position): Position => ({
  row: position.row,
  col: position.col,
});

const clonePiece = (piece: ChessPieceWithEngineId): ChessPieceWithEngineId => ({
  ...piece,
  position: clonePosition(piece.position),
  specialState:
    piece.specialState && typeof piece.specialState === "object"
      ? structuredClone(piece.specialState)
      : piece.specialState,
});

const cloneBoard = (board: ChessBoardSnapshot): ChessBoardSnapshot =>
  Array.from({ length: BOARD_SIZE }, (_, rowIndex) =>
    Array.from({ length: BOARD_SIZE }, (_, colIndex) => {
      const piece = board[rowIndex]?.[colIndex] ?? null;
      return piece ? clonePiece(piece as ChessPieceWithEngineId) : null;
    }),
  );

/** Stable bridge between React state and the deterministic rule runtime. */
export class ChessBoardAdapter implements BoardAPI {
  private board: ChessBoardSnapshot;
  private readonly pieceMap = new Map<PieceID, PieceEntry>();
  private readonly positionMap = new Map<Tile, PieceID>();
  private readonly decals = new Map<Tile, SpriteId>();
  private nextId = 1;
  private boardChangeListener?: BoardChangeListener;
  private decalChangeListener?: DecalChangeListener;

  constructor(board: ChessBoardSnapshot) {
    this.board = cloneBoard(board);
    this.rebuildPieceMap(board);
  }

  setBoardChangeListener(listener?: BoardChangeListener): void {
    this.boardChangeListener = listener;
  }

  setDecalChangeListener(listener?: DecalChangeListener): void {
    this.decalChangeListener = listener;
  }

  notifyRuntimeMutation(): void {
    this.emitBoardChange();
  }

  private emitBoardChange(): void {
    this.boardChangeListener?.(cloneBoard(this.board));
  }

  private generatePieceId(): PieceID {
    const id = `piece_${this.nextId}` as PieceID;
    this.nextId += 1;
    return id;
  }

  private syncNextId(id: PieceID): void {
    const match = PIECE_ID_PATTERN.exec(String(id));
    if (!match) return;
    const numericId = Number(match[1]);
    if (Number.isInteger(numericId) && numericId >= this.nextId) {
      this.nextId = numericId + 1;
    }
  }

  private getOrCreatePieceId(
    source: ChessPieceWithEngineId,
    clonedPiece: ChessPieceWithEngineId,
  ): PieceID {
    const existing = source.__engineId ?? clonedPiece.__engineId;
    const id = existing || this.generatePieceId();
    source.__engineId = id;
    clonedPiece.__engineId = id;
    this.syncNextId(id);
    return id;
  }

  private rebuildPieceMap(sourceBoard?: ChessBoardSnapshot): void {
    this.pieceMap.clear();
    this.positionMap.clear();

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const clonedPiece = this.board[row]?.[col] as
          | ChessPieceWithEngineId
          | null
          | undefined;
        if (!clonedPiece) continue;

        const sourcePiece =
          (sourceBoard?.[row]?.[col] as ChessPieceWithEngineId | null) ??
          clonedPiece;
        const position = { row, col };
        clonedPiece.position = clonePosition(position);
        const id = this.getOrCreatePieceId(sourcePiece, clonedPiece);
        const tile = this.positionToTile(position);
        this.pieceMap.set(id, { piece: clonedPiece, position });
        this.positionMap.set(tile, id);
      }
    }
  }

  private assertTile(tile: Tile): Position {
    if (!TILE_PATTERN.test(String(tile))) {
      throw new Error(`Invalid board tile: ${String(tile)}`);
    }
    return this.tileToPosition(tile);
  }

  private positionToTile(position: Position): Tile {
    const file = String.fromCharCode(97 + position.col);
    const rank = String(BOARD_SIZE - position.row);
    return `${file}${rank}` as Tile;
  }

  tileToPosition(tile: Tile): Position {
    if (!TILE_PATTERN.test(String(tile))) return { row: -1, col: -1 };
    return {
      row: BOARD_SIZE - Number(String(tile)[1]),
      col: String(tile).charCodeAt(0) - 97,
    };
  }

  getPiecesInRadius(center: Position, radius: number): PieceID[] {
    const safeRadius = Math.max(0, Math.min(BOARD_SIZE, Math.floor(radius)));
    const result: PieceID[] = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (
          Math.max(Math.abs(row - center.row), Math.abs(col - center.col)) >
          safeRadius
        ) {
          continue;
        }
        const id = this.positionMap.get(this.positionToTile({ row, col }));
        if (id) result.push(id);
      }
    }
    return result;
  }

  tiles(): Tile[] {
    const result: Tile[] = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        result.push(this.positionToTile({ row, col }));
      }
    }
    return result;
  }

  withinBoard(tile: Tile): boolean {
    return TILE_PATTERN.test(String(tile));
  }

  isEmpty(tile: Tile): boolean {
    const position = this.assertTile(tile);
    return this.board[position.row]?.[position.col] == null;
  }

  getPieceAt(tile: Tile): PieceID | null {
    this.assertTile(tile);
    return this.positionMap.get(tile) ?? null;
  }

  getPiece(id: PieceID): Piece {
    const entry = this.pieceMap.get(id);
    if (!entry) throw new Error(`Piece not found: ${id}`);
    if (!entry.piece.specialState || typeof entry.piece.specialState !== "object") {
      entry.piece.specialState = {};
    }

    const view: Piece = {
      id,
      type: entry.piece.type,
      side: entry.piece.color as Side,
      tile: this.positionToTile(entry.position),
      hasMoved: entry.piece.hasMoved,
      invisible: entry.piece.isHidden === true,
      statuses: entry.piece.specialState,
    };

    Object.defineProperty(view, "invisible", {
      configurable: true,
      enumerable: true,
      get: () => entry.piece.isHidden === true,
      set: (value: boolean) => this.setPieceInvisible(id, Boolean(value)),
    });
    return view;
  }

  setPieceTile(id: PieceID, tile: Tile): void {
    const entry = this.pieceMap.get(id);
    if (!entry) throw new Error(`Piece not found: ${id}`);
    const destination = this.assertTile(tile);
    const occupant = this.positionMap.get(tile);
    if (occupant && occupant !== id) {
      throw new Error(`Destination occupied: ${tile}`);
    }

    const source = clonePosition(entry.position);
    const nextBoard = cloneBoard(this.board);
    nextBoard[source.row][source.col] = null;

    const movedPiece = clonePiece(entry.piece);
    movedPiece.position = clonePosition(destination);
    nextBoard[destination.row][destination.col] = movedPiece;
    this.board = nextBoard;

    this.positionMap.delete(this.positionToTile(source));
    this.positionMap.set(tile, id);
    this.pieceMap.set(id, { piece: movedPiece, position: destination });
    this.emitBoardChange();
  }

  removePiece(id: PieceID): void {
    const entry = this.pieceMap.get(id);
    if (!entry) return;
    const nextBoard = cloneBoard(this.board);
    nextBoard[entry.position.row][entry.position.col] = null;
    this.board = nextBoard;
    this.pieceMap.delete(id);
    this.positionMap.delete(this.positionToTile(entry.position));
    this.emitBoardChange();
  }

  spawnPiece(type: string, side: Side, tile: Tile): PieceID {
    const position = this.assertTile(tile);
    if (!this.isEmpty(tile)) throw new Error(`Destination occupied: ${tile}`);

    const piece: ChessPieceWithEngineId = {
      type: type as ChessPiece["type"],
      color: side as ChessPiece["color"],
      position: clonePosition(position),
      hasMoved: false,
      isHidden: false,
      specialState: {},
    };
    const id = this.generatePieceId();
    piece.__engineId = id;

    const nextBoard = cloneBoard(this.board);
    nextBoard[position.row][position.col] = piece;
    this.board = nextBoard;
    this.pieceMap.set(id, { piece, position });
    this.positionMap.set(tile, id);
    this.emitBoardChange();
    return id;
  }

  setPieceInvisible(id: PieceID, invisible: boolean): void {
    const entry = this.pieceMap.get(id);
    if (!entry) throw new Error(`Piece not found: ${id}`);
    entry.piece.isHidden = invisible;
    this.emitBoardChange();
  }

  setPieceStatus(id: PieceID, key: string, value: unknown): void {
    const entry = this.pieceMap.get(id);
    if (!entry) throw new Error(`Piece not found: ${id}`);
    const safeKey = String(key).trim().slice(0, 80);
    if (!safeKey) throw new Error("Status key is required");
    if (!entry.piece.specialState || typeof entry.piece.specialState !== "object") {
      entry.piece.specialState = {};
    }
    (entry.piece.specialState as Record<string, unknown>)[safeKey] =
      structuredClone(value);
    this.emitBoardChange();
  }

  clearPieceStatus(id: PieceID, key: string): void {
    const entry = this.pieceMap.get(id);
    if (!entry) throw new Error(`Piece not found: ${id}`);
    if (entry.piece.specialState && typeof entry.piece.specialState === "object") {
      delete (entry.piece.specialState as Record<string, unknown>)[key];
      this.emitBoardChange();
    }
  }

  neighbors(tile: Tile, radius = 1): Tile[] {
    const origin = this.assertTile(tile);
    const safeRadius = Math.max(1, Math.min(BOARD_SIZE - 1, Math.floor(radius)));
    const result: Tile[] = [];
    for (let rowDelta = -safeRadius; rowDelta <= safeRadius; rowDelta += 1) {
      for (let colDelta = -safeRadius; colDelta <= safeRadius; colDelta += 1) {
        if (rowDelta === 0 && colDelta === 0) continue;
        const candidate = {
          row: origin.row + rowDelta,
          col: origin.col + colDelta,
        };
        if (
          candidate.row >= 0 &&
          candidate.row < BOARD_SIZE &&
          candidate.col >= 0 &&
          candidate.col < BOARD_SIZE
        ) {
          result.push(this.positionToTile(candidate));
        }
      }
    }
    return result;
  }

  setDecal(tile: Tile, spriteId: SpriteId | null): void {
    this.assertTile(tile);
    if (spriteId === null) this.decals.delete(tile);
    else this.decals.set(tile, spriteId);
    this.decalChangeListener?.(tile, spriteId);
  }

  clearDecal(tile: Tile): void {
    this.assertTile(tile);
    this.decals.delete(tile);
    this.decalChangeListener?.(tile, null);
  }

  getDecal(tile: Tile): SpriteId | null {
    this.assertTile(tile);
    return this.decals.get(tile) ?? null;
  }

  getBoard(): ChessBoardSnapshot {
    return cloneBoard(this.board);
  }

  serialize(): string {
    return JSON.stringify({
      board: this.board,
      decals: Array.from(this.decals.entries()),
      nextId: this.nextId,
    });
  }

  deserialize(payload: string): void {
    const parsed = JSON.parse(payload) as {
      board?: ChessBoardSnapshot;
      decals?: Array<[Tile, SpriteId]>;
      nextId?: number;
    };
    if (
      !Array.isArray(parsed.board) ||
      parsed.board.length !== BOARD_SIZE ||
      parsed.board.some(
        (row) => !Array.isArray(row) || row.length !== BOARD_SIZE,
      )
    ) {
      throw new Error("Invalid board snapshot.");
    }

    this.board = cloneBoard(parsed.board);
    this.decals.clear();
    for (const entry of parsed.decals ?? []) {
      if (
        Array.isArray(entry) &&
        entry.length === 2 &&
        TILE_PATTERN.test(String(entry[0])) &&
        typeof entry[1] === "string"
      ) {
        this.decals.set(entry[0], entry[1]);
      }
    }
    this.nextId =
      Number.isInteger(parsed.nextId) && Number(parsed.nextId) > 0
        ? Number(parsed.nextId)
        : 1;
    this.rebuildPieceMap();
    this.emitBoardChange();
  }

  updateBoard(newBoard: ChessBoardSnapshot): void {
    this.board = cloneBoard(newBoard);
    this.rebuildPieceMap(newBoard);
  }
}
