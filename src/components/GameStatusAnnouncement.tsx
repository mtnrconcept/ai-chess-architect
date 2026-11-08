import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Crown } from "lucide-react";
import { Chess } from "chess.js";

export type ChessAnnouncementKind = "check" | "checkmate";

export function announcementFromFen(fen: string): ChessAnnouncementKind | null {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return "checkmate";
    if (chess.isCheck()) return "check";
    return null;
  } catch {
    return null; // No false positive from an invalid or partial server FEN.
  }
}

export function announcementFromGameStatus(status: string): ChessAnnouncementKind | null {
  if (status === "checkmate") return "checkmate";
  if (status === "check") return "check";
  return null;
}

type ActiveAnnouncement = { id: string; kind: ChessAnnouncementKind };
interface GameStatusAnnouncementProps {
  /** Identifies an authoritative board transition (move number / revision). */
  positionId: string;
  kind: ChessAnnouncementKind | null;
  onAnnounce?: (kind: ChessAnnouncementKind) => void;
}

export default function GameStatusAnnouncement({
  positionId,
  kind,
  onAnnounce,
}: GameStatusAnnouncementProps) {
  const reducedMotion = useReducedMotion();
  const lastShownRef = useRef<string | null>(null);
  const announcerRef = useRef(onAnnounce);
  const [visible, setVisible] = useState<ActiveAnnouncement | null>(null);
  announcerRef.current = onAnnounce;

  useEffect(() => {
    // A defensive reply may remove check before the banner timeout.
    // Always clear the previous announcement when the position is no longer in check.
    if (!kind || !positionId) {
      setVisible(null);
      return;
    }
    if (lastShownRef.current === positionId) return;
    lastShownRef.current = positionId;
    setVisible({ id: positionId, kind });
    announcerRef.current?.(kind);
    const timer = window.setTimeout(
      () => setVisible((previous) => previous?.id === positionId ? null : previous),
      kind === "checkmate" ? 3350 : 2050,
    );
    return () => window.clearTimeout(timer);
  }, [kind, positionId]);

  const isMate = visible?.kind === "checkmate";
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center overflow-hidden"
      aria-live={isMate ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={visible.id}
            role={isMate ? "alert" : "status"}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: .72, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.14, filter: "blur(7px)" }}
            transition={{ duration: reducedMotion ? .01 : .35, ease: [0.22, 1, 0.36, 1] }}
            className={
              "relative mx-4 max-w-[95%] overflow-hidden rounded-3xl border-2 px-5 py-6 text-center shadow-[0_25px_85px_rgba(0,0,0,.75)] backdrop-blur-xl sm:px-12 sm:py-9 " +
              (isMate
                ? "border-amber-300/85 bg-gradient-to-br from-[#26132d]/95 via-[#482415]/95 to-[#110a17]/95 text-amber-100"
                : "border-rose-300/80 bg-gradient-to-br from-[#4c111e]/95 via-[#1b0a18]/95 to-[#180a23]/95 text-rose-50")
            }
          >
            <motion.div
              aria-hidden="true"
              className={"absolute inset-0 rounded-3xl border-2 " +
                (isMate ? "border-amber-200/30" : "border-rose-300/30")}
              animate={reducedMotion ? undefined : { opacity: [.9, .25, .9], scale: [1, 1.08, 1] }}
              transition={{ duration: isMate ? 1.25 : .9, repeat: 2 }}
            />
            <div className="relative flex flex-col items-center gap-3">
              {isMate
                ? <Crown aria-hidden="true" className="h-9 w-9 text-amber-300 sm:h-12 sm:w-12" />
                : <AlertTriangle aria-hidden="true" className="h-9 w-9 text-rose-300 sm:h-12 sm:w-12" />}
              <span className="text-[clamp(1.9rem,6vw,4.4rem)] font-black uppercase leading-none tracking-[.08em] [text-shadow:0_4px_22px_rgba(0,0,0,.6)]">
                {isMate ? "Échec et mat !" : "Échec !"}
              </span>
              <span className={"text-sm font-semibold tracking-[.16em] sm:text-base " +
                (isMate ? "text-amber-200" : "text-rose-200")}>
                {isMate ? "LA PARTIE EST TERMINÉE" : "LE ROI EST MENACÉ"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
