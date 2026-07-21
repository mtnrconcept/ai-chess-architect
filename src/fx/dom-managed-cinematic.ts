import { supabase, supabaseDiagnostics } from "@/integrations/supabase/client";
import {
  parseManagedCinematicResourceId,
  RULE_ASSET_BUCKET,
  type ManagedCinematicMotion,
} from "./managed-asset-ids";

const TILE_PATTERN = /^[a-h][1-8]$/;
const MAX_CONCURRENT = 3;
let activeAnimations = 0;

const findCell = (tile: string): HTMLElement | null => {
  const candidates = document.querySelectorAll<HTMLElement>(
    `[data-chess-cell="${tile}"]`,
  );
  let winner: HTMLElement | null = null;
  let winnerArea = 0;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const width = Math.max(
      0,
      Math.min(rect.right, window.innerWidth) - Math.max(0, rect.left),
    );
    const height = Math.max(
      0,
      Math.min(rect.bottom, window.innerHeight) - Math.max(0, rect.top),
    );
    const area = width * height;
    if (area > winnerArea) {
      winner = candidate;
      winnerArea = area;
    }
  }
  return winner;
};

const finishAnimation = async (animation: Animation): Promise<void> => {
  try {
    await animation.finished;
  } catch {
    // Navigation and component unmount may cancel an animation safely.
  }
};

const imageLoaded = (image: HTMLImageElement, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (image.complete) {
      image.naturalWidth > 0 ? resolve() : reject(new Error("IMAGE_LOAD_FAILED"));
      return;
    }
    const timeout = window.setTimeout(
      () => cleanup(() => reject(new Error("IMAGE_TIMEOUT"))),
      timeoutMs,
    );
    const onLoad = () => cleanup(resolve);
    const onError = () => cleanup(() => reject(new Error("IMAGE_LOAD_FAILED")));
    const cleanup = (done: () => void) => {
      window.clearTimeout(timeout);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      done();
    };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
  });

const publicAssetUrl = (resourceId: string): string => {
  const parsed = parseManagedCinematicResourceId(resourceId);
  if (!parsed) throw new Error("INVALID_MANAGED_ASSET_ID");
  const { data } = supabase.storage
    .from(RULE_ASSET_BUCKET)
    .getPublicUrl(parsed.storagePath);
  const actual = new URL(data.publicUrl);
  const configured = supabaseDiagnostics.resolvedUrl;
  if (!configured) throw new Error("SUPABASE_NOT_CONFIGURED");
  const expectedOrigin = new URL(configured).origin;
  const expectedPath = `/storage/v1/object/public/${RULE_ASSET_BUCKET}/${parsed.storagePath}`;
  if (
    actual.protocol !== "https:" ||
    actual.origin !== expectedOrigin ||
    actual.pathname !== expectedPath ||
    actual.search ||
    actual.hash ||
    actual.username ||
    actual.password
  ) {
    throw new Error("MANAGED_ASSET_URL_REJECTED");
  }
  return actual.toString();
};

const proceduralActor = (motion: ManagedCinematicMotion): HTMLElement => {
  const actor = document.createElement("div");
  actor.textContent = motion === "burst" ? "✦" : motion === "carry" ? "🐉" : "🦅";
  Object.assign(actor.style, {
    position: "absolute",
    left: "-64px",
    top: "-64px",
    width: "128px",
    height: "128px",
    display: "grid",
    placeItems: "center",
    fontSize: "86px",
    lineHeight: "1",
    filter:
      "drop-shadow(0 12px 20px rgba(2,6,23,.85)) drop-shadow(0 0 16px rgba(34,211,238,.55))",
    userSelect: "none",
  });
  return actor;
};

async function runActor(
  actor: HTMLElement,
  target: DOMRect,
  motion: ManagedCinematicMotion,
): Promise<void> {
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  const fromLeft = centerX > window.innerWidth / 2;
  const startX = fromLeft ? -150 : window.innerWidth + 150;
  const exitX = fromLeft ? window.innerWidth + 150 : -150;
  const direction = fromLeft ? 1 : -1;
  const targetTransform = `translate(${centerX}px, ${centerY - 34}px) scaleX(${direction})`;
  const frames: Keyframe[] =
    motion === "burst"
      ? [
          {
            opacity: 0,
            transform: `translate(${centerX}px, ${centerY}px) scale(.1)`,
          },
          {
            opacity: 1,
            transform: `translate(${centerX}px, ${centerY}px) scale(1.15)`,
            offset: 0.45,
          },
          {
            opacity: 0,
            transform: `translate(${centerX}px, ${centerY}px) scale(2.2)`,
          },
        ]
      : [
          {
            opacity: 0,
            transform: `translate(${startX}px, ${Math.max(80, centerY - 180)}px) rotate(${10 * direction}deg) scaleX(${direction})`,
          },
          { opacity: 1, transform: targetTransform, offset: 0.45 },
          { opacity: 1, transform: targetTransform, offset: 0.58 },
          {
            opacity: 0,
            transform: `translate(${exitX}px, -160px) rotate(${-8 * direction}deg) scaleX(${direction})`,
          },
        ];
  await finishAnimation(
    actor.animate(frames, {
      duration: motion === "burst" ? 1100 : 1850,
      easing: "cubic-bezier(.22,.8,.24,1)",
      fill: "forwards",
    }),
  );
}

export async function playProceduralCinematicDom(
  motion: ManagedCinematicMotion,
  tile: string,
): Promise<void> {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !TILE_PATTERN.test(tile) ||
    activeAnimations >= MAX_CONCURRENT
  ) {
    return;
  }
  const cell = findCell(tile);
  if (!cell) return;
  activeAnimations += 1;
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    pointerEvents: "none",
    overflow: "hidden",
  });
  const actor = proceduralActor(motion);
  root.append(actor);
  document.body.append(root);
  try {
    await runActor(actor, cell.getBoundingClientRect(), motion);
  } finally {
    root.remove();
    activeAnimations = Math.max(0, activeAnimations - 1);
  }
}

export async function playManagedCinematicDom(
  resourceId: string,
  tile: string,
): Promise<void> {
  const parsed = parseManagedCinematicResourceId(resourceId);
  if (!parsed) return;
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !TILE_PATTERN.test(tile) ||
    activeAnimations >= MAX_CONCURRENT
  ) {
    return;
  }
  const cell = findCell(tile);
  if (!cell) return;

  activeAnimations += 1;
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    pointerEvents: "none",
    overflow: "hidden",
  });

  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.draggable = false;
  image.src = publicAssetUrl(resourceId);
  Object.assign(image.style, {
    position: "absolute",
    left: "-100px",
    top: "-100px",
    width: "200px",
    height: "200px",
    objectFit: "contain",
    filter:
      "drop-shadow(0 18px 24px rgba(2,6,23,.75)) drop-shadow(0 0 18px rgba(34,211,238,.45))",
    userSelect: "none",
  });
  root.append(image);
  document.body.append(root);

  try {
    await imageLoaded(image, 4000);
    await runActor(image, cell.getBoundingClientRect(), parsed.motion);
  } catch {
    root.remove();
    activeAnimations = Math.max(0, activeAnimations - 1);
    await playProceduralCinematicDom(parsed.motion, tile);
    return;
  } finally {
    if (root.isConnected) {
      root.remove();
      activeAnimations = Math.max(0, activeAnimations - 1);
    }
  }
}
