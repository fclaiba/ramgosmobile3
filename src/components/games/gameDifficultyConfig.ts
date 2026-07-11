import type { GameId } from './gameContracts';

export type ArcadeDifficultyParams =
  | { gameId: 'dino'; speedMultiplier: number; obstacleSpawnMultiplier: number }
  | { gameId: 'duck'; spawnMultiplier: number; duckSpeedMultiplier: number }
  | { gameId: 'fruit'; fallSpeedMultiplier: number; spawnMultiplier: number }
  | { gameId: 'memory'; grid: { cols: number; rows: number }; previewMs: number }
  | { gameId: 'flappy'; fallSpeedMultiplier: number; gapMultiplier: number };

export const GAME_LEVEL_THRESHOLDS: Record<GameId, (level: number) => number> = {
  dino: (lvl) => 500 * lvl,
  duck: (lvl) => 10 * lvl,
  fruit: (lvl) => 100 * lvl, // 10 fruits caught (score +10 each)
  memory: (lvl) => 1 * lvl,
  flappy: (lvl) => 50 * lvl,
};

export function getArcadeParams(gameId: GameId, level: number): ArcadeDifficultyParams | null {
  const lvl = Math.max(1, level);
  if (gameId === 'dino') {
    return {
      gameId,
      speedMultiplier: 1 + (lvl - 1) * 0.2,
      obstacleSpawnMultiplier: 1 + (lvl - 1) * 0.15,
    };
  }
  if (gameId === 'duck') {
    return {
      gameId,
      spawnMultiplier: 1 + (lvl - 1) * 0.2,
      duckSpeedMultiplier: 1 + (lvl - 1) * 0.25,
    };
  }
  if (gameId === 'fruit') {
    return {
      gameId,
      fallSpeedMultiplier: 1 + (lvl - 1) * 0.15,
      spawnMultiplier: 1 + (lvl - 1) * 0.1,
    };
  }
  if (gameId === 'memory') {
    // Minimal ramp: increase preview time slightly while complexity grows in-game logic.
    const basePreview = 2000;
    return {
      gameId,
      grid: { cols: Math.min(5, 2 + lvl), rows: Math.min(5, 2 + Math.floor((lvl + 1) / 2)) },
      previewMs: Math.max(500, basePreview - lvl * 150),
    };
  }
  if (gameId === 'flappy') {
    return {
      gameId,
      fallSpeedMultiplier: 1 + (lvl - 1) * 0.1,
      gapMultiplier: Math.max(0.6, 1 - (lvl - 1) * 0.05),
    };
  }
  return null;
}
