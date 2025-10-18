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

export const presetBizarreRules: ChessRule[] = [
  {
    ruleId: 'preset_biz_01',
    ruleName: 'Reine Fantôme',
    description: 'La reine devient invisible pendant un tour après avoir capturé une pièce',
    category: 'special',
    affectedPieces: ['queen'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'addAbility', target: 'self', parameters: { ability: 'invisibility', duration: 'turns', turns: 1 } }
    ],
    tags: ['reine', 'fantome', 'subtil'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_02',
    ruleName: 'Roi Boomerang',
    description: 'Le roi revient automatiquement sur sa case initiale après deux tours',
    category: 'behavior',
    affectedPieces: ['king'],
    trigger: 'turnBased',
    conditions: [
      { type: 'turnNumber', value: 2, operator: 'greaterOrEqual' }
    ],
    effects: [
      { action: 'forcedReturn', target: 'self', parameters: { origin: 'start', frequency: 2, duration: 'permanent' } }
    ],
    tags: ['roi', 'retour', 'absurde'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_03',
    ruleName: 'Pions Magnétiques',
    description: 'Les pions attirent les pièces adverses situées à une case orthogonale',
    category: 'behavior',
    affectedPieces: ['pawn'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'pullOpponents', target: 'opponent', parameters: { distance: 1, direction: 'orthogonal', duration: 'permanent' } }
    ],
    tags: ['pion', 'magnetique', 'controle'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_04',
    ruleName: 'Tour Garde-Temps',
    description: 'Les tours peuvent geler le compteur de tours pendant un tour complet',
    category: 'special',
    affectedPieces: ['rook'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'freezeTurn', target: 'all', parameters: { duration: 'turns', turns: 1 } }
    ],
    tags: ['tour', 'temps', 'controle'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_05',
    ruleName: 'Fous Retournés',
    description: 'Lorsque un fou atteint le bord, il change de couleur et d\'équipe pour un tour',
    category: 'special',
    affectedPieces: ['bishop'],
    trigger: 'onMove',
    conditions: [
      { type: 'positionEdge', value: true, operator: 'equals' }
    ],
    effects: [
      { action: 'swapSides', target: 'self', parameters: { duration: 'turns', turns: 1 } }
    ],
    tags: ['fou', 'trahison', 'bord'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_06',
    ruleName: 'Cavaliers Boiteux',
    description: 'Les cavaliers doivent toujours terminer leur saut sur une case déjà occupée',
    category: 'restriction',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'forceCapture', target: 'self', parameters: { requirement: 'occupiedDestination', duration: 'permanent' } }
    ],
    tags: ['cavalier', 'restriction', 'chaotique'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_07',
    ruleName: 'Recyclage Express',
    description: 'Toute pièce capturée revient comme pion dans le camp adverse après un tour',
    category: 'special',
    affectedPieces: ['all'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'respawnAsPawn', target: 'opponent', parameters: { delay: 1, duration: 'permanent' } }
    ],
    tags: ['respawn', 'pion', 'absurde'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_08',
    ruleName: 'Roi Tourbillon',
    description: 'Lorsque le roi se déplace, il repousse toutes les pièces adjacentes de deux cases',
    category: 'behavior',
    affectedPieces: ['king'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'pushPieces', target: 'all', parameters: { radius: 1, distance: 2, duration: 'permanent' } }
    ],
    tags: ['roi', 'tourbillon', 'zone'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_09',
    ruleName: 'Pions Échelle',
    description: 'Deux pions alliés alignés se transforment temporairement en tour',
    category: 'special',
    affectedPieces: ['pawn'],
    trigger: 'conditional',
    conditions: [
      { type: 'adjacentAlly', value: 'pawn', operator: 'equals' }
    ],
    effects: [
      { action: 'temporaryTransform', target: 'self', parameters: { newType: 'rook', duration: 'turns', turns: 1 } }
    ],
    tags: ['pion', 'transformation', 'cooperation'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_10',
    ruleName: 'Reine Mélomane',
    description: 'La reine ne peut capturer que si une pièce alliée a bougé juste avant',
    category: 'restriction',
    affectedPieces: ['queen'],
    trigger: 'onCapture',
    conditions: [
      { type: 'allyMovedLast', value: true, operator: 'equals' }
    ],
    effects: [
      { action: 'restrictCapture', target: 'self', parameters: { requirement: 'allyMoved', duration: 'permanent' } }
    ],
    tags: ['reine', 'rythme', 'restriction'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_11',
    ruleName: 'Cavaliers Catapultes',
    description: 'Les cavaliers peuvent lancer une pièce alliée située sur leur case de départ',
    category: 'special',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'launchAlly', target: 'specific', parameters: { range: 3, direction: 'any', duration: 'temporary' } }
    ],
    tags: ['cavalier', 'catapulte', 'coop'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_12',
    ruleName: 'Tour Tiroir',
    description: 'Les tours peuvent échanger leur position avec une pièce alliée adjacente',
    category: 'movement',
    affectedPieces: ['rook'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'swapPositions', target: 'specific', parameters: { scope: 'adjacentAllies', duration: 'permanent' } }
    ],
    tags: ['tour', 'echange', 'position'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_13',
    ruleName: 'Roi Caméléon',
    description: 'Le roi adopte temporairement les mouvements de la pièce qui vient de le menacer',
    category: 'special',
    affectedPieces: ['king'],
    trigger: 'onCheck',
    conditions: [],
    effects: [
      { action: 'copyMovement', target: 'self', parameters: { source: 'attacker', duration: 'turns', turns: 1 } }
    ],
    tags: ['roi', 'cameleon', 'defense'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_14',
    ruleName: 'Pions Somnambules',
    description: 'Une fois par partie, chaque pion peut se déplacer en arrière pendant la nuit (tour pair)',
    category: 'movement',
    affectedPieces: ['pawn'],
    trigger: 'turnBased',
    conditions: [
      { type: 'turnParity', value: 'even', operator: 'equals' }
    ],
    effects: [
      { action: 'allowBackwardMove', target: 'self', parameters: { uses: 1, duration: 'permanent' } }
    ],
    tags: ['pion', 'nuit', 'retour'],
    priority: 3,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_15',
    ruleName: 'Fous Hypnotiques',
    description: 'Les fous immobilisent une pièce adverse qu\'ils menacent pendant un tour',
    category: 'defense',
    affectedPieces: ['bishop'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'immobilize', target: 'opponent', parameters: { scope: 'threatened', duration: 'turns', turns: 1 } }
    ],
    tags: ['fou', 'hypnose', 'controle'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_16',
    ruleName: 'Reine Bifide',
    description: 'La reine se dédouble en créant une copie fantôme inoffensive pour un tour',
    category: 'special',
    affectedPieces: ['queen'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'spawnDecoy', target: 'self', parameters: { lifespan: 1, duration: 'turns', turns: 1 } }
    ],
    tags: ['reine', 'clone', 'bluff'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_17',
    ruleName: 'Tour Echo',
    description: 'Une tour peut répéter son dernier mouvement au tour suivant sans compter comme une action',
    category: 'movement',
    affectedPieces: ['rook'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'allowRepeatMove', target: 'self', parameters: { free: true, duration: 'turns', turns: 1 } }
    ],
    tags: ['tour', 'echo', 'tempo'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_18',
    ruleName: 'Cavaliers Caméra',
    description: 'Les cavaliers révèlent toutes les cases menacées pendant un tour après leur saut',
    category: 'special',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'revealThreats', target: 'all', parameters: { duration: 'turns', turns: 1 } }
    ],
    tags: ['cavalier', 'vision', 'information'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_19',
    ruleName: 'Pions Sacrifice',
    description: 'Lorsqu\'un pion est capturé, il explose et élimine toutes les pièces adjacentes',
    category: 'special',
    affectedPieces: ['pawn'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'areaExplosion', target: 'all', parameters: { radius: 1, includeSelf: true, duration: 'permanent' } }
    ],
    tags: ['pion', 'explosion', 'sacrifice'],
    priority: 10,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_20',
    ruleName: 'Reine Cartographe',
    description: 'La reine marque une case qui devient impraticable pour tout le monde pendant deux tours',
    category: 'restriction',
    affectedPieces: ['queen'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'markTile', target: 'all', parameters: { blocked: true, duration: 'turns', turns: 2 } }
    ],
    tags: ['reine', 'territoire', 'controle'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_21',
    ruleName: 'Roi Paratonnerre',
    description: 'Le roi absorbe une capture visant une pièce alliée adjacente et prend sa place',
    category: 'defense',
    affectedPieces: ['king'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'redirectCapture', target: 'self', parameters: { scope: 'adjacentAllies', duration: 'permanent' } }
    ],
    tags: ['roi', 'sacrifice', 'defense'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_22',
    ruleName: 'Tour Ressort',
    description: 'Après avoir été poussée, une tour rebondit sur la case opposée',
    category: 'movement',
    affectedPieces: ['rook'],
    trigger: 'conditional',
    conditions: [
      { type: 'wasPushed', value: true, operator: 'equals' }
    ],
    effects: [
      { action: 'springBack', target: 'self', parameters: { distance: 1, duration: 'permanent' } }
    ],
    tags: ['tour', 'ressort', 'reaction'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_23',
    ruleName: 'Cavaliers Marionnettes',
    description: 'Les cavaliers peuvent déplacer une pièce alliée adjacente en même temps qu\'eux',
    category: 'movement',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'moveAlly', target: 'specific', parameters: { scope: 'adjacentAllies', distance: 1, duration: 'permanent' } }
    ],
    tags: ['cavalier', 'marionnette', 'synergie'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_24',
    ruleName: 'Pions Bascule',
    description: 'Les pions changent de direction d\'attaque à chaque tour',
    category: 'behavior',
    affectedPieces: ['pawn'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'alternateAttack', target: 'self', parameters: { pattern: ['diagonal', 'orthogonal'], duration: 'permanent' } }
    ],
    tags: ['pion', 'bascule', 'attaque'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_25',
    ruleName: 'Reine Paradoxe',
    description: 'La reine ne peut rester deux tours de suite sur une case de la même couleur',
    category: 'restriction',
    affectedPieces: ['queen'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'colorRestriction', target: 'self', parameters: { alternate: true, duration: 'permanent' } }
    ],
    tags: ['reine', 'paradoxe', 'couleur'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_26',
    ruleName: 'Fous Spirale',
    description: 'Les fous doivent tourner autour du roi en spirale avant d\'attaquer',
    category: 'restriction',
    affectedPieces: ['bishop'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'spiralRequirement', target: 'self', parameters: { center: 'king', duration: 'permanent' } }
    ],
    tags: ['fou', 'spirale', 'rituel'],
    priority: 3,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_27',
    ruleName: 'Tour Forteresse',
    description: 'Les tours créent un mur invisible bloquant les pièces adverses sur la même colonne',
    category: 'defense',
    affectedPieces: ['rook'],
    trigger: 'always',
    conditions: [],
    effects: [
      { action: 'blockColumn', target: 'opponent', parameters: { strength: 1, duration: 'permanent' } }
    ],
    tags: ['tour', 'forteresse', 'mur'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_28',
    ruleName: 'Cavaliers Messagers',
    description: 'Les cavaliers transmettent un bonus de +1 portée à la prochaine pièce alliée à jouer',
    category: 'behavior',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'grantRangeBonus', target: 'all', parameters: { recipients: 'nextAlly', bonus: 1, duration: 'turns', turns: 1 } }
    ],
    tags: ['cavalier', 'messager', 'bonus'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_29',
    ruleName: 'Pions Arche',
    description: 'Deux pions côte à côte créent une arche que les pièces alliées peuvent traverser pour se téléporter',
    category: 'special',
    affectedPieces: ['pawn'],
    trigger: 'conditional',
    conditions: [
      { type: 'adjacentPair', value: true, operator: 'equals' }
    ],
    effects: [
      { action: 'allyTeleport', target: 'all', parameters: { range: 4, usage: 1, duration: 'turns', turns: 1 } }
    ],
    tags: ['pion', 'teleportation', 'support'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_30',
    ruleName: 'Reine Orbitale',
    description: 'La reine doit toujours rester à distance de deux cases du roi',
    category: 'restriction',
    affectedPieces: ['queen'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'distanceConstraint', target: 'self', parameters: { from: 'king', min: 2, max: 2, duration: 'permanent' } }
    ],
    tags: ['reine', 'orbite', 'strategie'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_31',
    ruleName: 'Fous Télékinésistes',
    description: 'Les fous peuvent déplacer une pièce ennemie d\'une case au lieu de bouger',
    category: 'behavior',
    affectedPieces: ['bishop'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'moveEnemy', target: 'opponent', parameters: { distance: 1, direction: 'any', duration: 'permanent' } }
    ],
    tags: ['fou', 'telekinesie', 'controle'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_32',
    ruleName: 'Roi Illusionniste',
    description: 'Le roi peut échanger sa place avec une illusion une fois par partie',
    category: 'special',
    affectedPieces: ['king'],
    trigger: 'conditional',
    conditions: [
      { type: 'usesRemaining', value: 1, operator: 'greaterThan' }
    ],
    effects: [
      { action: 'swapWithDecoy', target: 'self', parameters: { uses: 1, duration: 'permanent' } }
    ],
    tags: ['roi', 'illusion', 'survie'],
    priority: 10,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_33',
    ruleName: 'Tour Bifurcation',
    description: 'Lorsqu\'une tour atteint le centre, elle se divise en deux tours miniatures',
    category: 'special',
    affectedPieces: ['rook'],
    trigger: 'conditional',
    conditions: [
      { type: 'positionZone', value: 'center', operator: 'equals' }
    ],
    effects: [
      { action: 'splitPiece', target: 'self', parameters: { newPieces: 2, size: 'mini', duration: 'permanent' } }
    ],
    tags: ['tour', 'division', 'centre'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_34',
    ruleName: 'Cavaliers Fantaisistes',
    description: 'Les cavaliers choisissent un motif de saut différent à chaque tour',
    category: 'movement',
    affectedPieces: ['knight'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'cyclePatterns', target: 'self', parameters: { patterns: ['classique', 'long', 'court'], duration: 'permanent' } }
    ],
    tags: ['cavalier', 'fantaisie', 'variation'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_35',
    ruleName: 'Pions Buvards',
    description: 'Les pions absorbent les pouvoirs des pièces qu\'ils capturent pendant un tour',
    category: 'special',
    affectedPieces: ['pawn'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'absorbAbility', target: 'self', parameters: { duration: 'turns', turns: 1 } }
    ],
    tags: ['pion', 'absorption', 'adaptation'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_36',
    ruleName: 'Reine Caduque',
    description: 'La reine doit être activée par un pion allié adjacent avant chaque déplacement',
    category: 'condition',
    affectedPieces: ['queen'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'requireActivation', target: 'self', parameters: { activator: 'pawn', range: 1, duration: 'permanent' } }
    ],
    tags: ['reine', 'condition', 'rituel'],
    priority: 4,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_37',
    ruleName: 'Fous Lunaires',
    description: 'Les fous ne se déplacent que sur les cases éclairées par la lune, alternant toutes les trois cases',
    category: 'restriction',
    affectedPieces: ['bishop'],
    trigger: 'turnBased',
    conditions: [],
    effects: [
      { action: 'lunarPattern', target: 'self', parameters: { cycle: 3, duration: 'permanent' } }
    ],
    tags: ['fou', 'lune', 'mystique'],
    priority: 3,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_38',
    ruleName: 'Tour Hologramme',
    description: 'Une tour peut créer un hologramme qui détourne la prochaine capture',
    category: 'defense',
    affectedPieces: ['rook'],
    trigger: 'conditional',
    conditions: [],
    effects: [
      { action: 'createHologram', target: 'self', parameters: { blocksCaptures: 1, duration: 'turns', turns: 2 } }
    ],
    tags: ['tour', 'hologramme', 'defense'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_39',
    ruleName: 'Cavaliers Fantômes',
    description: 'Après un saut, un cavalier laisse une trace fantôme qui bloque le passage',
    category: 'restriction',
    affectedPieces: ['knight'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'leavePhantom', target: 'self', parameters: { duration: 'turns', turns: 1 } }
    ],
    tags: ['cavalier', 'fantome', 'blocage'],
    priority: 5,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_biz_40',
    ruleName: 'Pions Accordéon',
    description: 'Les pions peuvent s\'étirer pour occuper deux cases verticales pendant un tour',
    category: 'special',
    affectedPieces: ['pawn'],
    trigger: 'onMove',
    conditions: [],
    effects: [
      { action: 'stretch', target: 'self', parameters: { orientation: 'vertical', duration: 'turns', turns: 1 } }
    ],
    tags: ['pion', 'accordeon', 'volume'],
    priority: 6,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const presetVipMagnusGoatRules: ChessRule[] = [
  {
    ruleId: 'preset_vip_magnus_02',
    ruleName: 'L\'écho stratégique',
    description: 'Chaque poussée de pion oblige l\'adversaire à répondre par un coup de pion symétrique dans la colonne miroir.',
    category: 'vip',
    affectedPieces: ['pawn'],
    trigger: 'onMove',
    conditions: [
      { type: 'pieceType', value: 'pawn', operator: 'equals' }
    ],
    effects: [
      { action: 'forceMirrorMove', target: 'opponent', parameters: { pieceType: 'pawn', symmetry: 'file', window: 1 } }
    ],
    tags: ['vip', 'magnus', 'pions', 'symetrie', 'tempo'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_03',
    ruleName: 'L\'effet pendule',
    description: 'Tout échange de pièces transfère 10 secondes du chrono du joueur actif à son adversaire.',
    category: 'vip',
    affectedPieces: ['all'],
    trigger: 'onCapture',
    conditions: [],
    effects: [
      { action: 'transferTime', target: 'opponent', parameters: { seconds: 10 } }
    ],
    tags: ['vip', 'magnus', 'tempo', 'echange', 'horloge'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_04',
    ruleName: 'Le pion-éclaireur',
    description: 'Une fois par partie, un pion peut bondir de 3 cases lors de sa première sortie mais perd la capture en diagonale.',
    category: 'vip',
    affectedPieces: ['pawn'],
    trigger: 'onMove',
    conditions: [
      { type: 'pieceType', value: 'pawn', operator: 'equals' },
      { type: 'hasMoved', value: false, operator: 'equals' }
    ],
    effects: [
      { action: 'enableBurstAdvance', target: 'self', parameters: { squares: 3, usage: 1, disableDiagonalCapture: true } }
    ],
    tags: ['vip', 'magnus', 'pions', 'centre', 'initiative'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_05',
    ruleName: 'La spirale du roi',
    description: 'Une fois par partie, le roi peut se déplacer comme un cavalier pour échapper à la pression.',
    category: 'vip',
    affectedPieces: ['king'],
    trigger: 'conditional',
    conditions: [
      { type: 'hasMoved', value: false, operator: 'equals' }
    ],
    effects: [
      { action: 'grantSpecialMove', target: 'self', parameters: { pattern: 'knight', usage: 1 } }
    ],
    tags: ['vip', 'magnus', 'roi', 'finale', 'sauvetage'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_06',
    ruleName: 'La mémoire de la position',
    description: 'À la troisième répétition d\'une position, le joueur à l\'origine peut transformer un pion en pièce mineure.',
    category: 'vip',
    affectedPieces: ['pawn'],
    trigger: 'conditional',
    conditions: [],
    effects: [
      { action: 'transformPawn', target: 'self', parameters: { promotion: ['rook', 'bishop', 'knight'], immediate: true } }
    ],
    tags: ['vip', 'magnus', 'repetition', 'transformation', 'mineure'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_07',
    ruleName: 'Coup d\'instinct',
    description: 'Un coup joué en moins de 2 secondes et validé par l\'IA octroie 30 secondes supplémentaires.',
    category: 'vip',
    affectedPieces: ['all'],
    trigger: 'conditional',
    conditions: [],
    effects: [
      { action: 'grantTimeBonus', target: 'self', parameters: { seconds: 30, validation: 'aiQualityCheck' } }
    ],
    tags: ['vip', 'magnus', 'intuition', 'temps', 'pression'],
    priority: 7,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_08',
    ruleName: 'Le miroir inversé',
    description: 'Donner échec autorise immédiatement l\'adversaire à rejouer le coup précédent de son choix.',
    category: 'vip',
    affectedPieces: ['all'],
    trigger: 'onCheck',
    conditions: [],
    effects: [
      { action: 'allowUndo', target: 'opponent', parameters: { moves: 1, immediate: true, reason: 'mirror' } }
    ],
    tags: ['vip', 'magnus', 'echec', 'controle', 'calcul'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_09',
    ruleName: 'Le gel temporel',
    description: 'Une fois par partie, gèle une pièce adverse pendant deux tours l\'empêchant de bouger ou de capturer.',
    category: 'vip',
    affectedPieces: ['all'],
    trigger: 'conditional',
    conditions: [],
    effects: [
      { action: 'freezePiece', target: 'opponent', parameters: { turns: 2, usage: 1 } }
    ],
    tags: ['vip', 'magnus', 'controle', 'zugzwang', 'tempo'],
    priority: 9,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  },
  {
    ruleId: 'preset_vip_magnus_10',
    ruleName: 'L\'esprit du jeu',
    description: 'Un sacrifice volontaire sans gain matériel direct offre un jeton pour rejouer un coup ou un pion.',
    category: 'vip',
    affectedPieces: ['all'],
    trigger: 'conditional',
    conditions: [],
    effects: [
      { action: 'grantToken', target: 'self', parameters: { token: 'spirit', redeemOptions: ['redoMove', 'replayPawn'], stackable: true } }
    ],
    tags: ['vip', 'magnus', 'sacrifice', 'romantique', 'jeton'],
    priority: 8,
    isActive: false,
    validationRules: { allowedWith: [], conflictsWith: [], requiredState: {} }
  }
];

export const allPresetRules = [
  ...presetVipMagnusGoatRules,
  ...presetMovementRules,
  ...presetAttackRules,
  ...presetDefenseRules,
  ...presetBehaviorRules,
  ...presetBizarreRules
];
