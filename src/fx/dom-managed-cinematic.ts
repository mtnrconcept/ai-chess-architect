import { parseManagedCinematicResourceId } from "./managed-asset-ids";
import { resolveManagedAssetPublicUrl } from "./managed-assets";

const TILE_PATTERN = /^[a-h][1-8]$/;
const MAX_ANIMATION_MS = 2_400;
const MAX_CONCURRENT_CINEMATICS = 3;
let activeCinematics = 0;

const waitForImage = (
  image: HTMLImageElement,
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (image.complete) {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve();
      } else {
        reject(new Error("Impossible de charger l'asset géré."));
      }
      return;
    }

    const finish = (callback: () => void) => {
      window.clearTimeout(timeout);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      callback();
    };
    const onLoad = () => finish(resolve);
    const onError = () =>
      finish(() => reject(new Error("Impossible de charger l'asset géré.")));
    const timeout = window.setTimeout(
      () =>
        finish(() =>
          reject(new Error("Délai de chargement de l'asset dépassé.")),
        ),
      timeoutMs,
    );

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
  });

const finishAnimation = async (animation: Animation): Promise<void> => {
  try {
    await animation.finished;
  } catch {
    // Une navigation ou un démontage peut annuler l'animation sans erreur métier.
  }
};

const findVisibleCell = (tile: string): HTMLElement | null => {
  const candidates = document.querySelectorAll<HTMLElement>(
    `[data-chess-cell="${tile}"]`,
  );
  let best: { element: HTMLElement; area: number } | null = null;

  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
    );
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
    );
    const area = visibleWidth * visibleHeight;
    if (area > 0 && (!best || area > best.area)) {
      best = { element, area };
    }
  }

  return best?.element ?? null;
};

