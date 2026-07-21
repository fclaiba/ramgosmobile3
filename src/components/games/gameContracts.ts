import { glassShadow } from '../../theme/tokens';

/**
 * Game Contracts (Parte 0)
 * ------------------------
 * Este archivo define el contrato común para enchufar los 6 juegos a un wrapper compartido
 * (punto de integración: `src/components/pet/MiMascotaView.tsx`).
 *
 * Importante:
 * - Esto es SOLO contrato/tipos/tokens. No implica refactors automáticos.
 * - El wrapper puede usar este contrato para normalizar HUD/overlays/leveling/audio.
 */

export type GameId = 'fruit' | 'duck' | 'memory' | 'dino' | 'flappy';

export type GameThemeFamily = 'arcade' | 'casino';

/** Estados estándar del wrapper (normaliza los estados internos de cada juego). */
export type GameStatus = 'start' | 'playing' | 'paused' | 'gameover' | 'levelup';

/** Acciones estándar que el wrapper puede disparar. */
export type GameAction = 'start' | 'pause' | 'resume' | 'restart';

/**
 * Métricas estándar para HUD / analytics / reward logic.
 * - lives: siempre presente en el contrato (aunque un juego hoy no implemente todavía).
 * - ammo: solo Duck Hunt (y juegos “shooter” futuros).
 */
export interface GameMetrics {
  score: number;
  level: number;
  /** 0..1 (progreso hacia el siguiente nivel). */
  progressToNext: number;
  lives: number;
  ammo?: number;
  timeLeft?: number;
}

/**
 * Snapshot “single source of truth” que el wrapper puede renderizar en HUD.
 * Se actualiza via `onEvent({type:'metrics'|'status'|...})`.
 */
export interface GameSnapshot {
  status: GameStatus;
  metrics: GameMetrics;
  /** Epoch ms. Útil para depurar o reconciliar eventos. */
  ts: number;
}

/**
 * Evento estándar juego -> wrapper.
 * Diseñado para ser “streamable”: el juego puede emitir eventos parciales sin enviar todo el estado.
 */
export type GameEvent =
  | { type: 'status'; status: GameStatus; previous?: GameStatus }
  | { type: 'metrics'; patch: Partial<GameMetrics> }
  | { type: 'levelup'; level: number }
  | { type: 'gameover'; final: GameMetrics; reason?: string }
  /**
   * Reward/currency “delta” (casino principalmente).
   * - Ejemplo: ruleta reporta netChange (premio - costo).
   * - Ejemplo: slots reporta winAmount (puede ser negativo si hay costo).
   */
  | { type: 'currencyDelta'; delta: number; currency: 'coins' | 'points'; reason?: string };

/**
 * Resultado final (evento terminal) para que el wrapper traduzca a recompensas (coins/puntos).
 * Nota: en el repo actual, `onGameEnd` está sobrecargado (arcade manda score, casino manda delta).
 * Este tipo separa explícitamente ambos.
 */
export interface GameEndSummary {
  gameId: GameId;
  family: GameThemeFamily;
  /** Para arcade: score final (>=0). Para casino: puede ser 0. */
  score: number;
  /** Para casino: delta neto en coins. Para arcade: omitido. */
  currencyDelta?: { currency: 'coins' | 'points'; delta: number };
  finalMetrics: GameMetrics;
  reason?: string;
}

/**
 * Props estándar del wrapper -> juego.
 * El wrapper mantiene el “contrato común”, el juego decide cómo implementarlo internamente.
 */
export interface GameAdapterProps {
  gameId: GameId;
  family: GameThemeFamily;
  theme: GameThemeTokens;

  /** Semilla opcional (debug reproducible). */
  seed?: number;

  /** Snapshot inicial si el wrapper quiere controlar HUD desde el minuto 0. */
  initialSnapshot?: GameSnapshot;

  /** Contexto de monedas (solo casino hoy). */
  currency?: {
    coins: number;
  };

  /** Eventos del juego hacia el wrapper (status/metrics/etc). */
  onEvent?: (event: GameEvent) => void;

  /** Acciones UI estándar del wrapper. */
  onRequestClose?: () => void;

  /** Evento terminal (recomendado). */
  onEnd?: (summary: GameEndSummary) => void;
}

/**
 * Handle opcional para control imperativo (pause/resume/restart),
 * útil si el wrapper controla overlays/hud globales.
 */
export interface GameAdapterHandle {
  dispatch: (action: GameAction) => void;
  getSnapshot?: () => GameSnapshot;
}

/**
 * --- Theme Tokens ---
 * Naming consistente:
 * - colors.*: colores base semánticos
 * - gradients.*: gradientes (array de hex)
 * - typography.*: tamaños/pesos base (sin asumir fuentes globales)
 * - spacing.*: escala (px)
 * - radius.*: escala (px)
 * - shadows.*: presets multiplataforma
 */
export interface GameThemeTokens {
  family: GameThemeFamily;
  gameId: GameId;

  colors: {
    bg: string;
    surface: string;
    surface2: string;
    text: string;
    textMuted: string;
    border: string;

    accent: string;
    accent2: string;
    success: string;
    warning: string;
    danger: string;

    hudBg: string;
    hudText: string;
    hudBorder: string;
  };

  background?: string; // Legacy fallback
  surfaceGradient?: readonly [string, string, ...string[]]; // Legacy fallback

