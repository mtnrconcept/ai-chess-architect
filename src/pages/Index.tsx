import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Bomb,
  Crown,
  Flame,
  Gamepad2,
  Radar,
  Sparkles,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  {
    label: "Lobby",
    to: "/lobby",
    icon: Users,
    accent: "from-purple-500 via-indigo-400 to-blue-300",
  },
  {
    label: "Jouer",
    to: "/play",
    icon: Gamepad2,
    accent: "from-cyan-400 via-sky-300 to-cyan-200",
  },
  {
    label: "Créer une règle",
    to: "/generator",
    icon: Sparkles,
    accent: "from-fuchsia-500 via-pink-400 to-rose-300",
  },
  {
    label: "Tournois",
    to: "/tournaments",
    icon: Trophy,
    accent: "from-amber-400 via-orange-300 to-yellow-200",
  },
  {
    label: "Profil",
    to: "/profile",
    icon: UserCircle,
    accent: "from-emerald-400 via-teal-300 to-cyan-200",
  },
];

const trendingVariants = [
  {
    title: "Anarchie totale",
    description: "Chaque tour ajoute une action chaotique générée par l'IA.",
    icon: Bomb,
  },
  {
    title: "Tunnels secrets",
    description: "Déplacez vos pièces via des portails quantiques cachés.",
    icon: Radar,
  },
  {
    title: "Grenades de pion",
    description: "Les pions explosent en défendant la dernière rangée.",
    icon: Flame,
  },
  {
    title: "Mission royale",
    description: "Protégez trois rois itinérants dans une partie à objectifs.",
    icon: Crown,
  },
];

