import { ChessRule } from '@/types/chess';

const categoryColors: Record<ChessRule['category'], string> = {
  movement: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  capture: 'bg-red-500/20 text-red-300 border-red-500/30',
  special: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  condition: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  victory: 'bg-green-500/20 text-green-300 border-green-500/30',
  restriction: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  defense: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  behavior: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  vip: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
};

export const getCategoryColor = (category: ChessRule['category']): string => {
  return categoryColors[category] ?? 'bg-muted/20 text-muted-foreground border-muted/30';
};

export { categoryColors };
