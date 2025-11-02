import { BoardAPI, Tile, PieceID, Piece, Side, SpriteId } from "../types";
import { ChessPiece, Position } from "@/types/chess";

type ChessBoard = (ChessPiece | null)[][];

interface PieceEntry {
  piece: ChessPiece;
  position: Position;
}

export class ChessBoardAdapter implements BoardAPI {
  private board: ChessBoard;
  private pieceMap: Map<PieceID, PieceEntry>;
  private decals: Map<string, SpriteId | null>;

  constructor(board: ChessBoard) {
    this.board = board;
    this.pieceMap = new Map();
    this.decals = new Map();
    this.rebuildPieceMap();
  }

  private rebuildPieceMap() {
    this.pieceMap.clear();
    this.board.forEach((row, rowIndex) => {
      row.forEach((piece, colIndex) => {
        if (piece) {
          const position = { row: rowIndex, col: colIndex };
          const id = this.createPieceId(position);
          this.pieceMap.set(id, { piece, position });
        }
      });
    });
  }

  private createPieceId(pos: Position): PieceID {
    return `p_${pos.row}_${pos.col}` as PieceID;
  }

  private parsePieceId(id: PieceID): Position | null {
    const match = id.match(/^p_(\d+)_(\d+)$/);
    if (!match) return null;
    return { row: parseInt(match[1]), col: parseInt(match[2]) };
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
          const piece = this.board[row]?.[col];
          if (piece) {
            result.push(this.createPieceId({ row, col }));
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
    const pos = this.tileToPosition(tile);
    const piece = this.board[pos.row]?.[pos.col];
    if (!piece) return null;
    return this.createPieceId(pos);
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
    const chessPiece = entry.piece;
    const oldPos = entry.position;
    const newPos = this.tileToPosition(tile);

    this.board[oldPos.row][oldPos.col] = null;
    chessPiece.position = newPos;
    this.board[newPos.row][newPos.col] = chessPiece;

    this.pieceMap.delete(id);
    const newId = this.createPieceId(newPos);
    this.pieceMap.set(newId, { piece: chessPiece, position: newPos });
  }

  removePiece(id: PieceID): void {
    const entry = this.getOrResolvePiece(id, false);
    if (!entry) {
      return;
    }

    const pos = entry.position;
    this.board[pos.row][pos.col] = null;
    this.pieceMap.delete(id);
  }

  spawnPiece(type: string, side: Side, tile: Tile): PieceID {
    const pos = this.tileToPosition(tile);
    const newPiece: ChessPiece = {
      type: type as ChessPiece["type"],
      color: side as ChessPiece["color"],
      position: pos,
      hasMoved: false,
      isHidden: false,
    };

    this.board[pos.row][pos.col] = newPiece;
    const id = this.createPieceId(pos);
    this.pieceMap.set(id, { piece: newPiece, position: pos });

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

    const pos = this.parsePieceId(id);
    if (!pos) {
      if (throwIfMissing) {
        throw new Error(`Piece not found: ${id}`);
      }
      return null;
    }

    const piece = this.board[pos.row]?.[pos.col] ?? null;
    if (!piece) {
      if (throwIfMissing) {
        throw new Error(`Piece not found: ${id}`);
      }
      return null;
    }

    const entry: PieceEntry = { piece, position: pos };
    this.pieceMap.set(id, entry);
    return entry;
  }
}
