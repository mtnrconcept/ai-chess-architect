import { ChessRule } from '@/types/chess';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Power, PowerOff } from 'lucide-react';

interface RuleCardProps {
  rule: ChessRule;
  onDelete?: (ruleId: string) => void;
  onToggle?: (ruleId: string, isActive: boolean) => void;
  showActions?: boolean;
}

const categoryColors = {
  movement: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  capture: 'bg-red-500/20 text-red-300 border-red-500/30',
  special: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  condition: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  victory: 'bg-green-500/20 text-green-300 border-green-500/30',
  restriction: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  defense: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  behavior: 'bg-pink-500/20 text-pink-300 border-pink-500/30'
};

const RuleCard = ({ rule, onDelete, onToggle, showActions = true }: RuleCardProps) => {
  return (
    <Card className="bg-card/50 border-border backdrop-blur-sm hover:border-primary/50 transition-all">
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
                {rule.category}
              </Badge>
              <Badge variant="outline">
                Priorité: {rule.priority}
              </Badge>
            </div>
          </div>
          
          {showActions && (
            <div className="flex gap-2">
              {onToggle && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onToggle(rule.ruleId, !rule.isActive)}
                  className="h-8 w-8"
                >
                  {rule.isActive ? <Power size={16} /> : <PowerOff size={16} />}
                </Button>
              )}
              {onDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(rule.ruleId)}
                  className="h-8 w-8 text-destructive hover:text-destructive"
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          )}
        </div>
        <CardDescription className="mt-2">{rule.description}</CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Pièces affectées:</span>
            <span className="text-foreground font-medium">
              {rule.affectedPieces.join(', ')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Déclencheur:</span>
            <span className="text-foreground font-medium">{rule.trigger}</span>
          </div>
          {rule.conditions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Conditions:</span>
              <span className="text-foreground font-medium">{rule.conditions.length}</span>
            </div>
          )}
          {rule.effects.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Effets:</span>
              <span className="text-foreground font-medium">{rule.effects.length}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RuleCard;
