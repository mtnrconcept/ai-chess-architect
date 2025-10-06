import { ChessRule } from '@/types/chess';

export const presetMovementRules: ChessRule[] = [
  {
    ruleId: 'preset_mov_01',
    ruleName: 'Double Mouvement Cavalier',
    description: 'Le cavalier peut effectuer deux mouvements consécutifs lors de son tour',
    category: 'movement',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [
      { type: 'pieceType', value: 'knight', operator: 'equals' },
      { type: 'movesThisTurn', value: 1, operator: 'lessThan' }
    ],
    effects: [
      { action: 'allowExtraMove', target: 'self', parameters: { count: 1, duration: 'temporary' } }
    ],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_02',
    ruleName: 'Fou Diagonal Étendu',
    description: 'Le fou peut se déplacer sur toute la longueur de la diagonale sans limite',
    category: 'movement',
    affectedPieces: ['bishop'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { range: 99, direction: 'diagonal', duration: 'permanent' } }
    ],
    priority: 3,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_03',
    ruleName: 'Tour Sauteuse',
    description: 'La tour peut sauter par-dessus une pièce alliée une fois par tour',
    category: 'movement',
    affectedPieces: ['rook'],
    trigger: 'onMove',
    conditions: [
      { type: 'pieceType', value: 'rook', operator: 'equals' }
    ],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'jump', count: 1, duration: 'temporary' } }
    ],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_04',
    ruleName: 'Pion Avancé',
    description: 'Les pions peuvent avancer de 2 cases même après leur premier mouvement',
    category: 'movement',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { doubleMove: true, duration: 'permanent' } }
    ],
    priority: 2,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_05',
    ruleName: 'Reine Téléportation',
    description: 'La reine peut se téléporter n\'importe où tous les 3 tours',
    category: 'movement',
    affectedPieces: ['queen'],
    trigger: 'turnBased',
    conditions: [
      { type: 'turnNumber', value: 3, operator: 'greaterOrEqual' }
    ],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'teleport', frequency: 3, duration: 'permanent' } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_06',
    ruleName: 'Roi Agile',
    description: 'Le roi peut se déplacer de 2 cases dans toutes les directions',
    category: 'movement',
    affectedPieces: ['king'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { range: 2, duration: 'permanent' } }
    ],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: ['preset_def_01'], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_07',
    ruleName: 'Cavalier en Ligne',
    description: 'Le cavalier peut également se déplacer en ligne droite sur 3 cases',
    category: 'movement',
    affectedPieces: ['knight'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'straightMove', range: 3, duration: 'permanent' } }
    ],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_08',
    ruleName: 'Toutes Pièces Rapides',
    description: 'Toutes les pièces peuvent se déplacer une case supplémentaire',
    category: 'movement',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'all', parameters: { bonusRange: 1, duration: 'permanent' } }
    ],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_09',
    ruleName: 'Tour en Diagonale',
    description: 'La tour peut se déplacer en diagonale sur 2 cases maximum',
    category: 'movement',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'diagonalMove', range: 2, duration: 'permanent' } }
    ],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_mov_10',
    ruleName: 'Pion Latéral',
    description: 'Les pions peuvent se déplacer latéralement d\'une case',
    category: 'movement',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'lateralMove', range: 1, duration: 'permanent' } }
    ],
    priority: 3,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const presetAttackRules: ChessRule[] = [
  {
    ruleId: 'preset_atk_01',
    ruleName: 'Capture Diagonale Étendue',
    description: 'Les pions peuvent capturer en diagonale jusqu\'à 2 cases',
    category: 'capture',
    affectedPieces: ['pawn'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { captureRange: 2, direction: 'diagonal', duration: 'permanent' } }
    ],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_02',
    ruleName: 'Cavalier Explosif',
    description: 'Le cavalier capture toutes les pièces adjacentes à sa case d\'arrivée',
    category: 'capture',
    affectedPieces: ['knight'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'allowCapture', target: 'all', parameters: { area: 'adjacent', radius: 1, duration: 'temporary' } }
    ],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_03',
    ruleName: 'Tour Transpercante',
    description: 'La tour peut capturer 2 pièces alignées en un seul mouvement',
    category: 'capture',
    affectedPieces: ['rook'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'allowCapture', target: 'specific', parameters: { count: 2, alignment: 'straight', duration: 'temporary' } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_04',
    ruleName: 'Reine Magnétique',
    description: 'La reine attire les pièces ennemies à portée de capture',
    category: 'capture',
    affectedPieces: ['queen'],
    trigger: 'turnBased',
    conditions: [
      { type: 'turnNumber', value: 5, operator: 'greaterOrEqual' }
    ],
    effects: [
      { action: 'addAbility', target: 'opponent', parameters: { ability: 'pullTowards', range: 2, duration: 'temporary' } }
    ],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_05',
    ruleName: 'Fou Ricochant',
    description: 'Le fou peut capturer puis continuer son mouvement diagonal',
    category: 'capture',
    affectedPieces: ['bishop'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'captureAndContinue', duration: 'temporary' } }
    ],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_06',
    ruleName: 'Capture Sacrifice',
    description: 'Capturer une pièce ennemie fait perdre une pièce aléatoire alliée',
    category: 'capture',
    affectedPieces: ['all'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'triggerEvent', target: 'self', parameters: { event: 'sacrificeRandomPiece', duration: 'temporary' } }
    ],
    priority: 10,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_07',
    ruleName: 'Capture en Chaîne',
    description: 'Après une capture, peut capturer immédiatement une autre pièce adjacente',
    category: 'capture',
    affectedPieces: ['all'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'allowExtraMove', target: 'self', parameters: { count: 1, captureOnly: true, duration: 'temporary' } }
    ],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_08',
    ruleName: 'Roi Vengeur',
    description: 'Le roi peut capturer n\'importe quelle pièce ayant capturé une pièce alliée',
    category: 'capture',
    affectedPieces: ['king'],
    trigger: 'conditional',
    conditions: [
      { type: 'pieceType', value: 'king', operator: 'equals' }
    ],
    effects: [
      { action: 'allowCapture', target: 'specific', parameters: { condition: 'hasCaptured', duration: 'permanent' } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_09',
    ruleName: 'Pion Kamikaze',
    description: 'Le pion peut se sacrifier pour capturer toutes les pièces adjacentes',
    category: 'capture',
    affectedPieces: ['pawn'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'allowCapture', target: 'all', parameters: { area: 'adjacent', selfDestruct: true, duration: 'temporary' } }
    ],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_10',
    ruleName: 'Capture Fantôme',
    description: 'Peut capturer une pièce sans occuper sa case',
    category: 'capture',
    affectedPieces: ['all'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'remoteCapture', range: 1, duration: 'temporary' } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const presetDefenseRules: ChessRule[] = [
  {
    ruleId: 'preset_def_01',
    ruleName: 'Roi Forteresse',
    description: 'Le roi ne peut pas être capturé tant qu\'il reste au moins 3 pièces alliées',
    category: 'defense',
    affectedPieces: ['king'],
    trigger: 'always',
    conditions: [
      { type: 'piecesOnBoard', value: 3, operator: 'greaterOrEqual' }
    ],
    effects: [
      { action: 'preventCapture', target: 'self', parameters: { immunity: true, duration: 'permanent' } }
    ],
    priority: 10,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: ['preset_mov_06'], requiredState: {} }
  },
  {
    ruleId: 'preset_def_02',
    ruleName: 'Bouclier de Tour',
    description: 'Les tours créent un bouclier qui bloque les captures dans leur ligne de vue',
    category: 'defense',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'all', parameters: { ability: 'lineProtection', duration: 'permanent' } }
    ],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_03',
    ruleName: 'Pions Gardiens',
    description: 'Les pions protègent les pièces directement derrière eux',
    category: 'defense',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'all', parameters: { ability: 'rearGuard', range: 1, duration: 'permanent' } }
    ],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_04',
    ruleName: 'Cavalier Esquiveur',
    description: 'Le cavalier a 50% de chance d\'esquiver une capture',
    category: 'defense',
    affectedPieces: ['knight'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'dodge', chance: 0.5, duration: 'permanent' } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_05',
    ruleName: 'Reine Régénération',
    description: 'Si capturée, la reine réapparaît après 3 tours',
    category: 'defense',
    affectedPieces: ['queen'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'triggerEvent', target: 'self', parameters: { event: 'respawn', delay: 3, duration: 'permanent' } }
    ],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_06',
    ruleName: 'Formation Défensive',
    description: 'Deux pièces adjacentes ne peuvent pas être capturées',
    category: 'defense',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'preventCapture', target: 'all', parameters: { condition: 'adjacent', duration: 'permanent' } }
    ],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_07',
    ruleName: 'Fou Miroir',
    description: 'Le fou renvoie les attaques à la pièce attaquante',
    category: 'defense',
    affectedPieces: ['bishop'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'reflect', duration: 'permanent' } }
    ],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_08',
    ruleName: 'Sanctuaire',
    description: 'Les 4 cases centrales de l\'échiquier sont des zones protégées',
    category: 'defense',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'preventCapture', target: 'all', parameters: { zones: [[3,3],[3,4],[4,3],[4,4]], duration: 'permanent' } }
    ],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_09',
    ruleName: 'Armure Temporaire',
    description: 'Chaque pièce devient immune après avoir bougé pendant 1 tour',
    category: 'defense',
    affectedPieces: ['all'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'immunity', duration: 'turns', count: 1 } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_10',
    ruleName: 'Contre-Attaque',
    description: 'Quand une pièce est menacée, elle peut capturer immédiatement',
    category: 'defense',
    affectedPieces: ['all'],
    trigger: 'conditional',
    conditions: [
      { type: 'threatened', value: true, operator: 'equals' }
    ],
    effects: [
      { action: 'allowExtraMove', target: 'self', parameters: { count: 1, captureOnly: true, duration: 'temporary' } }
    ],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const presetBehaviorRules: ChessRule[] = [
  {
    ruleId: 'preset_beh_01',
    ruleName: 'Tours Jumelles',
    description: 'Quand une tour bouge, l\'autre tour peut bouger dans la même direction',
    category: 'behavior',
    affectedPieces: ['rook'],
    trigger: 'onMove',
    conditions: [
      { type: 'pieceType', value: 'rook', operator: 'equals' }
    ],
    effects: [
      { action: 'triggerEvent', target: 'specific', parameters: { event: 'mirrorMove', targetPiece: 'rook', duration: 'temporary' } }
    ],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_02',
    ruleName: 'Pions Évoluants',
    description: 'Les pions deviennent des cavaliers en atteignant la 4ème rangée',
    category: 'behavior',
    affectedPieces: ['pawn'],
    trigger: 'conditional',
    conditions: [
      { type: 'position', value: 4, operator: 'equals' }
    ],
    effects: [
      { action: 'changeValue', target: 'self', parameters: { property: 'type', value: 'knight', duration: 'permanent' } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_03',
    ruleName: 'Rotation Cyclique',
    description: 'Toutes les pièces tournent leur mouvement de 90° chaque tour',
    category: 'behavior',
    affectedPieces: ['all'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'all', parameters: { rotation: 90, frequency: 1, duration: 'permanent' } }
    ],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_04',
    ruleName: 'Échange Forcé',
    description: 'Toutes les 5 tours, deux pièces aléatoires échangent leur position',
    category: 'behavior',
    affectedPieces: ['all'],
    trigger: 'turnBased',
    conditions: [
      { type: 'turnNumber', value: 5, operator: 'greaterOrEqual' }
    ],
    effects: [
      { action: 'triggerEvent', target: 'all', parameters: { event: 'randomSwap', frequency: 5, count: 2, duration: 'permanent' } }
    ],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_05',
    ruleName: 'Roi Commandant',
    description: 'Le roi peut donner un mouvement supplémentaire à une pièce alliée adjacente',
    category: 'behavior',
    affectedPieces: ['king'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'allowExtraMove', target: 'specific', parameters: { range: 1, targetType: 'ally', count: 1, duration: 'temporary' } }
    ],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_06',
    ruleName: 'Brouillard de Guerre',
    description: 'Les pièces ennemies à plus de 3 cases ne sont pas visibles',
    category: 'behavior',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'restrictMovement', target: 'opponent', parameters: { visibility: 3, duration: 'permanent' } }
    ],
    priority: 10,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_07',
    ruleName: 'Gravité Inversée',
    description: 'Les pièces se déplacent dans la direction opposée à celle prévue',
    category: 'behavior',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'all', parameters: { invert: true, duration: 'permanent' } }
    ],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_08',
    ruleName: 'Fous Téléporteurs',
    description: 'Les fous peuvent échanger leur position entre eux',
    category: 'behavior',
    affectedPieces: ['bishop'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'swapPosition', targetPiece: 'bishop', duration: 'temporary' } }
    ],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_09',
    ruleName: 'Boost Tempo',
    description: 'Chaque joueur joue 2 fois d\'affilée',
    category: 'behavior',
    affectedPieces: ['all'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'changeValue', target: 'all', parameters: { property: 'turnsPerPlayer', value: 2, duration: 'permanent' } }
    ],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_10',
    ruleName: 'Chaos Total',
    description: 'Chaque mouvement a 20% de chance d\'affecter une case aléatoire',
    category: 'behavior',
    affectedPieces: ['all'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'triggerEvent', target: 'all', parameters: { event: 'randomDestination', chance: 0.2, duration: 'permanent' } }
    ],
    priority: 10,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const allPresetRules = [
  ...presetMovementRules,
  ...presetAttackRules,
  ...presetDefenseRules,
  ...presetBehaviorRules
];
