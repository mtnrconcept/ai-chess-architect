import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import {
  Crown,
  Users,
  UserPlus,
  Globe2,
  Sparkle,
  Swords,
  Trophy,
  Flame,
  ChevronDown,
  Filter,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface LeaderboardPlayer {
  rang: number;
  pseudo: string;
  icone: "roi_orange" | "reine_bleue" | "cavalier_violet" | "profil_bleu" | "cavalier_orange";
  elo: number;
  winrate: string;
  serie: number | "–";
  score: number;
  couleur: string;
  bio?: string;
}

type LeaderboardMode = "global" | "variantes" | "region" | "amis";

type LeaderboardDataset = Record<LeaderboardMode, LeaderboardPlayer[]>;

const leaderboardDataset: LeaderboardDataset = {
  global: [
    {
      rang: 1,
      pseudo: "Joueur",
      icone: "roi_orange",
      elo: 2745,
      winrate: "72%",
      serie: 5,
      score: 2821,
      couleur: "#ff6c00",
      bio: "Architecte des ouvertures ultrarapides Voltus.",
    },
    {
      rang: 2,
      pseudo: "Freumeier",
      icone: "reine_bleue",
      elo: 2480,
      winrate: "72%",
      serie: 1,
      score: 2712,
      couleur: "#14e6ff",
      bio: "Spécialiste des finales IA-hybride, jamais à court d'énergie.",
    },
    {
      rang: 3,
      pseudo: "Majorane",
      icone: "cavalier_violet",
      elo: 2240,
      winrate: "52%",
      serie: 5,
      score: 2538,
      couleur: "#ff00c8",
      bio: "Attaques latérales inspirées des fractales quantiques.",
    },
    {
      rang: 4,
      pseudo: "Maxmme",
      icone: "profil_bleu",
      elo: 2020,
      winrate: "72%",
      serie: 3,
      score: 2268,
      couleur: "#4aa8ff",
      bio: "Ingénieure IA et tacticienne des variantes Blitz Flux.",
    },
    {
      rang: 5,
      pseudo: "Horse",
      icone: "cavalier_orange",
      elo: 1830,
      winrate: "49%",
      serie: 5,
      score: 2211,
      couleur: "#ff6c00",
      bio: "Ambassadeur des cavaliers holographiques sur Voltus.",
    },
    {
      rang: 6,
      pseudo: "Rook",
      icone: "profil_bleu",
      elo: 1630,
      winrate: "52%",
      serie: 5,
      score: 2143,
      couleur: "#14e6ff",
      bio: "Stratège défensif, invaincu en mode Bastion.",
    },
    {
      rang: 7,
      pseudo: "Française",
      icone: "profil_bleu",
      elo: 1748,
      winrate: "42%",
      serie: "–",
      score: 1980,
      couleur: "#4aa8ff",
      bio: "Maîtrise l'art des gambits asymétriques régionaux.",
    },
    {
      rang: 8,
      pseudo: "King",
      icone: "roi_orange",
      elo: 1748,
      winrate: "49%",
      serie: 0,
      score: 1897,
      couleur: "#ff6c00",
      bio: "Streamer Voltus Chess au rythme néon.",
    },
  ],
  variantes: [
    {
      rang: 1,
      pseudo: "Majorane",
      icone: "cavalier_violet",
      elo: 2320,
      winrate: "64%",
      serie: 4,
      score: 2472,
      couleur: "#ff00c8",
      bio: "Règne sur les variantes HyperKnight et Tempête.",
    },
    {
      rang: 2,
      pseudo: "Maxmme",
      icone: "profil_bleu",
      elo: 2155,
      winrate: "69%",
      serie: 6,
      score: 2390,
      couleur: "#4aa8ff",
      bio: "Crée des variantes IA communautaires chaque semaine.",
    },
    {
      rang: 3,
      pseudo: "Freumeier",
      icone: "reine_bleue",
      elo: 2080,
      winrate: "58%",
      serie: 2,
      score: 2244,
      couleur: "#14e6ff",
      bio: "Analyse les variantes en streaming avec Supabase Analytics.",
    },
    {
      rang: 4,
      pseudo: "Horse",
      icone: "cavalier_orange",
      elo: 1940,
      winrate: "55%",
      serie: 1,
      score: 2105,
      couleur: "#ff6c00",
      bio: "Domine les tournois Voltus Blitz modulaires.",
    },
    {
      rang: 5,
      pseudo: "Joueur",
      icone: "roi_orange",
      elo: 1908,
      winrate: "47%",
      serie: 3,
      score: 2059,
      couleur: "#ff6c00",
      bio: "Expérimente les variantes stochastiques AI-Morph.",
    },
    {
      rang: 6,
      pseudo: "Rook",
      icone: "profil_bleu",
      elo: 1866,
      winrate: "53%",
      serie: 2,
      score: 2012,
      couleur: "#14e6ff",
      bio: "Développeur des variantes coopératives Voltus Friends.",
    },
    {
      rang: 7,
      pseudo: "Française",
      icone: "profil_bleu",
      elo: 1750,
      winrate: "45%",
      serie: "–",
      score: 1928,
      couleur: "#4aa8ff",
      bio: "Ambassadrice de la variante Défense Marseille.",
    },
    {
      rang: 8,
      pseudo: "King",
      icone: "roi_orange",
      elo: 1722,
      winrate: "43%",
      serie: 1,
      score: 1884,
      couleur: "#ff6c00",
      bio: "Anime des défis variantes sur Voltus Live.",
    },
  ],
  region: [
    {
      rang: 1,
      pseudo: "Joueur",
      icone: "roi_orange",
      elo: 2690,
      winrate: "71%",
      serie: 7,
      score: 2862,
      couleur: "#ff6c00",
      bio: "Champion régional Neo-Paris.",
    },
    {
      rang: 2,
      pseudo: "Française",
      icone: "profil_bleu",
      elo: 2185,
      winrate: "56%",
      serie: 2,
      score: 2334,
      couleur: "#4aa8ff",
      bio: "Top 1 Marseille District.",
    },
    {
      rang: 3,
      pseudo: "Majorane",
      icone: "cavalier_violet",
      elo: 2140,
      winrate: "49%",
      serie: 3,
      score: 2275,
      couleur: "#ff00c8",
      bio: "Leader zone Alpes synthétiques.",
    },
    {
      rang: 4,
      pseudo: "Maxmme",
      icone: "profil_bleu",
      elo: 2098,
      winrate: "61%",
      serie: 4,
      score: 2210,
      couleur: "#4aa8ff",
      bio: "Championne régionale Côte Azure.",
    },
    {
      rang: 5,
      pseudo: "Freumeier",
      icone: "reine_bleue",
      elo: 2052,
      winrate: "55%",
      serie: 1,
      score: 2159,
      couleur: "#14e6ff",
      bio: "Résident Hub Berlin.",
    },
    {
      rang: 6,
      pseudo: "King",
      icone: "roi_orange",
      elo: 1984,
      winrate: "47%",
      serie: 1,
      score: 2066,
      couleur: "#ff6c00",
      bio: "Champion district Neon-London.",
    },
    {
      rang: 7,
      pseudo: "Horse",
      icone: "cavalier_orange",
      elo: 1872,
      winrate: "44%",
      serie: 2,
      score: 1989,
      couleur: "#ff6c00",
      bio: "Pilote d'événements régionaux Voltus.",
    },
    {
      rang: 8,
      pseudo: "Rook",
      icone: "profil_bleu",
      elo: 1798,
      winrate: "41%",
      serie: 0,
      score: 1888,
      couleur: "#14e6ff",
      bio: "Champion district Data-Bastion.",
    },
  ],
  amis: [
    {
      rang: 1,
      pseudo: "Maxmme",
      icone: "profil_bleu",
      elo: 2060,
      winrate: "68%",
      serie: 8,
      score: 2299,
      couleur: "#4aa8ff",
      bio: "Toujours connectée pour un duel coopératif.",
    },
    {
      rang: 2,
      pseudo: "Horse",
      icone: "cavalier_orange",
      elo: 1920,
      winrate: "51%",
      serie: 2,
      score: 2148,
      couleur: "#ff6c00",
      bio: "Partenaire de training nocturne.",
    },
    {
      rang: 3,
      pseudo: "Rook",
      icone: "profil_bleu",
      elo: 1825,
      winrate: "54%",
      serie: 1,
      score: 2056,
      couleur: "#14e6ff",
      bio: "Toujours prêt pour des analyses groupées.",
    },
    {
      rang: 4,
      pseudo: "Freumeier",
      icone: "reine_bleue",
      elo: 1986,
      winrate: "63%",
      serie: 3,
      score: 2190,
      couleur: "#14e6ff",
      bio: "Coach IA de l'équipe Voltus Crew.",
    },
    {
      rang: 5,
      pseudo: "King",
      icone: "roi_orange",
      elo: 1750,
      winrate: "48%",
      serie: 0,
      score: 1942,
      couleur: "#ff6c00",
      bio: "Organise les tournois privés du week-end.",
    },
    {
      rang: 6,
      pseudo: "Majorane",
      icone: "cavalier_violet",
      elo: 1844,
      winrate: "49%",
      serie: 2,
      score: 2014,
      couleur: "#ff00c8",
      bio: "Toujours là pour un challenge innovation.",
    },
    {
      rang: 7,
      pseudo: "Française",
      icone: "profil_bleu",
      elo: 1685,
      winrate: "39%",
      serie: "–",
      score: 1846,
      couleur: "#4aa8ff",
      bio: "Gardienne des sessions chill & analyse.",
    },
    {
      rang: 8,
      pseudo: "Joueur",
      icone: "roi_orange",
      elo: 2101,
      winrate: "74%",
      serie: 4,
      score: 2388,
      couleur: "#ff6c00",
      bio: "Toujours prêt à booster ses amis en duel.",
    },
  ],
};

const filterOptions = [
  { value: "elo-desc", label: "ELO décroissant" },
  { value: "elo-asc", label: "ELO croissant" },
  { value: "winrate-desc", label: "Winrate décroissant" },
  { value: "serie-desc", label: "Série la plus longue" },
  { value: "score-desc", label: "Score total" },
];

const tabItems: { id: LeaderboardMode; label: string; color: string; icon: JSX.Element }[] = [
  {
    id: "global",
    label: "GLOBAL",
    color: "#14e6ff",
    icon: <Globe2 className="h-4 w-4" />,
  },
  {
    id: "variantes",
    label: "VARIANTES",
    color: "#ff00c8",
    icon: <Sparkle className="h-4 w-4" />,
  },
  {
    id: "region",
    label: "RÉGION",
    color: "#a64dff",
    icon: <Users className="h-4 w-4" />,
  },
  {
    id: "amis",
    label: "AMIS",
    color: "#ff6c00",
    icon: <UserPlus className="h-4 w-4" />,
  },
];

const pieceIcon = (icon: LeaderboardPlayer["icone"], accent: string) => {
  const baseProps = "h-8 w-8";
  switch (icon) {
    case "roi_orange":
      return <Crown className={`${baseProps}`} style={{ color: accent }} />;
    case "reine_bleue":
      return <Trophy className={`${baseProps}`} style={{ color: accent }} />;
    case "cavalier_violet":
      return <Swords className={`${baseProps}`} style={{ color: accent }} />;
    case "profil_bleu":
      return <Users className={`${baseProps}`} style={{ color: accent }} />;
    case "cavalier_orange":
      return <Flame className={`${baseProps}`} style={{ color: accent }} />;
    default:
      return <Crown className={`${baseProps}`} style={{ color: accent }} />;
  }
};

const glowGradient = "bg-[radial-gradient(circle_at_top,_rgba(20,230,255,0.12),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(255,0,200,0.08),_transparent_60%)]";

const Leaderboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<LeaderboardMode>("global");
  const [filter, setFilter] = useState(filterOptions[0].value);
  const [liveData, setLiveData] = useState<LeaderboardPlayer[]>(leaderboardDataset.global);
  const [lastUpdatedRank, setLastUpdatedRank] = useState<number | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  useEffect(() => {
    setLiveData(leaderboardDataset[activeTab]);
  }, [activeTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveData((current) => {
        const randomIndex = Math.floor(Math.random() * current.length);
        const updated = current.map((player, index) => {
          if (index === randomIndex && typeof player.serie === "number") {
            return {
              ...player,
              score: Math.round(player.score + 5 + Math.random() * 20),
              serie: Math.min((player.serie ?? 0) + (Math.random() > 0.6 ? 1 : 0), 12),
            };
          }
          return player;
        });
        const targetPlayer = updated[randomIndex];
        setLastUpdatedRank(targetPlayer.rang);
        return updated;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (lastUpdatedRank && rowRefs.current[lastUpdatedRank]) {
      const row = rowRefs.current[lastUpdatedRank];
      gsap.fromTo(
        row,
        { boxShadow: "0 0 0px rgba(20,230,255,0.0)" },
        {
          boxShadow: "0 0 24px rgba(255,108,0,0.75)",
          duration: 0.6,
          yoyo: true,
          repeat: 1,
          ease: "power2.out",
        },
      );
    }
  }, [lastUpdatedRank]);

  const sortedData = useMemo(() => {
    const parsed = [...liveData];
    switch (filter) {
      case "elo-asc":
        return parsed.sort((a, b) => a.elo - b.elo);
      case "winrate-desc":
        return parsed.sort((a, b) => parseInt(b.winrate) - parseInt(a.winrate));
      case "serie-desc":
        return parsed.sort((a, b) => {
          const serieA = typeof a.serie === "number" ? a.serie : -1;
          const serieB = typeof b.serie === "number" ? b.serie : -1;
          return serieB - serieA;
        });
      case "score-desc":
        return parsed.sort((a, b) => b.score - a.score);
      case "elo-desc":
      default:
        return parsed.sort((a, b) => b.elo - a.elo);
    }
  }, [liveData, filter]);

  const handleRowClick = (player: LeaderboardPlayer) => {
    navigate(`/profile?player=${encodeURIComponent(player.pseudo)}`);
  };

  return (
    <div className={`relative min-h-screen overflow-hidden bg-[#03010b] text-white ${glowGradient}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,230,255,0.25),transparent_60%),radial-gradient(circle_at_80%_10%,rgba(255,0,200,0.25),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-[linear-gradient(180deg,rgba(20,230,255,0.25),transparent)] blur-2xl" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[linear-gradient(180deg,rgba(255,0,200,0.25),transparent)] blur-2xl" />

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 md:px-8">
        <header className="flex flex-col gap-3">
          <motion.span
            className="inline-flex items-center gap-2 self-start rounded-full border border-cyan-500/50 bg-cyan-500/10 px-4 py-1 text-xs uppercase tracking-[0.3em] text-cyan-300"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Voltus Chess — Classement
          </motion.span>
          <motion.h1
            className="text-4xl font-semibold text-cyan-100 md:text-5xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Voltus Chess – Page Classement Néon
          </motion.h1>
          <motion.p
            className="max-w-2xl text-sm text-cyan-200/70 md:text-base"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Comparez les performances globales, par variantes, régions ou entre amis. Interface inspirée d'une salle de données futuriste, mise à jour en temps réel.
          </motion.p>
        </header>

        <section className="flex flex-col gap-6">
          <motion.nav
            className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-black/30 p-2 shadow-[0_0_30px_rgba(20,230,255,0.25)]"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="relative overflow-hidden rounded-xl px-4 py-2 text-sm uppercase tracking-[0.2em] text-white/70 transition"
                style={{
                  color: activeTab === tab.id ? tab.color : undefined,
                }}
              >
                <motion.span
                  className="absolute inset-0 rounded-xl"
                  initial={false}
                  animate={
                    activeTab === tab.id
                      ? {
                          background: `linear-gradient(135deg, ${tab.color}33, transparent 70%)`,
                          boxShadow: `0 0 24px ${tab.color}66`,
                        }
                      : {
                          background: "transparent",
                          boxShadow: "none",
                        }
                  }
                  transition={{ duration: 0.35, ease: "easeOut" }}
                />
                <span className="relative z-10 flex items-center gap-2">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
          </motion.nav>

          <motion.div
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-500/30 bg-black/40 px-4 py-3 backdrop-blur"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-cyan-400">
              <Filter className="h-4 w-4" />
              FILTRE
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-400/10"
                >
                  FILTRE
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-cyan-400/50 bg-[#050312] text-cyan-100">
                <DropdownMenuLabel className="text-xs uppercase tracking-[0.4em] text-cyan-400">
                  Trier par
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-cyan-400/30" />
                <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value)}>
                  {filterOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      className="text-sm text-cyan-100 focus:bg-cyan-500/20 data-[state=checked]:bg-cyan-500/20"
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_0_40px_rgba(20,230,255,0.25)] backdrop-blur-xl">
          <motion.div
            className="absolute inset-0 animate-pulse bg-[conic-gradient(from_90deg_at_50%_50%,rgba(20,230,255,0.08),rgba(255,0,200,0.04),rgba(255,108,0,0.05))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.65 }}
            transition={{ duration: 1.2, delay: 0.2 }}
          />
          <div className="relative">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 text-xs uppercase tracking-[0.2em] text-cyan-300/80">
                  <TableHead className="w-[80px]">Rang</TableHead>
                  <TableHead>Joueur</TableHead>
                  <TableHead className="text-center">ELO</TableHead>
                  <TableHead className="text-center">Winrate</TableHead>
                  <TableHead className="text-center">Série</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {sortedData.map((player, index) => {
                    const isTop3 = index < 3;
                    const serieLabel = typeof player.serie === "number" ? `${player.serie} 🔥` : player.serie;
                    return (
                      <Tooltip key={player.pseudo}>
                        <TooltipTrigger asChild>
                          <motion.tr
                            layout
                            ref={(node) => {
                              rowRefs.current[player.rang] = node;
                            }}
                            onClick={() => handleRowClick(player)}
                            className="group cursor-pointer border-white/5 transition"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            whileHover={{ scale: 1.005 }}
                          >
                            <TableCell className="text-sm font-semibold text-cyan-200">
                              <span
                                className="relative inline-flex items-center justify-center rounded-full border border-white/10 px-3 py-1 text-xs tracking-[0.3em]"
                                style={{ color: player.couleur }}
                              >
                                {String(index + 1).padStart(2, "0")}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 shadow-[0_0_20px_rgba(20,230,255,0.3)] transition group-hover:shadow-[0_0_25px_rgba(255,0,200,0.4)]">
                                  {pieceIcon(player.icone, player.couleur)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-semibold tracking-wide text-white">
                                      {player.pseudo}
                                    </span>
                                    {isTop3 && (
                                      <Badge
                                        className="bg-gradient-to-r from-cyan-500/60 via-fuchsia-500/60 to-orange-500/60 text-[10px] uppercase tracking-[0.3em] text-white"
                                      >
                                        Top {index + 1}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-cyan-200/70">#{player.rang.toString().padStart(3, "0")} Voltus Grid</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-mono text-base text-cyan-200">
                              {player.elo}
                            </TableCell>
                            <TableCell className="text-center font-mono text-base text-cyan-200">
                              {player.winrate}
                            </TableCell>
                            <TableCell className="text-center text-sm text-cyan-100">
                              {serieLabel}
                            </TableCell>
                            <TableCell className="text-right font-mono text-base text-cyan-100">
                              {player.score}
                            </TableCell>
                          </motion.tr>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm border-cyan-400/40 bg-[#050312]/90 text-cyan-100">
                          <div className="space-y-2 text-xs">
                            <p className="font-semibold uppercase tracking-[0.3em] text-cyan-400">{player.pseudo}</p>
                            <p>{player.bio}</p>
                            <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400/70">
                              <span>ELO {player.elo}</span>
                              <span>Winrate {player.winrate}</span>
                              <span>Série {serieLabel}</span>
                              <span>Score {player.score}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Leaderboard;
