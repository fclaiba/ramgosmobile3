import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ImageBackground, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Target, RotateCcw, Crosshair, Trophy, Coins, Clock, Zap } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameLevel } from './useGameLevel';
import { GAME_LEVEL_THRESHOLDS, getArcadeParams } from './gameDifficultyConfig';
import type { GameActionSignal } from './GameWrapper';
import type { GameAdapterProps, GameEndSummary, GameEvent } from './gameContracts';
import { useTheme } from '../../contexts/ThemeContext';
import { GameThemeTokens } from './gameContracts';

const { width, height } = Dimensions.get('window');

interface FlyingObject {
    id: number;
    type: 'duck' | 'ammo' | 'clock';
    x: number;
    y: number;
    speedX: number;
    speedY: number; // For parabolic/vertical movement
    direction: 1 | -1;
    emoji: string;
}

interface DuckHuntProps {
    onGameEnd?: (score: number) => void;
    onClose?: () => void;
    // Wrapper integration (optional)
    actionSignal?: GameActionSignal;
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
    theme?: GameThemeTokens;
}

export const DuckHunt = (props: DuckHuntProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const {
        onGameEnd,
        onClose,
        actionSignal,
        uiMode = 'standalone',
        onEvent,
        onEnd,
        gameId = 'duck',
        family = 'arcade',
        theme,
    } = props;

    const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('IDLE');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [ammo, setAmmo] = useState(20);
    const [items, setItems] = useState<FlyingObject[]>([]);
    const [ducksShot, setDucksShot] = useState(0);

    const gameStateRef = useRef<'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('IDLE');
    const scoreRef = useRef(0);
    const ammoRef = useRef(20);
    const ducksShotRef = useRef(0);
    const pendingEndRef = useRef<GameEndSummary | null>(null);
    const lastActionNonce = useRef(0);
    const lastLevelReported = useRef(1);

    // Refs
    const gameLoopRef = useRef<any>(null);
    const timerRef = useRef<any>(null);

    // Sync Refs
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { ammoRef.current = ammo; }, [ammo]);
    useEffect(() => { ducksShotRef.current = ducksShot; }, [ducksShot]);

    const levelState = useGameLevel({
        mode: 'count',
        count: ducksShot,
        baseLevel: 1,
        thresholds: GAME_LEVEL_THRESHOLDS.duck,
    });
    const params = getArcadeParams('duck', levelState.level);

    // Load High Score
    useEffect(() => {
        AsyncStorage.getItem('duckHighScore').then(val => {
            if (val) setHighScore(parseInt(val));
        });
    }, []);

    // Save High Score
    useEffect(() => {
        if (score > highScore) {
            setHighScore(score);
            AsyncStorage.setItem('duckHighScore', score.toString());
        }
    }, [score]);


    const emitStatus = useCallback((status: 'start' | 'playing' | 'paused' | 'gameover' | 'levelup') => {
        onEvent?.({ type: 'status', status });
    }, [onEvent]);

    const emitMetrics = useCallback(() => {
        onEvent?.({
            type: 'metrics',
            patch: {
                score,
                lives: 1,
                level: levelState.level,
                progressToNext: levelState.progress,
                ammo,
                timeLeft,
            },
        });
    }, [ammo, levelState.level, levelState.progress, onEvent, score, timeLeft]);

    useEffect(() => {
        if (uiMode === 'wrapped') {
            emitStatus('start');
            emitMetrics();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uiMode]);

    useEffect(() => {
        if (uiMode !== 'wrapped') return;
        emitMetrics();
        if (levelState.level > lastLevelReported.current) {
            lastLevelReported.current = levelState.level;
            onEvent?.({ type: 'levelup', level: levelState.level });
        }
    }, [uiMode, emitMetrics, levelState.level, onEvent]);

    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (gameStateRef.current !== 'PLAYING') return prev;
                if (prev <= 1) {
                    endGame();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
    };

    const startGame = () => {
        setScore(0);
        scoreRef.current = 0;
        setTimeLeft(30);
        setAmmo(20);
        ammoRef.current = 20;
        setDucksShot(0);
        ducksShotRef.current = 0;
        setItems([]);
        setGameState('PLAYING');
        gameStateRef.current = 'PLAYING';

        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(updateLoop);

        startTimer();
        if (uiMode === 'wrapped') emitStatus('playing');
    };

    const endGame = () => {
        setGameState('GAMEOVER');
        gameStateRef.current = 'GAMEOVER';
        stopTimer();
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        if (uiMode === 'wrapped') {
            const final = {
                score: scoreRef.current,
                lives: 1,
                level: levelState.level,
                progressToNext: levelState.progress,
                ammo: ammoRef.current,
            };
            pendingEndRef.current = {
                gameId,
                family,
                score: scoreRef.current,
                finalMetrics: final,
                reason: 'time_or_ammo',
            };
        }
    };

    useEffect(() => {
        if (gameState !== 'GAMEOVER') return;
        if (uiMode !== 'wrapped') return;
        if (!pendingEndRef.current) return;
        const summary = pendingEndRef.current;
        pendingEndRef.current = null;
        onEvent?.({ type: 'gameover', final: summary.finalMetrics, reason: summary.reason });
        onEnd?.(summary);
    }, [gameState, onEnd, onEvent, uiMode]);

    const pauseGame = () => {
        if (gameStateRef.current !== 'PLAYING') return;
        setGameState('PAUSED');
        gameStateRef.current = 'PAUSED';
        stopTimer();
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        if (uiMode === 'wrapped') emitStatus('paused');
    };

    const resumeGame = () => {
        if (gameStateRef.current !== 'PAUSED') return;
        setGameState('PLAYING');
        gameStateRef.current = 'PLAYING';
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(updateLoop);
        startTimer();
        if (uiMode === 'wrapped') emitStatus('playing');
    };

    useEffect(() => {
        if (uiMode !== 'wrapped' || !actionSignal) return;
        if (actionSignal.nonce === lastActionNonce.current) return;
        lastActionNonce.current = actionSignal.nonce;
        if (actionSignal.type === 'start') startGame();
        if (actionSignal.type === 'restart') startGame();
        if (actionSignal.type === 'pause') pauseGame();
        if (actionSignal.type === 'resume') resumeGame();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actionSignal, uiMode]);

    const updateLoop = () => {
        if (gameStateRef.current !== 'PLAYING') return;

        const currentScore = scoreRef.current;
        const spawnMult = params?.gameId === 'duck' ? params.spawnMultiplier : 1;
        const speedMult = params?.gameId === 'duck' ? params.duckSpeedMultiplier : 1;
        const difficulty = 1 + (currentScore / 3000);

        // Spawn Logic
        // Base chance doubled
        if (Math.random() < 0.04 * difficulty * spawnMult) {
            setItems(prev => {
                if (prev.length >= 6) return prev;

                const rand = Math.random();
                let type: FlyingObject['type'] = 'duck';
                let emoji = '🐁';
                let speedX = (Math.random() * 1.5 + 1.5) * difficulty * speedMult;
                let speedY = 0;
                let x = 0;
                // Use explicit height or fallback
                let y = Math.random() * (height * 0.6); // Top 60%
                const direction = Math.random() > 0.5 ? 1 : -1;

                // Balance ammo vs time: more time => less ammo, less time => more ammo
                const timeRatio = Math.max(0, Math.min(1, timeLeft / 30));
                const ammoChance = 0.24 - (timeRatio * 0.14); // 10%..24%
                const clockChance = 0.06 + (timeRatio * 0.10); // 6%..16%

                if (rand < ammoChance) {
                    // Ammo (Thrown in air)
                    type = 'ammo';
                    emoji = '🧨'; // Cartridge
                    x = Math.random() * (width - 100) + 50;
                    y = height; // Start bottom
                    speedY = -15 - (Math.random() * 5); // Shoot up higher
                    speedX = (Math.random() - 0.5) * 4; // Drift
                } else if (rand < ammoChance + clockChance) {
                    // Clock (Fast)
                    type = 'clock';
                    emoji = '⏰';
                    speedX = (Math.random() * 3 + 4) * difficulty * speedMult; // Very fast
                }

                if (type !== 'ammo') {
                    x = direction === 1 ? -50 : width + 50;
                }

                return [...prev, {
                    id: Date.now() + Math.random(),
                    type,
                    emoji,
                    x,
                    y,
                    speedX: type === 'ammo' ? speedX : speedX * direction,
                    speedY,
                    direction
                }];
            });
        }

        // Move Items
        setItems(prev => {
            const nextItems: FlyingObject[] = [];
            for (const item of prev) {
                let newX = item.x + item.speedX;
                let newY = item.y + item.speedY;

                // Physics for Ammo (Gravity)
                if (item.type === 'ammo') {
                    item.speedY += 0.4; // Gravity
                }

                // Bounds Check
                const isOffScreen =
                    (item.direction === 1 && newX > width + 100) ||
                    (item.direction === -1 && newX < -100) ||
                    (item.type === 'ammo' && newY > height + 50);

                if (!isOffScreen) {
                    nextItems.push({ ...item, x: newX, y: newY, speedY: item.speedY });
                }
            }
            return nextItems;
        });

        gameLoopRef.current = requestAnimationFrame(updateLoop);
    };

    const handleShoot = () => {
        if (gameStateRef.current !== 'PLAYING') return;


        setAmmo(prev => {
            const newAmmo = prev - 1;
            if (newAmmo <= 0) {
                endGame();
                return 0;
            }
            return newAmmo;
        });
    };

    const handleItemPress = (id: number) => {
        if (gameStateRef.current !== 'PLAYING') return;

        setItems(prev => {
            const item = prev.find(i => i.id === id);
            if (!item) return prev;

            // Hit logic
            if (item.type === 'duck') {
                setScore(s => s + 50);
                setDucksShot(d => d + 1);
            } else if (item.type === 'ammo') {
                setAmmo(a => Math.min(30, a + 5)); // Refill
            } else if (item.type === 'clock') {
                setTimeLeft(t => t + 5);
            }

            // Remove item
            return prev.filter(i => i.id !== id);
        });

        // Decrement Ammo for shooting
        setAmmo(prev => {
            const val = prev - 1;
            if (val <= 0) { endGame(); return 0; }
            return val;
        });
    };

    return (
        <View style={[styles.container, uiMode === 'wrapped' && theme && { backgroundColor: theme.background }]}>
            {theme?.surfaceGradient && (
                <LinearGradient colors={theme.surfaceGradient} style={StyleSheet.absoluteFill} />
            )}

            {/* Game Area Wrapper for Misses */}
            <TouchableOpacity
                activeOpacity={1}
                style={styles.gameArea}
                onPress={handleShoot}
            >
                {items.map(item => (
                    <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.8}
                        onPress={(e) => {
                            e.stopPropagation(); // Prevent background miss logic
                            handleItemPress(item.id);
                        }}
                        style={[
                            styles.duck,
                            {
                                left: item.x,
                                top: item.y,
                                transform: [{ rotateY: item.type === 'duck' && item.direction === 1 ? '180deg' : '0deg' }]
                            }
                        ]}
                    >
                        <Text style={{ fontSize: item.type === 'duck' ? 40 : 32 }}>{item.emoji}</Text>
                    </TouchableOpacity>
                ))}
            </TouchableOpacity>
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: '#87CEEB',
    },
    hud: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 0 : 16,
        zIndex: 10
    },
    scoreContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: 8,
        borderRadius: 12
    },
    scoreText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1F2937'
    },
    highScoreText: {
        fontSize: 12,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
        marginLeft: 4
    },
    ammoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: 8,
        borderRadius: 12,
    },
    shell: {
        width: 12,
        height: 24,
        backgroundColor: '#EF4444',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#B91C1C',
    },
    timerContainer: {
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: 8,
        borderRadius: 12,
        minWidth: 50,
        alignItems: 'center'
    },
    timerText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1F2937'
    },
    centerContainer: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.5)',
        zIndex: 20
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: '#0D9488',
        marginBottom: 8,
        ...Platform.select({
            web: { textShadow: '1px 1px 2px rgba(0,0,0,0.1)' } as any,
            default: {
                textShadowColor: 'rgba(0,0,0,0.1)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
            },
        }),
    },
    subtitle: {
        fontSize: 16,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#4B5563',
        marginBottom: 24
    },
    gameOverText: {
        fontSize: 32,
        fontWeight: '900',
        color: '#EF4444',
        marginBottom: 8
    },
    finalScore: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1F2937',
        marginBottom: 24
    },
    startBtn: {
        flexDirection: 'row',
        backgroundColor: '#0D9488',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 30,
        alignItems: 'center',
        gap: 8,
        ...Platform.select({
            web: { boxShadow: '0 2px 4px rgba(0,0,0,0.2)' } as any,
            default: {
                shadowColor: isDark ? '#F9FAFB' : '#000',
                shadowOpacity: 0.2,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
            }
        }),
    },
    btnText: {
        color: isDark ? '#09090B' : '#FAFAFA',
        fontWeight: 'bold',
        fontSize: 16
    },
    gameArea: {
        flex: 1
    },
    duck: {
        position: 'absolute',
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center'
    }
});
