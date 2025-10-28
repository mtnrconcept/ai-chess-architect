import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const chessPieces = ["♔", "♕", "♗", "♘", "♖", "♙"];

const vfxEffects = [
  { name: "Hologramme", color: "#00F1FF" },
  { name: "Explosion", color: "#FF6A00" },
  { name: "Gel", color: "#76E0FF" },
  { name: "Lumière", color: "#FFD166" },
];

interface ChessMorphingAnimationProps {
  duration?: number;
}

export function ChessMorphingAnimation({
  duration = 3000,
}: ChessMorphingAnimationProps) {
  const [currentPieceIndex, setCurrentPieceIndex] = useState(0);
  const [currentEffectIndex, setCurrentEffectIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const pieceInterval = duration / chessPieces.length;
    const effectInterval = duration / vfxEffects.length;

    const pieceTimer = setInterval(() => {
      setCurrentPieceIndex((prev) => (prev + 1) % chessPieces.length);
    }, pieceInterval);

    const effectTimer = setInterval(() => {
      setCurrentEffectIndex((prev) => (prev + 1) % vfxEffects.length);
    }, effectInterval);

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 100 / (duration / 50);
      });
    }, 50);

    return () => {
      clearInterval(pieceTimer);
      clearInterval(effectTimer);
      clearInterval(progressTimer);
    };
  }, [duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Particules d'effet
      for (let i = 0; i < 20; i++) {
        const angle = (Date.now() / 1000 + i * 0.3) % (Math.PI * 2);
        const radius = 80 + Math.sin(Date.now() / 500 + i) * 20;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        ctx.fillStyle = vfxEffects[currentEffectIndex].color + "40";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Effet de glow autour de la pièce
      const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        40,
        centerX,
        centerY,
        120,
      );
      gradient.addColorStop(0, vfxEffects[currentEffectIndex].color + "80");
      gradient.addColorStop(0.5, vfxEffects[currentEffectIndex].color + "20");
      gradient.addColorStop(1, vfxEffects[currentEffectIndex].color + "00");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      requestAnimationFrame(animate);
    };

    animate();
  }, [currentEffectIndex]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-8">
      {/* Canvas pour les effets de particules */}
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="absolute"
        style={{ filter: "blur(2px)" }}
      />

      {/* Pièce d'échecs animée */}
      <motion.div
        key={`piece-${currentPieceIndex}`}
        initial={{ scale: 0.5, opacity: 0, rotateY: -180 }}
        animate={{
          scale: 1,
          opacity: 1,
          rotateY: 0,
          rotate: [0, 10, -10, 0],
        }}
        exit={{ scale: 0.5, opacity: 0, rotateY: 180 }}
        transition={{
          duration: 0.6,
          ease: "easeInOut",
          rotate: { repeat: Infinity, duration: 2 },
        }}
        className="relative z-10 text-[120px] select-none"
        style={{
          textShadow: `0 0 40px ${vfxEffects[currentEffectIndex].color}, 0 0 80px ${vfxEffects[currentEffectIndex].color}`,
          filter: `drop-shadow(0 0 20px ${vfxEffects[currentEffectIndex].color})`,
        }}
      >
        {chessPieces[currentPieceIndex]}
      </motion.div>

      {/* Nom de l'effet VFX */}
      <motion.div
        key={`effect-${currentEffectIndex}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="text-xl font-bold tracking-wider"
        style={{ color: vfxEffects[currentEffectIndex].color }}
      >
        Effet : {vfxEffects[currentEffectIndex].name}
      </motion.div>

      {/* Texte de chargement */}
      <div className="flex flex-col items-center gap-3 z-10">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-lg text-foreground/80 font-medium"
        >
          Génération de la règle en cours...
        </motion.p>

        {/* Barre de progression */}
        <div className="w-64 h-2 bg-background/40 rounded-full overflow-hidden backdrop-blur-sm border border-border/30">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${vfxEffects[0].color}, ${vfxEffects[1].color}, ${vfxEffects[2].color}, ${vfxEffects[3].color})`,
              width: `${progress}%`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </div>

      {/* Anneaux de rotation */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2"
            style={{
              width: 150 + i * 50,
              height: 150 + i * 50,
              borderColor: vfxEffects[currentEffectIndex].color + "30",
            }}
            animate={{
              rotate: 360,
              scale: [1, 1.1, 1],
            }}
            transition={{
              rotate: { duration: 3 + i, repeat: Infinity, ease: "linear" },
              scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
            }}
          />
        ))}
      </div>
    </div>
  );
}
