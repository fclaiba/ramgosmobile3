import { useMemo } from 'react';

export type UseGameLevelConfig =
  | {
      mode: 'score';
      score: number;
      baseLevel?: number;
      /**
       * Returns the absolute score required to advance from `level` to `level+1`.
       * Example: for “every 500 points”, use `(lvl) => 500 * lvl`.
       */
      thresholds: (level: number) => number;
    }
  | {
      mode: 'count';
      count: number;
      baseLevel?: number;
      /**
       * Returns the absolute count required to advance from `level` to `level+1`.
       * Example: “every 10 ducks”, use `(lvl) => 10 * lvl`.
       */
      thresholds: (level: number) => number;
    };

export function useGameLevel(config: UseGameLevelConfig) {
  const baseLevel = config.baseLevel ?? 1;
  const value = config.mode === 'score' ? config.score : config.count;

  return useMemo(() => {
    let level = baseLevel;
    while (value >= config.thresholds(level)) {
      level += 1;
      if (level > 999) break;
    }

    const prevThreshold = level === baseLevel ? 0 : config.thresholds(level - 1);
    const nextThreshold = config.thresholds(level);
    const denom = Math.max(1, nextThreshold - prevThreshold);
    const progress = Math.max(0, Math.min(1, (value - prevThreshold) / denom));

    return { level, progress, prevThreshold, nextThreshold };
  }, [baseLevel, config, value]);
}