  gradients: {
    /** Fondo principal del juego (si aplica). */
    bg: readonly [string, string, ...string[]];
    /** Call-to-action principal. */
    cta: readonly [string, string, ...string[]];
    /** HUD (si se usa). */
    hud: readonly [string, string, ...string[]];
  };

  typography: {
    display: { fontSize: number; fontWeight: '700' | '800' | '900' };
    title: { fontSize: number; fontWeight: '700' | '800' | '900' };
    hud: { fontSize: number; fontWeight: '600' | '700' | '800' };
    body: { fontSize: number; fontWeight: '400' | '500' | '600' };
  };

  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    '2xl': number;
  };

  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };

  shadows: {
    /** Para wrappers/hud/cards. */
    elev1: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
    elev2: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
  };
}

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const satisfies GameThemeTokens['spacing'];

const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const satisfies GameThemeTokens['radius'];

const SHADOWS: GameThemeTokens['shadows'] = {
  elev1: {
    ...(glassShadow(false) as any), shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  elev2: {
    ...(glassShadow(false) as any), shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};

const TYPO_ARCADE: GameThemeTokens['typography'] = {
  display: { fontSize: 40, fontWeight: '900' },
  title: { fontSize: 28, fontWeight: '900' },
  hud: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 14, fontWeight: '500' },
};

const BASE_ARCADE = {
  family: 'arcade',
  colors: {
    bg: '#0B1220',
    surface: 'rgba(255,255,255,0.10)',
    surface2: 'rgba(255,255,255,0.16)',
    text: '#FFFFFF',
    textMuted: 'rgba(255,255,255,0.75)',
    border: 'rgba(255,255,255,0.18)',

    accent: '#22C55E',
    accent2: '#38BDF8',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',

    hudBg: 'rgba(255,255,255,0.85)',
    hudText: '#111827',
    hudBorder: 'rgba(0,0,0,0.08)',
  },
  gradients: {
    bg: ['#0B1220', '#111827'] as const,
    cta: ['#22C55E', '#10B981'] as const,
    hud: ['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.75)'] as const,
  },
  typography: TYPO_ARCADE,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
} as const satisfies Omit<GameThemeTokens, 'gameId'>;

/**
 * Tokens por juego (Arcade vs Casino + overrides).
 * Nota: hoy cada juego tiene estilos hardcodeados; estos tokens son la “fuente” a la que migraremos.
 */
export const GAME_THEMES: Record<GameId, GameThemeTokens> = {
  fruit: {
    ...BASE_ARCADE,
    gameId: 'fruit',
    colors: {
      ...BASE_ARCADE.colors,
      bg: '#FFF1F2',
      accent: '#DB2777',
      accent2: '#EC4899',
      danger: '#EF4444',
      hudBg: '#FFF1F2',
      hudText: '#9D174D',
    },
    gradients: {
      ...BASE_ARCADE.gradients,
      bg: ['#EC4899', '#FECDD3'],
      cta: ['#DB2777', '#EC4899'],
    },
  },
  duck: {
    ...BASE_ARCADE,
    gameId: 'duck',
    colors: {
      ...BASE_ARCADE.colors,
      bg: '#87CEEB',
      accent: '#0D9488',
      accent2: '#38BDF8',
      hudBg: 'rgba(255,255,255,0.85)',
      hudText: '#1F2937',
    },
    gradients: {
      ...BASE_ARCADE.gradients,
      bg: ['#87CEEB', '#E0F7FA'],
      cta: ['#0D9488', '#14B8A6'],
    },
  },
  memory: {
    ...BASE_ARCADE,
    gameId: 'memory',
    colors: {
      ...BASE_ARCADE.colors,
      bg: '#DDD6FE',
      accent: '#2196F3',
      accent2: '#5DD3F3',
      hudBg: 'rgba(255,255,255,0.85)',
      hudText: '#4B5563',
    },
    gradients: {
      ...BASE_ARCADE.gradients,
      bg: ['#5DD3F3', '#DDD6FE'],
      cta: ['#2196F3', '#4FC3F7'],
    },
  },
  dino: {
    ...BASE_ARCADE,
    gameId: 'dino',
    colors: {
      ...BASE_ARCADE.colors,
      bg: '#FEF3C7',
      accent: '#B45309',
      accent2: '#EAB308',
      hudBg: 'rgba(255,255,255,0.85)',
      hudText: '#92400E',
    },
    gradients: {
      ...BASE_ARCADE.gradients,
      bg: ['#FEF3C7', '#FDE68A'],
      cta: ['#B45309', '#D97706'],
    },
  },
  flappy: {
    ...BASE_ARCADE,
    gameId: 'flappy',
    colors: {
      ...BASE_ARCADE.colors,
      bg: '#E0F2FE',
      accent: '#0284C7',
      accent2: '#38BDF8',
      hudBg: 'rgba(255,255,255,0.85)',
      hudText: '#0369A1',
    },
    gradients: {
      ...BASE_ARCADE.gradients,
      bg: ['#E0F2FE', '#BAE6FD'],
      cta: ['#0284C7', '#0369A1'],
    },
  }
};

export const GAME_FAMILY_BY_ID: Record<GameId, GameThemeFamily> = {
  fruit: 'arcade',
  duck: 'arcade',
  memory: 'arcade',
  dino: 'arcade',
  flappy: 'arcade',
};

/**
 * Utilidad: obtiene tokens por id.
 * (Mantener simple; el wrapper puede cachear/memoizar.)
 */
export function getGameTheme(gameId: GameId): GameThemeTokens {
  return GAME_THEMES[gameId];
}
