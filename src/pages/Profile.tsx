import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon,
  Clock,
  Crown,
  Flame,
  ListChecks,
  Loader2,
  LogOut,
  Puzzle,
  RefreshCcw,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import RuleCard from "@/components/RuleCard";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { ChessRule } from "@/types/chess";
import { mapCustomRuleRowsToChessRules, type CustomRuleRow } from "@/lib/customRuleMapper";

const Profile = () => {
  const { user, loading: authLoading, signOut, refreshUser } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<ChessRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  const userInitials = useMemo(() => {
    const name = user?.user_metadata?.full_name as string | undefined;
    if (name && name.trim().length > 0) {
      return name
        .split(" ")
        .map(part => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    if (!user?.email) return "U";
    return user.email
      .split("@")[0]
      .slice(0, 2)
      .toUpperCase();
  }, [user?.email, user?.user_metadata?.full_name]);

  const profileName = useMemo(() => {
    const name = user?.user_metadata?.full_name as string | undefined;
    if (name && name.trim().length > 0) {
      return name;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "Stratège créatif";
  }, [user?.email, user?.user_metadata?.full_name]);

  const profileHandle = useMemo(() => {
    const raw = (user?.user_metadata?.username as string | undefined) ?? user?.email?.split("@")[0] ?? "invite";
    return raw
      .toString()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  }, [user?.email, user?.user_metadata?.username]);

  const lastUpdated = useMemo(() => {
    if (rules.length === 0) return null;
    const candidate = rules[0].createdAt ?? rules[0].updatedAt;
    if (!candidate) return null;
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("fr-FR");
  }, [rules]);

  const ruleInsights = useMemo(() => {
    if (rules.length === 0) {
      return {
        totalRules: 0,
        activeRules: 0,
        uniqueCategories: 0,
        favouriteCategory: null as string | null,
        rating: 1200,
        masteryTitle: "Apprenti créatif",
        wins: 0,
        variants: 0,
        focusHours: 0,
        streak: 0,
        lastActivity: null as Date | null,
      };
    }

    const activeRules = rules.filter(rule => rule.isActive).length;
    const categoryMap = rules.reduce<Record<string, number>>((acc, rule) => {
      const key = rule.category ?? "autre";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
    const uniqueCategories = sortedCategories.length;
    const favouriteCategory = sortedCategories[0]?.[0] ?? null;

    const baseRating = 1200 + rules.length * 60 + activeRules * 25 + uniqueCategories * 35;
    const rating = Math.min(3200, Math.round(baseRating));

    let masteryTitle = "Apprenti créatif";
    if (rating >= 2800) masteryTitle = "Grand maître créatif";
    else if (rating >= 2400) masteryTitle = "Maître visionnaire";
    else if (rating >= 2000) masteryTitle = "Stratège lumineux";
    else if (rating >= 1600) masteryTitle = "Innovateur en devenir";

    const wins = Math.round(rules.length * 3 + activeRules * 2 + uniqueCategories * 1.5);
    const variants = Math.max(uniqueCategories, Math.round(rules.length / 2));
    const focusHours = rules.length * 4 + activeRules * 2;

    const sortedByActivity = [...rules]
      .map(rule => {
        const updated = rule.updatedAt ? new Date(rule.updatedAt) : null;
        const created = rule.createdAt ? new Date(rule.createdAt) : null;
        const date = updated && created && updated > created ? updated : created ?? updated;
        return date && !Number.isNaN(date.getTime()) ? date : null;
      })
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime());

    const lastActivity = sortedByActivity[0] ?? null;

    const activityDays = new Set(
      sortedByActivity.map(date => {
        const copy = new Date(date);
        copy.setHours(0, 0, 0, 0);
        return copy.getTime();
      })
    );

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    while (true) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() - streak);
      if (activityDays.has(candidate.getTime())) {
        streak += 1;
      } else {
        break;
      }
    }

    return {
      totalRules: rules.length,
      activeRules,
      uniqueCategories,
      favouriteCategory,
      rating,
      masteryTitle,
      wins,
      variants,
      focusHours,
      streak,
      lastActivity,
    };
  }, [rules]);

  const highlightCards = useMemo(
    () => [
      {
        label: "Cote créative",
        value: ruleInsights.rating,
        icon: Trophy,
        description: "Basée sur vos règles publiées",
      },
      {
        label: "Titre",
        value: ruleInsights.masteryTitle,
        icon: Crown,
        description: `${ruleInsights.totalRules} règle(s) générée(s)`,
      },
      {
        label: "Expériences gagnantes",
        value: ruleInsights.wins,
        icon: Target,
        description: "Tests réussis avec vos variantes",
      },
      {
        label: "Variantes uniques",
        value: ruleInsights.variants,
        icon: Puzzle,
        description: "Catégories et tags explorés",
      },
    ],
    [ruleInsights]
  );

  const statsBreakdown = useMemo(
    () => [
      {
        label: "Règles générées",
        value: ruleInsights.totalRules,
        icon: Sparkles,
      },
      {
        label: "Règles actives",
        value: ruleInsights.activeRules,
        icon: ListChecks,
      },
      {
        label: "Catégories explorées",
        value: ruleInsights.uniqueCategories,
        icon: ActivityIcon,
      },
      {
        label: "Série créative",
        value: `${ruleInsights.streak} jour${ruleInsights.streak > 1 ? "s" : ""}`,
        icon: Flame,
      },
      {
        label: "Heures d'itération",
        value: `${ruleInsights.focusHours} h`,
        icon: Clock,
      },
      {
        label: "Catégorie favorite",
        value: ruleInsights.favouriteCategory ?? "—",
        icon: Trophy,
      },
    ],
    [ruleInsights]
  );

  const activityFeed = useMemo(() => {
    const items = rules
      .map(rule => {
        const updated = rule.updatedAt ? new Date(rule.updatedAt) : null;
        const created = rule.createdAt ? new Date(rule.createdAt) : null;
        const hasUpdate = updated && created && updated > created;
        const date = hasUpdate ? updated : created ?? updated;
        if (!date || Number.isNaN(date.getTime())) return null;

        return {
          id: String(rule.id ?? rule.ruleId),
          title: rule.ruleName,
          action: hasUpdate ? "Règle optimisée" : "Nouvelle règle",
          tags: rule.tags,
          date,
        };
      })
      .filter((item): item is {
        id: string;
        title: string;
        action: string;
        tags: string[];
        date: Date;
      } => Boolean(item))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);

    return items.map(item => ({
      ...item,
      relativeTime: formatDistanceToNow(item.date, { addSuffix: true, locale: fr }),
    }));
  }, [rules]);

  const fetchRules = useCallback(async () => {
    if (!user) return;

    setLoadingRules(true);

    try {
      const { data, error } = await supabase
        .from("chess_rules")
        .select("*")
        .eq("created_by", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as CustomRuleRow[];
      setRules(mapCustomRuleRowsToChessRules(rows));
    } catch (error) {
      console.error("Error loading rules:", error);
      toast({
        title: "Erreur lors du chargement",
        description: error instanceof Error ? error.message : "Impossible de récupérer vos règles.",
        variant: "destructive",
      });
    } finally {
      setLoadingRules(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (user) {
      fetchRules();
    } else if (!authLoading) {
      setLoadingRules(false);
    }
  }, [user, authLoading, fetchRules]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Déconnexion réussie",
        description: "À bientôt sur Chess Rules Engine !",
      });
      await refreshUser();
    } catch (error) {
      console.error("Error signing out:", error);
      toast({
        title: "Erreur lors de la déconnexion",
        description: error instanceof Error ? error.message : "Veuillez réessayer ultérieurement.",
        variant: "destructive",
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#050816] p-4 text-blue-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.25),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(59,130,246,0.18),_transparent_55%)]" />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <Card className="w-full max-w-lg overflow-hidden border-cyan-500/30 bg-[#0b1229]/80 text-blue-100 shadow-[0_0_35px_rgba(34,211,238,0.25)] backdrop-blur-xl">
            <CardHeader className="space-y-3 text-center">
              <CardTitle className="text-3xl font-semibold text-white">Profil indisponible</CardTitle>
              <CardDescription className="text-blue-100/70">
                Connectez-vous ou créez un compte pour personnaliser vos règles d'échecs futuristes.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button asChild variant="premium" className="w-full">
                <Link to="/signup">Créer mon compte</Link>
              </Button>
              <Button asChild variant="outline" className="w-full border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10">
                <Link to="/signup?mode=signin">Se connecter</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-blue-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10%] h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-[-10%] top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-sky-500/20 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-purple-500/20 via-transparent to-transparent" />
      </div>
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-cyan-500/40 bg-[#0b1229]/70 shadow-[0_0_35px_rgba(8,145,178,0.35)] backdrop-blur-xl">
          <div className="absolute inset-0 opacity-60 [background:radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.18),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(14,116,144,0.2),transparent_50%)]" />
          <div className="relative flex flex-col gap-8 px-6 py-8 md:px-10 md:py-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative mx-auto h-28 w-28 sm:mx-0">
                  <div className="absolute inset-0 rounded-full bg-cyan-400/40 blur-2xl" />
                  <Avatar className="relative h-28 w-28 border border-cyan-400/50 bg-[#070b1c] shadow-[0_0_25px_rgba(56,189,248,0.35)]">
                    <AvatarImage src={(user.user_metadata?.avatar_url as string | undefined) ?? undefined} alt={profileName} />
                    <AvatarFallback className="bg-[#111c3d] text-3xl font-bold text-cyan-200">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="text-center sm:text-left">
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
                    <h1 className="text-3xl font-semibold text-white md:text-4xl">{profileName}</h1>
                    <Badge className="border-cyan-400/60 bg-cyan-500/15 text-cyan-100">
                      {ruleInsights.masteryTitle}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm uppercase tracking-[0.35em] text-cyan-200/70">@{profileHandle}</p>
                  <p className="mt-2 text-sm text-blue-100/70">
                    Architecte de variantes futuristes et explorateur des règles personnalisées.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={fetchRules}
                  variant="outline"
                  disabled={loadingRules}
                  className="border-cyan-500/40 bg-cyan-500/5 text-cyan-200 hover:bg-cyan-500/15"
                >
                  {loadingRules ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Actualiser
                </Button>
                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  className="border border-transparent bg-red-500/10 text-red-200 hover:bg-red-500/20"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Se déconnecter
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {highlightCards.map(card => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className="group relative overflow-hidden rounded-2xl border border-cyan-500/40 bg-[#0a1124]/80 p-5 shadow-[0_0_18px_rgba(14,165,233,0.25)] transition hover:border-cyan-300/70 hover:shadow-[0_0_28px_rgba(56,189,248,0.45)]"
                  >
                    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-500/10 transition group-hover:bg-cyan-400/20" />
                    <div className="relative flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-cyan-100">
                        <Icon className="h-5 w-5" />
                        <span className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">{card.label}</span>
                      </div>
                      <p className="text-2xl font-semibold text-white">
                        {typeof card.value === "number" ? card.value.toLocaleString("fr-FR") : card.value}
                      </p>
                      <p className="text-xs text-blue-100/60">{card.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#0a1124]/80 p-6 shadow-[0_0_28px_rgba(56,189,248,0.28)] backdrop-blur">
            <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top_left,rgba(14,165,233,0.25),transparent_55%)]" />
            <div className="relative flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Statistiques</h2>
                  <p className="text-sm text-blue-100/60">Votre synthèse stratégique</p>
                </div>
                <Badge variant="outline" className="border-cyan-400/40 bg-cyan-500/10 text-cyan-100">
                  {ruleInsights.totalRules} règles
                </Badge>
              </div>
              <div className="grid gap-3">
                {statsBreakdown.map(stat => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between rounded-2xl border border-cyan-500/20 bg-[#0f1a3a]/70 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-100">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">{stat.label}</p>
                          <p className="text-base font-semibold text-white">{stat.value}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="relative h-full overflow-hidden rounded-3xl border border-purple-500/30 bg-[#0b112d]/80 p-6 shadow-[0_0_32px_rgba(168,85,247,0.25)] backdrop-blur">
              <div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_top_right,rgba(168,85,247,0.25),transparent_50%)]" />
              <div className="relative flex h-full flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Activité</h2>
                    <p className="text-sm text-blue-100/60">Les moments forts de vos créations</p>
                  </div>
                  {ruleInsights.lastActivity && (
                    <Badge variant="secondary" className="border border-purple-400/30 bg-purple-500/20 text-purple-100">
                      {formatDistanceToNow(ruleInsights.lastActivity, { addSuffix: true, locale: fr })}
                    </Badge>
                  )}
                </div>
                {loadingRules ? (
                  <div className="flex flex-1 items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-200" />
                  </div>
                ) : activityFeed.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-6 text-center text-purple-100/80">
                    <Sparkles className="h-6 w-6" />
                    <p className="text-lg font-medium">Aucune activité pour le moment</p>
                    <p className="text-sm text-purple-100/70">
                      Lancez-vous dans la création de votre première règle pour remplir votre journal de bord.
                    </p>
                    <Button asChild variant="outline" className="border-purple-400/40 bg-purple-500/20 text-purple-50 hover:bg-purple-500/30">
                      <Link to="/generator">Créer une règle</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {activityFeed.map(item => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 rounded-2xl border border-purple-500/30 bg-[#141a3c]/80 p-4 text-purple-50 transition hover:border-purple-300/70 hover:bg-[#1c2250]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-purple-200/70">
                            {item.action}
                          </div>
                          <span className="text-xs text-purple-100/60">{item.relativeTime}</span>
                        </div>
                        <p className="text-lg font-semibold text-white">{item.title}</p>
                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 text-xs text-purple-100/70">
                            {item.tags.slice(0, 4).map(tag => (
                              <span
                                key={tag}
                                className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-1 uppercase tracking-[0.2em]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#090f22]/80 shadow-[0_0_32px_rgba(56,189,248,0.25)]">
          <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.2),transparent_55%)]" />
          <Card className="border-none bg-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Sparkles className="h-5 w-5 text-cyan-200" />
                Mes règles personnalisées
              </CardTitle>
              <CardDescription className="text-blue-100/70">
                Retrouvez toutes vos créations dans cette collection à l'ambiance néon.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative space-y-6">
              {loadingRules ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-cyan-200" />
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center">
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-8 text-cyan-100">
                    <p className="text-lg font-medium">Aucune règle sauvegardée pour le moment.</p>
                    <p className="max-w-xl text-sm text-cyan-100/70">
                      Utilisez le générateur de règles pour créer votre première règle personnalisée et bâtir votre réputation.
                    </p>
                    <Button asChild variant="premium" className="mt-2">
                      <Link to="/generator">Créer une règle</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-cyan-100/70">
                    <Badge variant="outline" className="border-cyan-400/40 bg-cyan-500/10 text-cyan-100">
                      {rules.length} règle(s)
                    </Badge>
                    {lastUpdated && (
                      <Badge variant="secondary" className="border border-cyan-400/30 bg-cyan-500/20 text-cyan-50">
                        Dernière mise à jour : {lastUpdated}
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-4">
                    {rules.map(rule => (
                      <div
                        key={rule.id ?? rule.ruleId}
                        className="rounded-2xl border border-cyan-500/20 bg-[#0f172a]/80 p-1 shadow-[0_0_20px_rgba(56,189,248,0.25)]"
                      >
                        <RuleCard rule={rule} showActions={false} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
