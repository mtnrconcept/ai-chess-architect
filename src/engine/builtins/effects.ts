import { Registry } from "../registry";
import { Tile } from "../types";

export function registerBuiltinEffects(reg: Registry) {
  reg.registerEffect("vfx.play", (ctx, p) => {
    if (p?.sprite && p?.tile) {
      ctx.engine.vfx.playAnimation(p.sprite, p.tile);
    }
  });

  reg.registerEffect("audio.play", (ctx, p) => {
    if (p?.id) {
      ctx.engine.vfx.playAudio(p.id);
    }
  });

  reg.registerEffect("decal.set", (ctx, p) => {
    if (p?.tile && p?.sprite) {
      ctx.engine.board.setDecal(p.tile, p.sprite);
    }
  });

  reg.registerEffect("decal.clear", (ctx, p) => {
    if (p?.tile) {
      ctx.engine.board.clearDecal(p.tile);
    }
  });

  reg.registerEffect("turn.end", (ctx) => {
    ctx.engine.match.endTurn();
  });

  reg.registerEffect("cooldown.set", (ctx, p) => {
    if (p?.pieceId && p?.actionId) {
      ctx.engine.cooldown.set(p.pieceId, p.actionId, p.turns ?? 1);
    }
  });

  reg.registerEffect("piece.capture", (ctx, p) => {
    if (p?.pieceId) {
      ctx.engine.capturePiece(p.pieceId, p.reason);
    }
  });

  reg.registerEffect("piece.move", (ctx, p) => {
    if (p?.pieceId && p?.to) {
      ctx.engine.board.setPieceTile(p.pieceId, p.to);
    }
  });

  reg.registerEffect("piece.spawn", (ctx, p) => {
    if (p?.type && p?.side && p?.tile) {
      ctx.engine.board.spawnPiece(p.type, p.side, p.tile);
    }
  });

  reg.registerEffect("piece.duplicate", (ctx, p) => {
    if (p?.sourceId && p?.tile) {
      try {
        const q = ctx.engine.board.getPiece(p.sourceId);
        ctx.engine.board.spawnPiece(q.type, q.side, p.tile);
      } catch (error) {
        console.warn('Failed to duplicate piece:', error);
      }
    }
  });

  reg.registerEffect("piece.setInvisible", (ctx, p) => {
    if (p?.pieceId !== undefined) {
      try {
        const piece = ctx.engine.board.getPiece(p.pieceId);
        piece.invisible = !!p.value;
      } catch (error) {
        console.warn('Failed to set invisibility:', error);
      }
    }
  });

  reg.registerEffect("piece.setStatus", (ctx, p) => {
    if (p?.pieceId && p?.key) {
      try {
        const piece = ctx.engine.board.getPiece(p.pieceId);
        piece.statuses = piece.statuses ?? {};
        piece.statuses[p.key] = p.value;
      } catch (error) {
        console.warn('Failed to set status:', error);
      }
    }
  });

  reg.registerEffect("piece.clearStatus", (ctx, p) => {
    if (p?.pieceId && p?.key) {
      try {
        const piece = ctx.engine.board.getPiece(p.pieceId);
        if (piece.statuses) {
          delete piece.statuses[p.key];
        }
      } catch (error) {
        console.warn('Failed to clear status:', error);
      }
    }
  });

  reg.registerEffect("tile.setTrap", (ctx, p) => {
    if (p?.tile && p?.kind) {
      const st = ctx.state;
      st.traps = st.traps ?? {};
      st.traps[p.tile] = {
        kind: p.kind,
        owner: p.owner ?? ctx.engine.match.get().turnSide,
        data: p.data ?? {}
      };
      ctx.engine.board.setDecal(p.tile, p.sprite ?? "trap_icon");
    }
  });

  reg.registerEffect("tile.clearTrap", (ctx, p) => {
    if (p?.tile) {
      const st = ctx.state;
      if (st.traps) {
        delete st.traps[p.tile];
      }
      ctx.engine.board.clearDecal(p.tile);
    }
  });

  reg.registerEffect("tile.resolveTrap", (ctx, p) => {
    if (!p?.tile) return;

    const st = ctx.state;
    const t = st.traps?.[p.tile];
    if (!t) return;

    if (t.kind === "quicksand") {
      const pid = ctx.engine.board.getPieceAt(p.tile);
      if (pid) {
        ctx.engine.capturePiece(pid, "quicksand");
      }

      if (!p.persistent) {
        reg.runEffect({ action: "tile.clearTrap", params: { tile: p.tile } }, ctx);
      }

      ctx.engine.vfx.playAnimation("quicksand_splash", p.tile);
      ctx.engine.vfx.playAudio("sink");
    }
  });

  reg.registerEffect("area.forEachTile", (ctx, p) => {
    const tiles: Tile[] = p?.tiles ?? (p?.center ? [p.center] : []);
    tiles.forEach((tile: Tile) => {
      const effects = p?.effects ?? [];
      effects.forEach((e: any) => {
        reg.runEffect(e, { ...ctx, targetTile: tile });
      });
    });
  });

  reg.registerEffect("composite", (ctx, p) => {
    const steps = p?.steps ?? [];
    steps.forEach((s: any) => reg.runEffect(s, ctx));
  });

  reg.registerEffect("state.pushUndo", (ctx) => {
    ctx.engine.state.pushUndo();
  });

  reg.registerEffect("ui.toast", (ctx, p) => {
    if (p?.message) {
      ctx.engine.ui.toast(p.message);
    }
  });
}
