import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Pause, Play, RotateCcw, X, Coins, Heart, Clock } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import {
  type GameAction,
  type GameEndSummary,
  type GameEvent,
  type GameId,
  type GameSnapshot,
  type GameStatus,
  getGameTheme,
  GAME_FAMILY_BY_ID,
  GAME_DISPLAY_NAMES,
  GAME_TAGLINES,
} from './gameContracts';
import { glassShadow, Radius } from '../../theme/tokens';

export type GameActionSignal = { type: GameAction; nonce: number } | null;

type GameWrapperRenderProps = {
  /** Inyectado al juego para que reaccione a acciones del wrapper. */
  actionSignal?: GameActionSignal;
  /** En wrapped mode, el juego no debería renderizar su HUD/overlays internos. */
  uiMode?: 'standalone' | 'wrapped';
};

export type GameWrapperProps = {
  gameId: GameId;
  /** Game component (legacy or new contract). Extra props are passed through. */
  GameComponent: React.ComponentType<any>;
  /** Coins available (for casino validation and HUD). */
  coins?: number;
  /** Called when user closes wrapper (X). */
  onClose: () => void;
  /**
   * Back-compat: arcade expects `score`, casino expects `netDelta`.
   * We keep this to avoid breaking current reward flows.
   */
  onLegacyGameEnd?: (value: number) => void;
  /** If true, saving result also closes the wrapper (MiMascota behavior). */
  autoCloseOnSave?: boolean;
  /** Optional additional props to pass into the game. */
  gameProps?: Record<string, unknown>;
};

const DEFAULT_SNAPSHOT: GameSnapshot = {
  status: 'start',
  metrics: { score: 0, level: 1, progressToNext: 0, lives: 3 },
  ts: Date.now(),
};

