import { Registry } from "../registry";
import { Tile } from "../types";

export function registerBuiltinEffects(reg: Registry) {
  reg.registerEffect("vfx.play", (ctx, p: any) => {
    if (p?.sprite && p?.tile) {
      ctx.engine.vfx.playAnimation(p.sprite, p.tile);
    }
  });

  reg.registerEffect("audio.play", (ctx, p: any) => {
    if (p?.id) {
      ctx.engine.vfx.playAudio(p.id);
    }
  });

  reg.registerEffect("decal.set", (ctx, p: any) => {
    if (p?.tile && p?.sprite) {
      ctx.engine.board.setDecal(p.tile as Tile, p.sprite as string);
    }
  });

  reg.registerEffect("decal.clear", (ctx, p: any) => {
    if (p?.tile) {
      ctx.engine.board.clearDecal(p.tile as Tile);
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

  // Promotion générique: remplace la pièce par une nouvelle du type demandé, au même emplacement
  // Fallback compatible avec l'API BoardAPI: remove + spawn pour éviter les mutations internes
  reg.registerEffect("piece.promote", (ctx, p) => {
    const pieceId = p?.pieceId || ctx.pieceId;
    const toType = p?.toType || p?.type || p?.newType;
    if (!pieceId || !toType) {
      console.warn("[effect] piece.promote: pieceId ou toType manquant", p);
      return;
    }
    try {
      const current = ctx.engine.board.getPiece(pieceId);
      // Retirer l'ancienne pièce puis en créer une nouvelle du type voulu à la même case et même camp
      ctx.engine.board.removePiece(pieceId);
      ctx.engine.board.spawnPiece(toType, current.side, current.tile);
    } catch (error) {
      console.warn("[effect] piece.promote a échoué:", error);
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

  reg.registerEffect("piece.setStatus", (ctx, p: any) => {
    if (p?.pieceId && p?.key) {
      try {
        const piece = ctx.engine.board.getPiece(p.pieceId);
        piece.statuses = piece.statuses ?? {};
        piece.statuses[p.key as string] = p.value;
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

  // Alias pour compatibilité : board.capture → piece.capture
  reg.registerEffect("board.capture", (ctx, p) => {
    const pieceId = p?.pieceId || ctx.targetPieceId;
    if (!pieceId) {
      console.warn("[effect] board.capture: aucun pieceId fourni");
      return;
    }
    
    // Déléguer à piece.capture via runEffect
    reg.runEffect({
      action: "piece.capture",
      params: { pieceId, reason: p?.reason }
    }, ctx);
  });

  reg.registerEffect("ui.toast", (ctx, p) => {
    if (p?.message) {
      ctx.engine.ui.toast(p.message);
    }
  });

  reg.registerEffect("board.areaEffect", (ctx, p) => {
    if (!p?.center || p?.radius === undefined || !p?.action || !p?.actionParams) {
      console.warn("[effect] board.areaEffect: paramètres manquants", p);
      return;
    }

    try {
      // Convertir center en position
      const centerPos = ctx.engine.board.tileToPosition ? 
        ctx.engine.board.tileToPosition(p.center) : 
        null;
      
      if (!centerPos) {
        console.warn("[effect] board.areaEffect: impossible de convertir la position", p.center);
        return;
      }

      // Trouver toutes les pièces dans le rayon
      const affectedPieces = ctx.engine.board.getPiecesInRadius(centerPos, p.radius);
      console.log(`[effect] board.areaEffect: ${affectedPieces.length} pièces affectées dans rayon ${p.radius}`);

      // Appliquer l'action à chaque pièce
      affectedPieces.forEach(pieceId => {
        if (p.action === "status.add") {
          const statusId = p.actionParams.statusId || p.actionParams.key;
          const duration = p.actionParams.duration || 1;
          const icon = p.actionParams.icon || "⚠️";
          
          reg.runEffect({
            action: "status.add",
            params: {
              pieceId,
              key: statusId,
              duration,
              metadata: { icon, ...p.actionParams.metadata }
            }
          }, ctx);
        } else if (p.action === "piece.capture") {
          reg.runEffect({
            action: "piece.capture",
            params: { pieceId, reason: p.actionParams.reason }
          }, ctx);
        }
      });
    } catch (error) {
      console.error("[effect] board.areaEffect failed:", error);
    }
  });

  // Phase 1: Status management effects
  reg.registerEffect("status.add", (ctx, p) => {
    if (p?.pieceId && p?.key) {
      try {
        const piece = ctx.engine.board.getPiece(p.pieceId);
        piece.statuses = piece.statuses ?? {};
        piece.statuses[p.key] = {
          active: true,
          duration: p.duration ?? -1, // -1 = permanent
          metadata: p.metadata ?? {},
          appliedAt: ctx.engine.match.get().ply
        };
      } catch (error) {
        console.warn('Failed to add status:', error);
      }
    }
  });

  reg.registerEffect("status.remove", (ctx, p) => {
    if (p?.pieceId && p?.key) {
      try {
        const piece = ctx.engine.board.getPiece(p.pieceId);
        if (piece.statuses?.[p.key]) {
          delete piece.statuses[p.key];
        }
      } catch (error) {
        console.warn('Failed to remove status:', error);
      }
    }
  });

  reg.registerEffect("status.tickAll", (ctx) => {
    // Décrémente tous les statuts temporisés du camp actif
    const side = ctx.params?.side || ctx.engine.match.get().turnSide;
    const allPieces = ctx.engine.board.tiles()
      .map(t => ctx.engine.board.getPieceAt(t))
      .filter(pid => pid !== null)
      .map(pid => ctx.engine.board.getPiece(pid!))
      .filter(p => p.side === side);

    allPieces.forEach(piece => {
      if (!piece.statuses) return;
      
      Object.entries(piece.statuses).forEach(([key, status]) => {
        if (typeof status === 'object' && status !== null && 'active' in status && 'duration' in status) {
          const typedStatus = status as { active: boolean; duration: number; metadata?: any; appliedAt?: number };
          if (typedStatus.active && typedStatus.duration > 0) {
            typedStatus.duration--;
            
            if (typedStatus.duration === 0) {
              // Émettre événement d'expiration
              ctx.engine.eventBus.emit('status.expired', {
                pieceId: piece.id,
                statusKey: key,
                tile: piece.tile
              });
              delete piece.statuses![key];
            }
          }
        }
      });
    });
  });

  // Phase 3: State management effects
  reg.registerEffect("state.set", (ctx, p) => {
    if (!p?.path || p?.value === undefined) return;
    const keys = p.path.split('.');
    let current = ctx.state;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = current[keys[i]] ?? {};
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = p.value;
  });

  reg.registerEffect("state.inc", (ctx, p) => {
    if (!p?.path) return;
    const keys = p.path.split('.');
    let current = ctx.state;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = current[keys[i]] ?? {};
      current = current[keys[i]];
    }
    
    const lastKey = keys[keys.length - 1];
    current[lastKey] = (current[lastKey] ?? p.default ?? 0) + (p.by ?? 1);
  });

  reg.registerEffect("state.delete", (ctx, p) => {
    if (!p?.path) return;
    const keys = p.path.split('.');
    let current = ctx.state;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) return;
      current = current[keys[i]];
    }
    
    delete current[keys[keys.length - 1]];
  });
}
