import {getAnimationAssetUrl} from "@/fx/animationLibrary";
/**
 * Bundled, allow-listed Aichess GIFs. Never accept arbitrary URLs from a rule:
 * sprite IDs are resolved only against immutable site assets.
 */
export const CATALOG_GIFS = {
  aichess_lightning: "/rule-gifs/lightning.gif",
  aichess_fire: "/rule-gifs/fire.gif",
  aichess_sand: "/rule-gifs/sand.gif",
  aichess_ice: "/rule-gifs/ice.gif",
  aichess_portal: "/rule-gifs/portal.gif",
  aichess_robot: "/rule-gifs/pawn.gif",
  aichess_knight: "/rule-gifs/knight.gif",
  aichess_bishop: "/rule-gifs/bishop.gif",
  aichess_rook: "/rule-gifs/rook.gif",
  aichess_queen: "/rule-gifs/queen.gif",
} as const;

export type CatalogGifId = keyof typeof CATALOG_GIFS;
export const getCatalogGifUrl = (id: string): string | null =>
  Object.prototype.hasOwnProperty.call(CATALOG_GIFS, id)
    ? CATALOG_GIFS[id as CatalogGifId]
    : getAnimationAssetUrl(id);

const TILE = /^[a-h][1-8]$/;
const DURATION_MS = 1920;
const MAX_ACTIVE = 4;
let active = 0;

export async function playCatalogGifDom(id: string, tile: string): Promise<void> {
  const url = getCatalogGifUrl(id);
  if (!url || typeof document === "undefined" || typeof window === "undefined" ||
      !TILE.test(tile) || active >= MAX_ACTIVE) return;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-chess-cell="${tile}"]`),
  );
  const cell = candidates
    .map((node) => ({node,rect:node.getBoundingClientRect()}))
    .filter(({rect}) => rect.width > 0 && rect.height > 0)
    .sort((a,b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0];
  if (!cell) return;
  active++;
  const root = document.createElement("div");
  root.setAttribute("data-aichess-catalog-fx", id);
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, {
    position:"fixed",inset:"0",pointerEvents:"none",overflow:"hidden",zIndex:"2147482999",
  });
  const image = document.createElement("img");
  image.alt = "";
  image.draggable = false;
  image.decoding = "async";
  image.src = url;
  const size = Math.max(108, Math.min(320, cell.rect.width * 2.6));
  Object.assign(image.style, {
    position:"absolute",
    left:`${cell.rect.left + cell.rect.width / 2 - size / 2}px`,
    top:`${cell.rect.top + cell.rect.height / 2 - size / 2}px`,
    width:`${size}px`,height:`${size}px`,objectFit:"contain",
    filter:"drop-shadow(0 8px 16px rgba(0,0,0,.5))",
  });
  root.append(image);
  document.body.append(root);
  try {
    // The effect cannot alter board state. Image load failures are cosmetic.
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, DURATION_MS);
      const done = () => { window.clearTimeout(timeout); resolve(); };
      image.addEventListener("error",done,{once:true});
      image.addEventListener("load",() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        if (!reduced && typeof image.animate === "function") {
          image.animate(
            [{opacity:0,transform:"scale(.75)"},{opacity:1,transform:"scale(1)",offset:.18},{opacity:1,transform:"scale(1)",offset:.78},{opacity:0,transform:"scale(1.12)"}],
            {duration:DURATION_MS,easing:"ease-in-out",fill:"forwards"},
          );
        }
      },{once:true});
    });
  } finally {
    root.remove();
    active = Math.max(0,active - 1);
  }
}
