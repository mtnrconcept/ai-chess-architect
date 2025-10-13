import { ChessRule } from '@/types/chess';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Power, PowerOff, AlertTriangle } from 'lucide-react';
import { categoryColors } from '@/lib/ruleCategories';
import { getSpecialAbilityMetadata, normalizeSpecialAbilityParameters } from '@/lib/specialAbilities';

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
}

const categoryLabels: Record<ChessRule['category'], string> = {
  movement: 'Mouvement',
  capture: 'Attaque',
  special: 'Spécial',
  condition: 'Condition',
  victory: 'Victoire',
  restriction: 'Restriction',
  defense: 'Défense',
  behavior: 'Comportement',
  vip: 'VIP · Magnus Goat'
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
}: RuleCardProps) => {
  const affectedPiecesLabel = Array.isArray(rule.affectedPieces) && rule.affectedPieces.length > 0
    ? rule.affectedPieces.join(', ')
    : 'Aucune pièce spécifique';

  const conditionsCount = Array.isArray(rule.conditions) ? rule.conditions.length : 0;
  const effectsCount = Array.isArray(rule.effects) ? rule.effects.length : 0;
  const tags = Array.isArray(rule.tags) ? rule.tags.filter(tag => typeof tag === 'string' && tag.length > 0) : [];
  const abilitySummaries = Array.isArray(rule.effects)
    ? rule.effects
        .map(effect => {
          if (effect.action !== 'addAbility' || typeof effect.parameters?.ability !== 'string') {
            return null;
          }
          const normalized = normalizeSpecialAbilityParameters(
            effect.parameters.ability,
            effect.parameters as Record<string, unknown> | undefined,
          );
          const metadata = getSpecialAbilityMetadata(effect.parameters.ability);
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
        .filter((summary): summary is {
          label: string;
          trigger: 'countdown' | 'contact';
          radius: number;
          countdown: number;
          damage: number;
          freezeTurns?: number;
        } => summary !== null)
    : [];

  const cardClasses = [
    'bg-card/50 border-border backdrop-blur-sm hover:border-primary/50 transition-all',
    selectable ? 'cursor-pointer' : '',
    selectable && isSelected ? 'border-primary/60 shadow-[0_0_0_1px_rgba(34,211,238,0.45)]' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleSelectToggle = () => {
    if (!selectable || !onSelectChange) return;
    onSelectChange(!isSelected);
  };

  return (
    <Card
      className={cardClasses}
      onClick={handleSelectToggle}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-pressed={selectable ? isSelected : undefined}
      onKeyDown={event => {
        if (!selectable || !onSelectChange) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectChange(!isSelected);
        }
      }}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{rule.ruleName}</CardTitle>
              {rule.isActive && (
                <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">
                  Actif
                </Badge>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge className={categoryColors[rule.category]}>
                {categoryLabels[rule.category] ?? rule.category}
              </Badge>
              <Badge variant="outline">
                Priorité: {rule.priority}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {selectable && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={checked => onSelectChange?.(checked === true)}
                onClick={event => event.stopPropagation()}
                onKeyDown={event => event.stopPropagation()}
                className="mt-1"
              />
            )}
            {showActions && (
              <div className="flex gap-2">
                {onToggle && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={event => {
                      event.stopPropagation();
                      onToggle(rule.ruleId, !rule.isActive);
                    }}
                    className="h-8 w-8"
                  >
                    {rule.isActive ? <Power size={16} /> : <PowerOff size={16} />}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={event => {
                      event.stopPropagation();
                      onDelete(rule.ruleId);
                    }}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <CardDescription className="mt-2">{rule.description}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Pièces affectées:</span>
            <span className="text-foreground font-medium">{affectedPiecesLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Déclencheur:</span>
            <span className="text-foreground font-medium">{rule.trigger}</span>
          </div>
          {conditionsCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Conditions:</span>
              <span className="text-foreground font-medium">{conditionsCount}</span>
            </div>
          )}
          {effectsCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Effets:</span>
              <span className="text-foreground font-medium">{effectsCount}</span>
            </div>
          )}
        </div>
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="bg-muted/60 text-xs uppercase tracking-wide">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
        {abilitySummaries.length > 0 && (
          <div className="mt-4 space-y-2 text-xs text-fuchsia-100/90">
            {abilitySummaries.map((ability, index) => (
              <div
                key={`${ability.label}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2"
              >
                <span className="font-semibold text-fuchsia-100">{ability.label}</span>
                <span>Rayon {ability.radius}</span>
                <span>
                  {ability.freezeTurns
                    ? `Gel ${ability.freezeTurns} tour${ability.freezeTurns > 1 ? 's' : ''}`
                    : `Impact ${ability.damage}`}
                </span>
                <span>
                  {ability.trigger === 'countdown'
                    ? `Détonation ${ability.countdown} tour${ability.countdown > 1 ? 's' : ''}`
                    : 'Détonation au contact'}
                </span>
              </div>
            ))}
          </div>
        )}
        {issues.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <div className="space-y-1">
              {issues.map((issue, index) => (
                <p key={index}>{issue}</p>
              ))}
            </div>
          </div>
        )}
        {showPlayButton && onPlay && (
          <div className="mt-6 flex justify-end">
            <Button
              size="sm"
              variant="gold"
              onClick={event => {
                event.stopPropagation();
                onPlay(rule);
              }}
            >
              Jouer à cette variante
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RuleCard;
