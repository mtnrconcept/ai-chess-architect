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
    tags: ['cavalier', 'double-tour', 'agressif'],
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
    tags: ['fou', 'diagonale', 'longue-portee'],
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
    tags: ['tour', 'saut', 'mobilite'],
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
    tags: ['pion', 'double-pas', 'avancee'],
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
    tags: ['reine', 'teleportation', 'strategie'],
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
    tags: ['roi', 'mobilite', 'echappatoire'],
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
    tags: ['cavalier', 'ligne', 'hybride'],
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
    tags: ['global', 'vitesse', 'acceleration'],
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
    tags: ['tour', 'diagonale', 'flexible'],
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
    tags: ['pion', 'lateral', 'controle-centre'],
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
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'allowCapture', target: 'self', parameters: { captureRange: 2, direction: 'diagonal', duration: 'permanent' } }
    ],
    tags: ['pion', 'attaque', 'diagonale'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_02',
    ruleName: 'Tour Longue Portée',
    description: 'La tour peut capturer à distance sans se déplacer',
    category: 'capture',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      {
        action: 'allowCapture',
        target: 'self',
        parameters: { range: 3, style: 'line', requiresLineOfSight: true, duration: 'permanent' }
      }
    ],
    tags: ['tour', 'longue-portee', 'attaque'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_03',
    ruleName: 'Fou Agressif',
    description: 'Le fou a une portée de capture étendue en diagonale',
    category: 'capture',
    affectedPieces: ['bishop'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'allowCapture', target: 'self', parameters: { direction: 'diagonal', bonusRange: 2, duration: 'permanent' } }
    ],
    tags: ['fou', 'attaque', 'pression'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_04',
    ruleName: 'Reine Puissante',
    description: 'La reine peut se déplacer et capturer avec une portée accrue',
    category: 'capture',
    affectedPieces: ['queen'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { bonusRange: 1, duration: 'permanent' } }
    ],
    tags: ['reine', 'agression', 'polyvalente'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_05',
    ruleName: 'Cavalier Chasseur',
    description: 'Le cavalier peut capturer en ligne droite sur 2 cases',
    category: 'capture',
    affectedPieces: ['knight'],
    trigger: 'always',
    conditions: [],
    effects: [
      {
        action: 'allowCapture',
        target: 'self',
        parameters: { direction: 'orthogonal', range: 2, pattern: 'straight', duration: 'permanent' }
      }
    ],
    tags: ['cavalier', 'hybride', 'attaque'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_06',
    ruleName: 'Pion Agressif',
    description: 'Les pions peuvent capturer vers l\'avant en plus de la diagonale',
    category: 'capture',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'forwardCapture', range: 1, duration: 'permanent' } }
    ],
    tags: ['pion', 'pression', 'avant'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_07',
    ruleName: 'Roi Combattant',
    description: 'Le roi peut capturer à 2 cases de distance',
    category: 'capture',
    affectedPieces: ['king'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'allowCapture', target: 'self', parameters: { range: 2, pattern: 'king', duration: 'permanent' } }
    ],
    tags: ['roi', 'contre-attaque', 'portee'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_08',
    ruleName: 'Capture Multiple Tour',
    description: 'La tour peut capturer plusieurs pièces alignées',
    category: 'capture',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'chainCapture', maxTargets: 2, duration: 'permanent' } }
    ],
    tags: ['tour', 'combo', 'attaque'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_09',
    ruleName: 'Pion Latéral Attaquant',
    description: 'Les pions peuvent capturer latéralement',
    category: 'capture',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'allowCapture', target: 'self', parameters: { direction: 'lateral', range: 1, duration: 'permanent' } }
    ],
    tags: ['pion', 'lateral', 'attaque'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_atk_10',
    ruleName: 'Toutes Pièces Offensives',
    description: 'Toutes les pièces ont une portée de capture augmentée de 1',
    category: 'capture',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'all', parameters: { bonusRange: 1, duration: 'permanent' } }
    ],
    tags: ['global', 'offensive', 'portee'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const presetDefenseRules: ChessRule[] = [
  {
    ruleId: 'preset_def_01',
    ruleName: 'Roi Résistant',
    description: 'Le roi peut se déplacer de 2 cases pour fuir le danger',
    category: 'defense',
    affectedPieces: ['king'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { range: 2, duration: 'permanent' } }
    ],
    tags: ['roi', 'defense', 'mobilite'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_02',
    ruleName: 'Tour Défensive',
    description: 'Les tours peuvent se déplacer en diagonale pour se protéger',
    category: 'defense',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'diagonalMove', range: 1, duration: 'permanent' } }
    ],
    tags: ['tour', 'defense', 'repositionnement'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_03',
    ruleName: 'Pions Fortifiés',
    description: 'Les pions peuvent reculer d\'une case pour se défendre',
    category: 'defense',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'backwardMove', range: 1, duration: 'permanent' } }
    ],
    tags: ['pion', 'retrait', 'defense'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_04',
    ruleName: 'Cavalier Mobile',
    description: 'Le cavalier peut faire un mouvement supplémentaire pour fuir',
    category: 'defense',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [
      { type: 'pieceType', value: 'knight', operator: 'equals' },
      { type: 'movesThisTurn', value: 1, operator: 'lessThan' }
    ],
    effects: [
      { action: 'allowExtraMove', target: 'self', parameters: { count: 1, duration: 'temporary' } }
    ],
    tags: ['cavalier', 'fuite', 'defense'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_05',
    ruleName: 'Reine Évasive',
    description: 'La reine peut téléporter pour échapper au danger tous les 5 tours',
    category: 'defense',
    affectedPieces: ['queen'],
    trigger: 'turnBased',
    conditions: [
      { type: 'turnNumber', value: 5, operator: 'greaterOrEqual' }
    ],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'teleport', frequency: 5, duration: 'permanent' } }
    ],
    tags: ['reine', 'teleportation', 'sauvetage'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_06',
    ruleName: 'Fou Rapide',
    description: 'Le fou peut se déplacer avec une portée accrue',
    category: 'defense',
    affectedPieces: ['bishop'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { bonusRange: 1, duration: 'permanent' } }
    ],
    tags: ['fou', 'retrait', 'flexibilite'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_07',
    ruleName: 'Protection Royale',
    description: 'Le roi et les pièces adjacentes sont renforcés',
    category: 'defense',
    affectedPieces: ['king'],
    trigger: 'always',
    conditions: [],
    effects: [
      {
        action: 'changeValue',
        target: 'all',
        parameters: { radius: 1, around: 'king', property: 'defense', value: 'boost', duration: 'permanent' }
      }
    ],
    tags: ['roi', 'aura', 'protection'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_08',
    ruleName: 'Ligne Défensive',
    description: 'Les tours peuvent sauter par-dessus des pièces alliées',
    category: 'defense',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'jump', duration: 'permanent' } }
    ],
    tags: ['tour', 'mur', 'soutien'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_09',
    ruleName: 'Mobilité Générale',
    description: 'Toutes les pièces ont une portée augmentée de 1',
    category: 'defense',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'all', parameters: { bonusRange: 1, duration: 'permanent' } }
    ],
    tags: ['global', 'mobilite', 'reaction'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_def_10',
    ruleName: 'Pion Latéral Défensif',
    description: 'Les pions peuvent se déplacer latéralement pour bloquer',
    category: 'defense',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'lateralMove', range: 1, duration: 'permanent' } }
    ],
    tags: ['pion', 'blocage', 'defense'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const presetBehaviorRules: ChessRule[] = [
  {
    ruleId: 'preset_beh_01',
    ruleName: 'Cavalier Double Saut',
    description: 'Le cavalier peut se déplacer deux fois par tour',
    category: 'behavior',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [
      { type: 'pieceType', value: 'knight', operator: 'equals' },
      { type: 'movesThisTurn', value: 1, operator: 'lessThan' }
    ],
    effects: [
      { action: 'allowExtraMove', target: 'self', parameters: { count: 1, duration: 'temporary' } }
    ],
    tags: ['cavalier', 'combo', 'agressif'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_02',
    ruleName: 'Pions Persistants',
    description: 'Les pions peuvent avancer de 2 cases à tout moment',
    category: 'behavior',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { doubleMove: true, duration: 'permanent' } }
    ],
    tags: ['pion', 'pression', 'avancee'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_03',
    ruleName: 'Tour Polyvalente',
    description: 'La tour peut se déplacer en diagonale sur 2 cases',
    category: 'behavior',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'diagonalMove', range: 2, duration: 'permanent' } }
    ],
    tags: ['tour', 'polyvalent', 'mobilite'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_04',
    ruleName: 'Fou Mobile',
    description: 'Le fou peut se déplacer en ligne droite sur 2 cases',
    category: 'behavior',
    affectedPieces: ['bishop'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'straightMove', range: 2, duration: 'permanent' } }
    ],
    tags: ['fou', 'hybride', 'mobilite'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_05',
    ruleName: 'Reine Omnipotente',
    description: 'La reine peut téléporter tous les 3 tours',
    category: 'behavior',
    affectedPieces: ['queen'],
    trigger: 'turnBased',
    conditions: [
      { type: 'turnNumber', value: 3, operator: 'greaterOrEqual' }
    ],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'teleport', frequency: 3, duration: 'permanent' } }
    ],
    tags: ['reine', 'teleportation', 'controle'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_06',
    ruleName: 'Roi Agile',
    description: 'Le roi peut se déplacer de 2 cases',
    category: 'behavior',
    affectedPieces: ['king'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'self', parameters: { range: 2, duration: 'permanent' } }
    ],
    tags: ['roi', 'mobilite', 'polyvalent'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_07',
    ruleName: 'Cavalier Ligne Droite',
    description: 'Le cavalier peut se déplacer en ligne droite sur 3 cases',
    category: 'behavior',
    affectedPieces: ['knight'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'straightMove', range: 3, duration: 'permanent' } }
    ],
    tags: ['cavalier', 'controle', 'hybride'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_08',
    ruleName: 'Pion Latéral',
    description: 'Les pions peuvent se déplacer latéralement',
    category: 'behavior',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'lateralMove', range: 1, duration: 'permanent' } }
    ],
    tags: ['pion', 'lateral', 'flexible'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_09',
    ruleName: 'Tour Sauteuse',
    description: 'La tour peut sauter par-dessus une pièce alliée',
    category: 'behavior',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'jump', duration: 'permanent' } }
    ],
    tags: ['tour', 'saut', 'surprise'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_beh_10',
    ruleName: 'Mobilité Accrue',
    description: 'Toutes les pièces ont +1 de portée',
    category: 'behavior',
    affectedPieces: ['all'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'modifyMovement', target: 'all', parameters: { bonusRange: 1, duration: 'permanent' } }
    ],
    tags: ['global', 'vitesse', 'dynamique'],
    priority: 5,
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
