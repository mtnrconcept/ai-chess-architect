import { BoardAPI, Tile, PieceID, Piece, Side, SpriteId } from "../types";
import { ChessPiece, Position } from "@/types/chess";

type ChessPieceWithId = ChessPiece & { __engineId?: PieceID };

const PIECE_ID_PREFIX = "piece_";

type ChessBoard = (ChessPiece | null)[][];

interface PieceEntry {
  piece: ChessPiece;
  position: Position;
}

export class ChessBoardAdapter implements BoardAPI {
  private board: ChessBoard;
  private pieceMap: Map<PieceID, PieceEntry>;
  private positionMap: Map<string, PieceID>;
  private nextId = 1;
  private decals: Map<string, SpriteId | null>;

  constructor(board: ChessBoard) {
    this.board = board;
    this.pieceMap = new Map();
    this.positionMap = new Map();
    this.decals = new Map();
    this.rebuildPieceMap();
  }

  private rebuildPieceMap() {
    this.pieceMap.clear();
    this.positionMap.clear();
    this.board.forEach((row, rowIndex) => {
      row.forEach((piece, colIndex) => {
        if (piece) {
          const position = { row: rowIndex, col: colIndex };
          const id = this.getOrCreatePieceId(piece as ChessPieceWithId);
          const tile = this.positionToTile(position);
          this.pieceMap.set(id, { piece, position });
          this.positionMap.set(this.getTileKey(tile), id);
        }
      });
    });
  }

  private generatePieceId(): PieceID {
    const id = `${PIECE_ID_PREFIX}${this.nextId++}` as PieceID;
    return id;
  }

  private getOrCreatePieceId(piece: ChessPieceWithId): PieceID {
    if (!piece.__engineId) {
      piece.__engineId = this.generatePieceId();
    } else {
      this.syncNextId(piece.__engineId);
    }
    return piece.__engineId;
  }

  private syncNextId(id: PieceID) {
    const match = typeof id === "string" ? id.match(/^piece_(\d+)$/) : null;
    if (!match) return;
    const numericId = parseInt(match[1], 10);
    if (!Number.isNaN(numericId) && numericId >= this.nextId) {
      this.nextId = numericId + 1;
    }
  }

  private positionToTile(pos: Position): Tile {
    const file = String.fromCharCode(97 + pos.col);
    const rank = (8 - pos.row).toString();
    return `${file}${rank}` as Tile;
  }

  tileToPosition(tile: Tile): Position {
    const file = tile.charCodeAt(0) - 97;
    const rank = 8 - parseInt(tile[1]);
    return { row: rank, col: file };
  }

  getPiecesInRadius(center: Position, radius: number): PieceID[] {
    const result: PieceID[] = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const distance = Math.max(
          Math.abs(row - center.row),
          Math.abs(col - center.col),
        );

        if (distance <= radius) {
          const tile = this.positionToTile({ row, col });
          const pieceId = this.positionMap.get(this.getTileKey(tile));
          if (pieceId) {
            result.push(pieceId);
          }
        }
      }
    }

    return result;
  }

  private getTileKey(tile: Tile): string {
    return tile;
  }

  tiles(): Tile[] {
    const tiles: Tile[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        tiles.push(this.positionToTile({ row, col }));
      }
    }
    return tiles;
  }

  isEmpty(tile: Tile): boolean {
    const pos = this.tileToPosition(tile);
    return this.board[pos.row]?.[pos.col] === null;
  }

  getPieceAt(tile: Tile): PieceID | null {
    return this.positionMap.get(this.getTileKey(tile)) ?? null;
  }

  getPiece(id: PieceID): Piece {
    const entry = this.getOrResolvePiece(id);
    if (!entry) {
      throw new Error(`Piece not found: ${id}`);
    }

    return {
      id,
      type: entry.piece.type,
      side: entry.piece.color as Side,
      tile: this.positionToTile(entry.position),
      statuses: entry.piece.specialState ?? {},
    };
  }

  setPieceTile(id: PieceID, tile: Tile): void {
    const entry = this.getOrResolvePiece(id);
    if (!entry) {
      throw new Error(`Piece not found: ${id}`);
    }
    const chessPiece = entry.piece as ChessPieceWithId;
    const oldPos = entry.position;
    const newPos = this.tileToPosition(tile);

    this.board[oldPos.row][oldPos.col] = null;
    chessPiece.position = newPos;
    this.board[newPos.row][newPos.col] = chessPiece;

    const oldTileKey = this.getTileKey(this.positionToTile(oldPos));
    this.positionMap.delete(oldTileKey);

    entry.position = newPos;
    this.pieceMap.set(id, entry);
    const newTileKey = this.getTileKey(tile);
    this.positionMap.set(newTileKey, id);
  }

  removePiece(id: PieceID): void {
    const entry = this.getOrResolvePiece(id, false);
    if (!entry) {
      return;
    }

    const pos = entry.position;
    this.board[pos.row][pos.col] = null;
    this.pieceMap.delete(id);
    this.positionMap.delete(this.getTileKey(this.positionToTile(pos)));
  }

  spawnPiece(type: string, side: Side, tile: Tile): PieceID {
    const pos = this.tileToPosition(tile);
    const newPiece: ChessPieceWithId = {
      type: type as ChessPiece["type"],
      color: side as ChessPiece["color"],
      position: pos,
      hasMoved: false,
      isHidden: false,
    };

    this.board[pos.row][pos.col] = newPiece;
    const id = this.getOrCreatePieceId(newPiece);
    this.pieceMap.set(id, { piece: newPiece, position: pos });
    this.positionMap.set(this.getTileKey(tile), id);

    return id;
  }

  withinBoard(tile: Tile): boolean {
    const pos = this.tileToPosition(tile);
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
  }

  neighbors(tile: Tile, radius: number = 1): Tile[] {
    const pos = this.tileToPosition(tile);
    const neighbors: Tile[] = [];

    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr === 0 && dc === 0) continue;

        const newPos = { row: pos.row + dr, col: pos.col + dc };
        if (
          newPos.row >= 0 &&
          newPos.row < 8 &&
          newPos.col >= 0 &&
          newPos.col < 8
        ) {
          neighbors.push(this.positionToTile(newPos));
        }
      }
    }

    return neighbors;
  }

  setDecal(tile: Tile, spriteId: SpriteId | null): void {
    this.decals.set(this.getTileKey(tile), spriteId);
  }

  clearDecal(tile: Tile): void {
    this.decals.delete(this.getTileKey(tile));
  }

  getDecal(tile: Tile): SpriteId | null {
    return this.decals.get(this.getTileKey(tile)) ?? null;
  }

  getBoard(): ChessBoard {
    return this.board;
  }

  updateBoard(newBoard: ChessBoard): void {
    this.board = newBoard;
    this.rebuildPieceMap();
  }

  private getOrResolvePiece(
    id: PieceID,
    throwIfMissing: boolean = true,
  ): PieceEntry | null {
    const cached = this.pieceMap.get(id);
    if (cached) {
      return cached;
    }

    if (throwIfMissing) {
      throw new Error(`Piece not found: ${id}`);
    }

    return null;
  }
}