export async function playManagedCinematicDom(
  resourceId: string,
  tile: string,
): Promise<void> {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !TILE_PATTERN.test(tile) ||
    activeCinematics >= MAX_CONCURRENT_CINEMATICS
  ) {
    return;
  }

  const resource = parseManagedCinematicResourceId(resourceId);
  if (!resource) return;

  const targetCell = findVisibleCell(tile);
  if (!targetCell) return;

  const targetRect = targetCell.getBoundingClientRect();
  if (targetRect.width <= 0 || targetRect.height <= 0) return;

  const publicUrl = resolveManagedAssetPublicUrl(resource.resourceId);
  activeCinematics += 1;

  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "1px",
    height: "1px",
    zIndex: "2147483000",
    pointerEvents: "none",
    contain: "layout style",
    overflow: "visible",
  });

  const image = document.createElement("img");
  image.alt = "";
  image.draggable = false;
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.src = publicUrl;

  const actorSize = Math.min(
    240,
    Math.max(104, Math.round(targetRect.width * 3.1)),
  );
  Object.assign(image.style, {
    position: "absolute",
    left: `${-actorSize / 2}px`,
    top: `${-actorSize / 2}px`,
    width: `${actorSize}px`,
    height: `${actorSize}px`,
    objectFit: "contain",
    filter:
      "drop-shadow(0 18px 24px rgba(2,6,23,.72)) drop-shadow(0 0 18px rgba(56,189,248,.4))",
    userSelect: "none",
  });

  const carriedPiece = document.createElement("span");
  carriedPiece.textContent = "♟";
  Object.assign(carriedPiece.style, {
    position: "absolute",
    left: "50%",
    top: `${Math.round(actorSize * 0.23)}px`,
    transform: "translateX(-50%)",
    color: "#f8fafc",
    fontSize: `${Math.max(28, Math.round(targetRect.width * 0.78))}px`,
    lineHeight: "1",
    opacity: "0",
    textShadow:
      "0 4px 8px rgba(2,6,23,.95), 0 0 12px rgba(248,250,252,.9)",
  });

  root.append(image, carriedPiece);
  document.body.appendChild(root);

  try {
    await waitForImage(image, 4_000);

    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    const enterFromLeft = targetX >= window.innerWidth / 2;
    const direction = enterFromLeft ? 1 : -1;
    const startX = enterFromLeft ? -actorSize : window.innerWidth + actorSize;
    const exitX = enterFromLeft ? window.innerWidth + actorSize : -actorSize;
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (reducedMotion) {
      carriedPiece.style.opacity = "1";
      await finishAnimation(
        root.animate(
          [
            {
              opacity: 0,
              transform: `translate(${targetX}px, ${targetY - 18}px)`,
            },
            {
              opacity: 1,
              transform: `translate(${targetX}px, ${targetY - 18}px)`,
            },
            {
              opacity: 0,
              transform: `translate(${targetX}px, ${targetY - 18}px)`,
            },
          ],
          { duration: 900, easing: "ease-out" },
        ),
      );
      return;
    }

    const commonTarget = `translate(${targetX}px, ${targetY - 30}px) scaleX(${direction})`;
    const actorFrames: Keyframe[] =
      resource.motion === "burst"
        ? [
            {
              opacity: 0,
              transform: `translate(${targetX}px, ${targetY}px) scale(.08) scaleX(${direction})`,
              offset: 0,
            },
            {
              opacity: 1,
              transform: `${commonTarget} scale(.82)`,
              offset: 0.28,
            },
            { opacity: 1, transform: commonTarget, offset: 0.48 },
            {
              opacity: 0,
              transform: `translate(${exitX}px, ${-actorSize}px) rotate(${-10 * direction}deg) scaleX(${direction})`,
              offset: 1,
            },
          ]
        : resource.motion === "swoop"
          ? [
              {
                opacity: 0,
                transform: `translate(${startX}px, ${-actorSize}px) rotate(${12 * direction}deg) scaleX(${direction})`,
                offset: 0,
              },
              { opacity: 1, transform: commonTarget, offset: 0.48 },
              { opacity: 1, transform: commonTarget, offset: 0.58 },
              {
                opacity: 0,
                transform: `translate(${exitX}px, ${window.innerHeight + actorSize}px) rotate(${-12 * direction}deg) scaleX(${direction})`,
                offset: 1,
              },
            ]
          : [
              {
                opacity: 0,
                transform: `translate(${startX}px, ${Math.max(actorSize / 2, targetY - actorSize)}px) rotate(${7 * direction}deg) scaleX(${direction})`,
                offset: 0,
              },
              { opacity: 1, transform: commonTarget, offset: 0.45 },
              { opacity: 1, transform: commonTarget, offset: 0.58 },
              {
                opacity: 0,
                transform: `translate(${exitX}px, ${-actorSize}px) rotate(${-9 * direction}deg) scaleX(${direction})`,
                offset: 1,
              },
            ];

    const duration = resource.motion === "burst" ? 1_450 : 1_900;
    const actorAnimation = root.animate(actorFrames, {
      duration: Math.min(duration, MAX_ANIMATION_MS),
      easing: "cubic-bezier(.22,.8,.24,1)",
      fill: "forwards",
    });
    const pieceAnimation = carriedPiece.animate(
      [
        {
          opacity: 0,
          transform: "translateX(-50%) translateY(12px) scale(.75)",
        },
        {
          opacity: 0,
          transform: "translateX(-50%) translateY(12px) scale(.75)",
          offset: 0.38,
        },
        {
          opacity: 1,
          transform: "translateX(-50%) translateY(0) scale(1)",
          offset: 0.5,
        },
        {
          opacity: 1,
          transform: "translateX(-50%) translateY(0) scale(1)",
          offset: 0.86,
        },
        {
          opacity: 0,
          transform: "translateX(-50%) translateY(-8px) scale(.9)",
        },
      ],
      { duration, easing: "ease-out", fill: "forwards" },
    );

    await Promise.all([
      finishAnimation(actorAnimation),
      finishAnimation(pieceAnimation),
    ]);
  } finally {
    root.remove();
    activeCinematics = Math.max(0, activeCinematics - 1);
  }
}