const Index = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<"ia" | "joueur">("ia");

  const profileLink = user ? "/profile" : "/signup";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020312] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.2),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,0,200,0.2),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[580px] w-[780px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute left-[15%] top-1/3 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-[120px]" />
        <div className="absolute right-[12%] top-1/4 h-72 w-72 rounded-full bg-amber-400/15 blur-[120px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 py-12">
          <motion.header
            initial={{ opacity: 0, y: -30, rotateX: -15 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center gap-6 text-center"
            style={{ perspective: "1000px" }}
          >
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">
                Voltus-Chess · v9 Final
              </span>
              <h1 className="text-5xl font-bold leading-tight sm:text-6xl md:text-7xl">
                <span className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-transparent">
                  Maîtrisez l'arène
                </span>
                <br />
                <span className="text-white/80">
                  des variantes assistées par IA
                </span>
              </h1>
              <p className="mx-auto max-w-2xl text-base text-cyan-100/70 sm:text-lg">
                Composez vos règles, rejoignez la communauté et lancez
                instantanément des parties ultra rapides dans un hub futuriste.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs uppercase tracking-[0.4em] text-cyan-100/80 shadow-[0_0_25px_rgba(34,211,238,0.35)]">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.9)]" />
              <span>Serveurs synchronisés</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">Temps réel</span>
            </div>
          </motion.header>

          <section className="mx-auto flex w-full max-w-5xl justify-center">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" style={{ perspective: "1000px" }}>
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isProfile = item.to === "/profile";
              const to = isProfile ? profileLink : item.to;
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 50, rotateX: 45, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                  transition={{
                    duration: 0.6,
                    delay: 0.2 + index * 0.1,
                    ease: "easeOut",
                  }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <Link to={to} className="group relative block">
                    <div
                      className={`absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-gradient-to-r ${item.accent}`}
                    />
                    <div className="relative flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-6 py-8 text-center shadow-[0_0_35px_rgba(15,118,203,0.2)] backdrop-blur-xl transition-all duration-200 group-hover:border-transparent group-hover:shadow-[0_0_45px_rgba(255,255,255,0.25)]">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.35)]">
                        <Icon className="h-6 w-6 text-cyan-100" />
                      </span>
                      <span className="text-lg font-semibold">{item.label}</span>
                    </div>
                    <div
                      className={`pointer-events-none absolute inset-x-[18%] bottom-0 h-[3px] rounded-full bg-gradient-to-r ${item.accent}`}
                    />
                  </Link>
                </motion.div>
              );
            })}
            </div>
          </section>

          <section className="grid gap-10 lg:grid-cols-[3fr_2fr]" style={{ perspective: "1000px" }}>
            <motion.div
              initial={{ opacity: 0, x: -50, rotateY: -15 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
              className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-black/50 p-8 shadow-[0_0_55px_rgba(34,211,238,0.25)] backdrop-blur-xl"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="pointer-events-none absolute inset-x-12 top-0 h-1 bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400" />
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">
                      Variantes en tendance
                    </span>
                    <h2 className="mt-2 text-3xl font-bold text-white">
                      Explorer les mondes parallèles
                    </h2>
                  </div>
                  <Link to="/analysis">
                    <Button
                      variant="ghost"
                      className="rounded-full border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 transition-all hover:border-cyan-300 hover:bg-cyan-500/20"
                    >
                      Voir l'analyse
                    </Button>
                  </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {trendingVariants.map((variant) => {
                    const Icon = variant.icon;
                    return (
                      <div
                        key={variant.title}
                        className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_35px_rgba(34,211,238,0.15)] transition-all duration-200 hover:border-cyan-400/40 hover:shadow-[0_0_45px_rgba(244,114,182,0.35)]"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-100 shadow-[0_0_25px_rgba(34,211,238,0.4)]">
                          <Icon className="h-6 w-6" />
                        </span>
                        <h3 className="mt-4 text-xl font-semibold">
                          {variant.title}
                        </h3>
                        <p className="mt-2 text-sm text-cyan-100/70">
                          {variant.description}
                        </p>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-2">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className={`h-2.5 w-2.5 rounded-full ${index === 0 ? "bg-white shadow-[0_0_15px_rgba(255,255,255,0.65)]" : "bg-white/20"}`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50, rotateY: 15 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              transition={{ duration: 0.8, delay: 1, ease: "easeOut" }}
              className="flex flex-col gap-6 rounded-3xl border border-amber-400/20 bg-gradient-to-b from-black/60 via-black/40 to-black/60 p-8 shadow-[0_0_45px_rgba(251,191,36,0.2)] backdrop-blur-xl"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="flex flex-col gap-2 text-left">
                <span className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200/70">
                  Partie instantanée
                </span>
                <h2 className="text-3xl font-bold text-white">
                  Choisissez votre copilote
                </h2>
                <p className="text-sm text-amber-100/70">
                  Passez de l'entraînement assisté par l'IA aux défis contre des
                  adversaires humains.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-3 shadow-inner shadow-amber-400/10">
                <button
                  onClick={() => setMode("ia")}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                    mode === "ia"
                      ? "bg-amber-400/20 text-white shadow-[0_0_25px_rgba(251,191,36,0.45)]"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <span className="text-xs uppercase tracking-[0.3em]">IA</span>
                  <span className="text-lg">Mentor Voltus</span>
                </button>
                <div className="h-12 w-[1px] bg-white/10" />
                <button
                  onClick={() => setMode("joueur")}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                    mode === "joueur"
                      ? "bg-amber-400/20 text-white shadow-[0_0_25px_rgba(251,191,36,0.45)]"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <span className="text-xs uppercase tracking-[0.3em]">
                    Joueur
                  </span>
                  <span className="text-lg">Match public</span>
                </button>
              </div>
              <Button className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 py-6 text-lg font-semibold text-black shadow-[0_0_55px_rgba(251,191,36,0.35)] transition-transform hover:-translate-y-0.5">
                <span>Lancer une partie</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/20 text-black">
                  <Gamepad2 className="h-5 w-5" />
                </span>
              </Button>
              <div className="flex items-center justify-between text-xs text-amber-100/70">
                <span>
                  Mode sélectionné :{" "}
                  {mode === "ia" ? "Entraînement IA" : "Défi joueur"}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
                  <span>Connexion ultra stable</span>
                </span>
              </div>
            </motion.div>
          </section>
        </div>

        <motion.footer
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2, ease: "easeOut" }}
          className="border-t border-white/10 bg-black/30 py-6"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-6 text-center text-xs text-white/60 sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} Voltus-Chess. Propulsé par Lovable
              Cloud & Lovable AI.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/settings" className="hover:text-white">
                Paramètres
              </Link>
              <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:inline" />
              <Link to="/analysis" className="hover:text-white">
                Analyse
              </Link>
              <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:inline" />
              <Link to="/tournaments" className="hover:text-white">
                Tournois
              </Link>
              <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:inline" />
              <Link to="/legal" className="hover:text-white">
                CGU & Confidentialité
              </Link>
            </div>
          </div>
        </motion.footer>
      </div>
    </div>
  );
};

export default Index;
