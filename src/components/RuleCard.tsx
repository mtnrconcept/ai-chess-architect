import { useEffect, useMemo, useState } from "react";
import { ChessRule } from "@/types/chess";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Trash2,
  Power,
  PowerOff,
  AlertTriangle,
  Bomb,
  Snowflake,
  Radar,
  Sparkles,
  ArrowRightLeft,
  Sword,
  ListChecks,
  Crown,
  Shield,
  ShieldAlert,
  Bot,
  BadgeCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { categoryColors } from "@/lib/ruleCategories";
import { cn } from "@/lib/utils";
import {
  getSpecialAbilityMetadata,
  normalizeSpecialAbilityParameters,
  resolveSpecialAbilityName,
} from "@/lib/specialAbilities";

interface RuleCardProps {
  rule: ChessRule;
  onDelete?: (ruleId: string) => void;
  onToggle?: (ruleId: string, isActive: boolean) => void;
  showActions?: boolean;
  issues?: string[];
  selectable?: boolean;
  isSelected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  onPlay?: (rule: ChessRule) => void;
  showPlayButton?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

type RuleSummaryIcon = {
  Icon: LucideIcon;
  haloClassName: string;
};

const ABILITY_ICON_MAP: Record<string, RuleSummaryIcon> = {
  freezeMissile: {
    Icon: Snowflake,
    haloClassName:
      "from-sky-500/50 via-indigo-500/30 to-cyan-500/10 text-sky-100",
  },
  deployBomb: {
    Icon: Bomb,
    haloClassName:
      "from-amber-500/60 via-orange-500/30 to-rose-500/20 text-amber-100",
  },
  deployMine: {
    Icon: Radar,
    haloClassName:
      "from-emerald-500/50 via-lime-500/30 to-teal-500/20 text-emerald-100",
  },
};

const CATEGORY_ICON_MAP: Partial<
  Record<ChessRule["category"], RuleSummaryIcon>
> = {
  movement: {
    Icon: ArrowRightLeft,
    haloClassName:
      "from-sky-500/40 via-blue-500/25 to-indigo-500/20 text-sky-100",
  },
  capture: {
    Icon: Sword,
    haloClassName:
      "from-rose-500/50 via-purple-500/30 to-fuchsia-500/20 text-rose-100",
  },
  special: {
    Icon: Sparkles,
    haloClassName:
      "from-violet-500/50 via-fuchsia-500/25 to-sky-500/20 text-violet-100",
  },
  condition: {
    Icon: ListChecks,
    haloClassName:
      "from-teal-500/45 via-emerald-500/25 to-cyan-500/20 text-teal-100",
  },
  victory: {
    Icon: Crown,
    haloClassName:
      "from-amber-500/60 via-yellow-500/30 to-orange-500/20 text-amber-100",
  },
  restriction: {
    Icon: ShieldAlert,
    haloClassName:
      "from-red-500/45 via-orange-500/25 to-amber-500/20 text-red-100",
  },
  defense: {
    Icon: Shield,
    haloClassName:
      "from-emerald-500/45 via-teal-500/30 to-blue-500/20 text-emerald-100",
  },
  behavior: {
    Icon: Bot,
    haloClassName:
      "from-indigo-500/45 via-blue-500/25 to-cyan-500/20 text-indigo-100",
  },
  vip: {
    Icon: BadgeCheck,
    haloClassName:
      "from-amber-500/60 via-emerald-500/30 to-blue-500/20 text-amber-100",
  },
};

const TAG_ICON_PATTERNS: Array<{ pattern: RegExp; summary: RuleSummaryIcon }> =
  [
    {
      pattern: /(freeze|ice|frost|glace|gel)/i,
      summary: ABILITY_ICON_MAP.freezeMissile,
    },
    {
      pattern: /(bomb|explosion|bombe|grenade)/i,
      summary: ABILITY_ICON_MAP.deployBomb,
    },
    {
      pattern: /(mine|trap|pi[eè]ge)/i,
      summary: ABILITY_ICON_MAP.deployMine,
    },
  ];

const DEFAULT_ICON: RuleSummaryIcon = {
  Icon: Sparkles,
  haloClassName:
    "from-primary/40 via-sky-500/20 to-indigo-500/20 text-primary-100",
};

const getRuleSummaryIcon = (rule: ChessRule): RuleSummaryIcon => {
  if (Array.isArray(rule.effects)) {
    for (const effect of rule.effects) {
      if (
        effect &&
        typeof effect === "object" &&
        (effect as { action?: string }).action === "addAbility"
      ) {
        const parameters = (effect as { parameters?: Record<string, unknown> })
          .parameters;
        const abilityName = resolveSpecialAbilityName(parameters);
        if (abilityName) {
          const abilitySummary =
            ABILITY_ICON_MAP[abilityName as keyof typeof ABILITY_ICON_MAP];
          if (abilitySummary) {
            return abilitySummary;
          }

          const metadata = getSpecialAbilityMetadata(abilityName);
          if (metadata) {
            if (metadata.key in ABILITY_ICON_MAP) {
              return ABILITY_ICON_MAP[
                metadata.key as keyof typeof ABILITY_ICON_MAP
              ];
            }

            if (metadata.icon === "bomb") {
              return ABILITY_ICON_MAP.deployBomb;
            }
          }
        }
      }
    }
  }

  const categorySummary = CATEGORY_ICON_MAP[rule.category];
  if (categorySummary) {
    return categorySummary;
  }

  if (Array.isArray(rule.tags)) {
    for (const rawTag of rule.tags) {
      if (typeof rawTag !== "string") continue;
      for (const { pattern, summary } of TAG_ICON_PATTERNS) {
        if (pattern.test(rawTag)) {
          return summary;
        }
      }
    }
  }

  return DEFAULT_ICON;
};

const categoryLabels: Record<ChessRule["category"], string> = {
  movement: "Mouvement",
  capture: "Attaque",
  special: "Spécial",
  condition: "Condition",
  victory: "Victoire",
  restriction: "Restriction",
  defense: "Défense",
  behavior: "Comportement",
  vip: "VIP · Magnus Goat",
};

const RuleCard = ({
  rule,
  onDelete,
  onToggle,
  showActions = true,
  issues = [],
  selectable = false,
  isSelected = false,
  onSelectChange,
  onPlay,
  showPlayButton = false,
  defaultOpen = false,
  onOpenChange,
}: RuleCardProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  const affectedPiecesLabel = useMemo(() => {
    if (Array.isArray(rule.affectedPieces) && rule.affectedPieces.length > 0) {
      return rule.affectedPieces.join(", ");
    }
    return "Aucune pièce spécifique";
  }, [rule.affectedPieces]);

  const tags = useMemo(
    () =>
      Array.isArray(rule.tags)
        ? rule.tags.filter((tag) => typeof tag === "string" && tag.length > 0)
        : [],
    [rule.tags],
  );

  const conditionsCount = Array.isArray(rule.conditions)
    ? rule.conditions.length
    : 0;
  const effectsCount = Array.isArray(rule.effects) ? rule.effects.length : 0;

  const abilitySummaries = useMemo(
    () =>
      Array.isArray(rule.effects)
        ? rule.effects
            .map((effect) => {
              if ((effect as { action?: string }).action !== "addAbility") {
                return null;
              }
              const parameters = (
                effect as { parameters?: Record<string, unknown> }
              ).parameters;
              const abilityName = resolveSpecialAbilityName(parameters);
              if (!abilityName) {
                return null;
              }
              const normalized = normalizeSpecialAbilityParameters(
                abilityName,
                parameters,
              );
              const metadata = getSpecialAbilityMetadata(abilityName);
              if (!normalized || !metadata) {
                return null;
              }
              return {
                label: metadata.label,
                trigger: normalized.trigger,
                radius: normalized.radius,
                countdown: normalized.countdown,
                damage: normalized.damage,
                freezeTurns: normalized.freezeTurns,
              };
            })
            .filter(
              (
                summary,
              ): summary is {
                label: string;
                trigger: "countdown" | "contact";
                radius: number;
                countdown: number;
                damage: number;
                freezeTurns: number | undefined;
              } => summary !== null,
            )
        : [],
    [rule.effects],
  );

  const { Icon, haloClassName } = useMemo(
    () => getRuleSummaryIcon(rule),
    [rule],
  );

  const cardClasses = cn(
    "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-slate-950/30 p-6 text-foreground shadow-[0_20px_45px_-20px_rgba(15,23,42,0.75)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_25px_50px_-20px_rgba(34,211,238,0.55)]",
    selectable &&
      "focus-within:border-primary/40 focus-within:shadow-[0_0_0_1px_rgba(56,189,248,0.45)]",
    selectable && "focus-visible:outline-none",
    isSelected &&
      "border-primary/60 shadow-[0_0_40px_-15px_rgba(34,211,238,0.85)] ring-1 ring-primary/50 backdrop-blur-sm",
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      className="h-full"
    >
      <Card className={cardClasses}>
        <CardHeader className="space-y-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-1 items-start gap-4">
              <div
                className={cn(
                  "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-[0_0_40px_-15px_rgba(56,189,248,0.75)] transition-transform duration-300 group-hover:scale-105",
                  haloClassName,
                )}
              >
                <Icon className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl font-semibold text-foreground">
                    {rule.ruleName}
                  </CardTitle>
                  {rule.isActive && (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                    >
                      Actif
                    </Badge>
                  )}
                </div>
                {rule.description && (
                  <CardDescription className="line-clamp-2 text-sm text-muted-foreground">
                    {rule.description}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              {selectable && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    onSelectChange?.(checked === true)
                  }
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="mt-1"
                />
              )}
              {showActions && (
                <div className="flex gap-2">
                  {onToggle && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggle(rule.ruleId, !rule.isActive);
                      }}
                      className="h-9 w-9 rounded-full border border-white/5 bg-white/5 text-white/80 shadow-inner hover:bg-white/10"
                    >
                      {rule.isActive ? (
                        <Power size={18} />
                      ) : (
                        <PowerOff size={18} />
                      )}
                      <span className="sr-only">
                        {rule.isActive
                          ? "Désactiver la règle"
                          : "Activer la règle"}
                      </span>
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(rule.ruleId);
                      }}
                      className="h-9 w-9 rounded-full border border-white/5 bg-white/5 text-destructive shadow-inner hover:bg-white/10"
                    >
                      <Trash2 size={18} />
                      <span className="sr-only">Supprimer la règle</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap gap-2">
              <Badge
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  categoryColors[rule.category],
                )}
              >
                {categoryLabels[rule.category] ?? rule.category}
              </Badge>
              <Badge
                variant="outline"
                className="border-white/10 bg-white/5 text-xs uppercase tracking-wide text-white/70"
              >
                Priorité : {rule.priority}
              </Badge>
            </div>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(event) => event.stopPropagation()}
                className="h-8 rounded-full border-white/10 bg-white/5 px-4 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:bg-white/10"
              >
                {isOpen ? "Masquer" : "Voir les détails"}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent className="mt-4 overflow-hidden">
          <CardContent className="space-y-6 pt-0">
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pièces affectées
                </span>
                <span className="font-medium text-foreground">
                  {affectedPiecesLabel}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Déclencheur
                </span>
                <span className="font-medium text-foreground">
                  {rule.trigger}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Conditions
                </span>
                <span className="font-medium text-foreground">
                  {conditionsCount}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Effets
                </span>
                <span className="font-medium text-foreground">
                  {effectsCount}
                </span>
              </div>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/75 backdrop-blur-sm"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}

            {abilitySummaries.length > 0 && (
              <div className="space-y-3">
                {abilitySummaries.map((ability, index) => (
                  <div
                    key={`${ability.label}-${index}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-3 text-xs text-fuchsia-100/90 backdrop-blur-sm"
                  >
                    <span className="text-sm font-semibold text-fuchsia-100">
                      {ability.label}
                    </span>
                    <span>Rayon {ability.radius}</span>
                    <span>
                      {ability.freezeTurns
                        ? `Gel ${ability.freezeTurns} tour${ability.freezeTurns > 1 ? "s" : ""}`
                        : `Impact ${ability.damage}`}
                    </span>
                    <span>
                      {ability.trigger === "countdown"
                        ? `Détonation ${ability.countdown} tour${ability.countdown > 1 ? "s" : ""}`
                        : "Détonation au contact"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {issues.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertTriangle
                  className="h-5 w-5 flex-shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  {issues.map((issue, index) => (
                    <p key={index}>{issue}</p>
                  ))}
                </div>
              </div>
            )}

            {showPlayButton && onPlay && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="gold"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlay(rule);
                  }}
                >
                  Jouer à cette variante
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default RuleCard;