export function GameWrapper({
  gameId,
  GameComponent,
  coins = 0,
  onClose,
  onLegacyGameEnd,
  autoCloseOnSave = false,
  gameProps,
}: GameWrapperProps) {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);
  const family = GAME_FAMILY_BY_ID[gameId];
  const theme = useMemo(() => getGameTheme(gameId, isDark), [gameId, isDark]);
  const overlayBg =
    family === 'casino' ? 'rgba(0,0,0,0.75)' : 'rgba(15,23,42,0.6)';
  const overlayCardBg =
    family === 'casino' ? 'rgba(17,24,39,0.96)' : 'rgba(15,23,42,0.92)';
  const overlayCardAlt =
    family === 'casino' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)';

  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => {
    // Casino games don’t “die”; start them directly in playing state.
    const status: GameStatus = family === 'casino' ? 'playing' : 'start';
    const lives = family === 'casino' ? 0 : 3;
    return { ...DEFAULT_SNAPSHOT, status, metrics: { ...DEFAULT_SNAPSHOT.metrics, lives } };
  });
  const [overlay, setOverlay] = useState<GameStatus | null>(() => (family === 'casino' ? null : 'start'));
  const pendingEndRef = useRef<GameEndSummary | null>(null);

  const lastLevelRef = useRef<number>(1);
  const actionNonceRef = useRef(0);
  const [actionSignal, setActionSignal] = useState<GameActionSignal>(null);

  const dispatch = useCallback((action: GameAction) => {
    actionNonceRef.current += 1;
    setActionSignal({ type: action, nonce: actionNonceRef.current });
  }, []);

  const onEvent = useCallback((event: GameEvent) => {
    setSnapshot((prev) => {
      if (event.type === 'status') {
        return { ...prev, status: event.status, ts: Date.now() };
      }
      if (event.type === 'metrics') {
        const next = { ...prev.metrics, ...event.patch };
        return { ...prev, metrics: next, ts: Date.now() };
      }
      if (event.type === 'levelup') {
        return { ...prev, status: 'levelup', metrics: { ...prev.metrics, level: event.level }, ts: Date.now() };
      }
      if (event.type === 'gameover') {
        return { ...prev, status: 'gameover', metrics: event.final, ts: Date.now() };
      }
      // currencyDelta handled by parent rewards; snapshot remains.
      return prev;
    });
  }, []);

  const onEnd = useCallback(
    (summary: GameEndSummary) => {
      // Casino should apply delta immediately. Arcade should wait for explicit "Guardar".
      pendingEndRef.current = summary;
      if (summary.family === 'casino' && summary.currencyDelta) {
        onLegacyGameEnd?.(summary.currencyDelta.delta);
      }
    },
    [onLegacyGameEnd]
  );

  // Level-up overlay: if the game reports a higher level via metrics, show a brief overlay.
  useEffect(() => {
    const lvl = snapshot.metrics.level ?? 1;
    if (lvl > lastLevelRef.current) {
      lastLevelRef.current = lvl;
      if (family === 'arcade') {
        setOverlay('levelup');
        const t = setTimeout(() => {
          setOverlay(null);
        }, 900);
        return () => clearTimeout(t);
      }
    }
    return;
  }, [family, snapshot.metrics.level]);

  // Keep overlay in sync for arcade.
  useEffect(() => {
    if (family === 'casino') return;
    if (snapshot.status === 'gameover') setOverlay('gameover');
    if (snapshot.status === 'paused') setOverlay('paused');
    if (snapshot.status === 'playing') setOverlay(null);
    if (snapshot.status === 'start') setOverlay('start');
  }, [family, snapshot.status]);

  const handleStart = () => {
    dispatch('start');
    setSnapshot((p) => ({ ...p, status: 'playing', ts: Date.now() }));
    setOverlay(null);
  };

  const handleRestart = () => {
    dispatch('restart');
    setSnapshot((p) => ({ ...p, status: 'playing', metrics: { ...p.metrics, score: 0 }, ts: Date.now() }));
    setOverlay(null);
  };

  const handlePause = () => {
    if (family === 'casino') return;
    dispatch('pause');
    setSnapshot((p) => ({ ...p, status: 'paused', ts: Date.now() }));
    setOverlay('paused');
  };

  const handleResume = () => {
    if (family === 'casino') return;
    dispatch('resume');
    setSnapshot((p) => ({ ...p, status: 'playing', ts: Date.now() }));
    setOverlay(null);
  };

  const handleSaveAndExit = () => {
    if (!onLegacyGameEnd) {
      onClose();
      return;
    }
    if (family === 'arcade') {
      const pending = pendingEndRef.current;
      onLegacyGameEnd(pending?.score ?? snapshot.metrics.score);
    }
    if (autoCloseOnSave) onClose();
  };

  const hudRight = () => {
    if (family === 'casino') {
      return (
        <View style={styles.hudRight}>
          <Coins size={16} color={theme.colors.hudText} />
          <Text style={[styles.hudText, { color: theme.colors.hudText }]}>{coins}</Text>
        </View>
      );
    }

    if (typeof snapshot.metrics.ammo === 'number') {
      return (
        <View style={styles.hudRight}>
          <Text style={[styles.hudText, { color: theme.colors.hudText }]}>Ammo: {snapshot.metrics.ammo}</Text>
        </View>
      );
    }

    const lives = Math.max(0, snapshot.metrics.lives ?? 0);
    return (
      <View style={styles.hudRight}>
        {typeof snapshot.metrics.timeLeft === 'number' && (
          <View style={[styles.timerBadge, snapshot.metrics.timeLeft <= 10 && { backgroundColor: theme.colors.danger }]}>
            <Clock size={14} color="#fff" />
            <Text style={styles.timerText}>{snapshot.metrics.timeLeft}s</Text>
          </View>
        )}
        {[0, 1, 2].map((i) => (
          <Heart
            key={i}
            size={16}
            color={i < lives ? theme.colors.danger : 'rgba(0,0,0,0.15)'}
            fill={i < lives ? theme.colors.danger : 'none'}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      {/* HUD */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 50 : 80}
        tint={family === 'casino' ? 'dark' : (isDark ? 'dark' : 'light')}
        style={[
          styles.hud,
          {
            backgroundColor: theme.colors.hudBg,
            borderColor: theme.colors.hudBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Cerrar juego">
          <X size={18} color={theme.colors.hudText} />
        </TouchableOpacity>

        <View style={styles.hudCenter}>
          <View style={styles.levelBox}>
            <Text style={[styles.hudLabel, { color: theme.colors.hudText }]}>Nivel</Text>
            <Text style={[styles.hudText, { color: theme.colors.hudText }]}>{snapshot.metrics.level}</Text>
            <View style={[styles.progressTrack, { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(0, Math.min(1, snapshot.metrics.progressToNext ?? 0)) * 100}%`,
                    backgroundColor: theme.colors.accent,
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.scoreBox}>
            <Text style={[styles.hudLabel, { color: theme.colors.hudText }]}>Puntos</Text>
            <Text style={[styles.hudText, { color: theme.colors.hudText }]}>{snapshot.metrics.score}</Text>
          </View>
        </View>

        <View style={styles.hudActions}>
          {family === 'arcade' ? (
            <TouchableOpacity onPress={handlePause} style={styles.iconBtn} accessibilityLabel="Pausar">
              <Pause size={18} color={theme.colors.hudText} />
            </TouchableOpacity>
          ) : null}
          {hudRight()}
        </View>
      </BlurView>

      {/* Game Render */}
      <View style={styles.gameArea}>
        <GameComponent
          {...(gameProps ?? {})}
          {...({ actionSignal, uiMode: 'wrapped' } satisfies GameWrapperRenderProps)}
          gameId={gameId}
          family={family}
          theme={theme}
          currency={{ coins }}
          onEvent={onEvent}
          onEnd={onEnd}
          onRequestClose={onClose}
        />
      </View>

      {/* Overlays */}
      {overlay === 'start' && (
        <Animated.View entering={FadeIn} style={[styles.overlay, { backgroundColor: overlayBg }]}>
          <Animated.View
            entering={ZoomIn}
            style={[
              styles.overlayCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: overlayCardBg,
              },
            ]}
          >
            <Text style={[styles.overlayTitle, { color: theme.colors.text }]}>
              {GAME_DISPLAY_NAMES[gameId] ?? gameId}
            </Text>
            <Text style={[styles.overlaySubtitle, { color: theme.colors.textMuted }]}>
              {GAME_TAGLINES[gameId] ?? ''}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]}
              onPress={handleStart}
              accessibilityRole="button"
              accessibilityLabel={`Empezar a jugar ${GAME_DISPLAY_NAMES[gameId] ?? gameId}`}
            >
              <Play size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Jugar</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {overlay === 'paused' && (
        <Animated.View entering={FadeIn} style={[styles.overlay, { backgroundColor: overlayBg }]}>
          <Animated.View
            entering={FadeInDown}
            style={[
              styles.overlayCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: overlayCardBg,
              },
            ]}
          >
            <Text style={[styles.overlayTitle, { color: theme.colors.text }]}>Pausa</Text>
            <View style={{ gap: 10 }}>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]} onPress={handleResume}>
                <Play size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Continuar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: theme.colors.border, backgroundColor: overlayCardAlt },
                ]}
                onPress={handleRestart}
              >
                <RotateCcw size={20} color={theme.colors.text} />
                <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Reiniciar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: theme.colors.border, backgroundColor: overlayCardAlt },
                ]}
                onPress={onClose}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Salir</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {overlay === 'levelup' && (
        <Animated.View
          entering={FadeIn}
          style={[styles.levelupToast, { backgroundColor: theme.colors.accent }]}
        >
          <Text style={styles.levelupText}>LEVEL UP</Text>
        </Animated.View>
      )}

      {overlay === 'gameover' && (
        <Animated.View entering={FadeIn} style={[styles.overlay, { backgroundColor: overlayBg }]}>
          <Animated.View
            entering={FadeInDown}
            style={[
              styles.overlayCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: overlayCardBg,
              },
            ]}
          >
            <Text style={[styles.overlayTitle, { color: theme.colors.text }]}>Game Over</Text>

            {/* El puntaje es el remate de la partida: va grande y solo, no
                escondido en una línea de texto corrido. */}
            <View style={styles.scorePanel}>
              <Text style={[styles.scoreValue, { color: theme.colors.accent }]}>
                {snapshot.metrics.score}
              </Text>
              <Text style={[styles.scoreLabel, { color: theme.colors.textMuted }]}>
                {snapshot.metrics.score === 1 ? 'punto' : 'puntos'}
                {(snapshot.metrics.level ?? 1) > 1 ? ` · nivel ${snapshot.metrics.level}` : ''}
              </Text>
            </View>
            <View style={{ gap: 10 }}>
              {onLegacyGameEnd ? (
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]} onPress={handleSaveAndExit}>
                  <Coins size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>{autoCloseOnSave ? 'Guardar y salir' : 'Guardar'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: theme.colors.border, backgroundColor: overlayCardAlt },
                ]}
                onPress={handleRestart}
              >
                <RotateCcw size={20} color={theme.colors.text} />
                <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Jugar de nuevo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: theme.colors.border, backgroundColor: overlayCardAlt },
                ]}
                onPress={onClose}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Salir</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const getStyles = (isDark: any) => StyleSheet.create({
  container: { flex: 1 },
  hud: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  hudCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelBox: { flex: 1 },
  scoreBox: { alignItems: 'flex-end', minWidth: 70 },
  hudLabel: { fontSize: 10, fontWeight: '800', opacity: 0.9 },
  hudText: { fontSize: 14, fontWeight: '900' },
  progressTrack: { height: 6, borderRadius: Radius.sm, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%' },
  hudActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hudRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gameArea: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 24,
    backgroundColor: 'rgba(15,23,42,0.95)',
    ...glassShadow(isDark),
  },
  overlayTitle: { fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  overlaySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: -6,
    marginBottom: 18,
  },
  scorePanel: { alignItems: 'center', marginBottom: 18, gap: 2 },
  scoreValue: { fontSize: 48, fontWeight: '900', letterSpacing: -1 },
  scoreLabel: { fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  primaryBtnText: { color: isDark ? '#09090B' : '#FAFAFA', fontWeight: '900', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  secondaryBtnText: { fontWeight: '900', fontSize: 14 },
  levelupToast: {
    position: 'absolute',
    top: 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  levelupText: { color: isDark ? '#09090B' : '#FAFAFA', fontWeight: '900', letterSpacing: 1 },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginRight: 4,
  },
  timerText: {
    color: isDark ? '#09090B' : '#FAFAFA',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
