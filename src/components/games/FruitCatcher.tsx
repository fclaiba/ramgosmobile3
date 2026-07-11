import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Animated, useWindowDimensions, Platform, LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, RotateCcw, Heart, Trophy, Coins } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { GameActionSignal } from './GameWrapper';
import type { GameAdapterProps, GameEndSummary, GameEvent } from './gameContracts';
import { useGameLevel } from './useGameLevel';
import { GAME_LEVEL_THRESHOLDS } from './gameDifficultyConfig';
import { useTheme } from '../../contexts/ThemeContext';
import { GameThemeTokens } from './gameContracts';

const BASKET_WIDTH = 80;
const FRUIT_SIZE = 40;

interface FallingItem {
    id: number;
    x: number;
    y: number;
    type: 'fruit' | 'bomb' | 'magnet' | 'speed' | 'slow' | 'heart';
    emoji: string;
    speed: number;
}

const FRUITS = ['🍎', '🍌', '🍇', '🍊', '🍓', '🍑'];

interface FruitCatcherProps {
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

export const FruitCatcher = (props: FruitCatcherProps) => {
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
        gameId = 'fruit',
        family = 'arcade',
        theme,
    } = props;
    const { width, height } = useWindowDimensions();
    const widthRef = useRef(width);
    const heightRef = useRef(height);

    useEffect(() => {
        widthRef.current = width;
        heightRef.current = height;
    }, [width, height]);

    const [highScore, setHighScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [items, setItems] = useState<FallingItem[]>([]);
    const gameAreaHeightRef = useRef<number>(height);
    const gameAreaYRef = useRef<number>(0);
    const debugHitCountRef = useRef<number>(0);

    // Game State
    const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('IDLE');
    const [score, setScore] = useState(0);
    const scoreRef = useRef(0);
    const livesRef = useRef(3);
    const pendingEndRef = useRef<GameEndSummary | null>(null);

    // difficulty
    const difficultyRef = useRef(1);
    const gameStateRef = useRef<'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('IDLE');

    // Leveling (10 fruits caught -> score +10 each => 100 score per level)
    const levelState = useGameLevel({
        mode: 'score',
        score,
        baseLevel: 1,
        thresholds: GAME_LEVEL_THRESHOLDS.fruit,
    });

    const lastActionNonce = useRef<number>(0);
    const lastLevelReported = useRef<number>(levelState.level);

    const emitStatus = useCallback((status: 'start' | 'playing' | 'paused' | 'gameover' | 'levelup') => {
        onEvent?.({ type: 'status', status });
    }, [onEvent]);

    const emitMetrics = useCallback(() => {
        onEvent?.({
            type: 'metrics',
            patch: {
                score,
                lives,
                level: levelState.level,
                progressToNext: levelState.progress,
            },
        });
    }, [levelState.level, levelState.progress, lives, onEvent, score]);

    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { livesRef.current = lives; }, [lives]);

    useEffect(() => {
        if (uiMode === 'wrapped') {
            // Initialize snapshot for wrapper
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

    // Powerup Refs
    const magnetActive = useRef(false);
    const speedEffect = useRef(1); // 1 = normal, >1 fast, <1 slow
    const powerupTimer = useRef<NodeJS.Timeout | null>(null);

    // Basket Position
    const basketX = useRef(new Animated.Value(width / 2 - BASKET_WIDTH / 2)).current;
    const basketXVal = useRef(width / 2 - BASKET_WIDTH / 2);

    // Refs
    const gameLoopRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    // Load High Score
    useEffect(() => {
        AsyncStorage.getItem('fruitHighScore').then(val => {
            if (val) setHighScore(parseInt(val));
        });
    }, []);

    // Save High Score
    useEffect(() => {
        if (score > highScore) {
            setHighScore(score);
            AsyncStorage.setItem('fruitHighScore', score.toString());
        }
    }, [score]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            if (powerupTimer.current) clearTimeout(powerupTimer.current);
        };
    }, []);

    // Pan Responder for Dragging Basket
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gestureState) => {
                const currentWidth = widthRef.current;
                let newX = gestureState.moveX - BASKET_WIDTH / 2;
                // Clamp within bounds
                if (newX < 0) newX = 0;
                if (newX > currentWidth - BASKET_WIDTH) newX = currentWidth - BASKET_WIDTH;

                basketX.setValue(newX);
                basketXVal.current = newX;
            },
        })
    ).current;

    const startGame = () => {
        setScore(0);
        scoreRef.current = 0;
        setLives(3);
        livesRef.current = 3;
        setItems([]);
        difficultyRef.current = 1;
        setGameState('PLAYING');
        gameStateRef.current = 'PLAYING';
        magnetActive.current = false;
        speedEffect.current = 1;

        const currentWidth = widthRef.current;
        basketX.setValue(currentWidth / 2 - BASKET_WIDTH / 2);
        basketXVal.current = currentWidth / 2 - BASKET_WIDTH / 2;

        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        lastTimeRef.current = performance.now();
        gameLoopRef.current = requestAnimationFrame(update);
        if (uiMode === 'wrapped') {
            emitStatus('playing');
        }
    };

    const endGame = () => {
        setGameState('GAMEOVER');
        gameStateRef.current = 'GAMEOVER';
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        if (uiMode === 'wrapped') {
            const finalScore = scoreRef.current;
            const finalLives = livesRef.current;
            const final = {
                score: finalScore,
                lives: finalLives,
                level: levelState.level,
                progressToNext: levelState.progress,
            };
            pendingEndRef.current = {
                gameId,
                family,
                score: finalScore,
                finalMetrics: final,
                reason: 'lives',
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
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        if (uiMode === 'wrapped') emitStatus('paused');
    };

    const resumeGame = () => {
        if (gameStateRef.current !== 'PAUSED') return;
        setGameState('PLAYING');
        gameStateRef.current = 'PLAYING';
        lastTimeRef.current = performance.now();
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(update);
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

    const activatePowerup = (type: 'magnet' | 'speed' | 'slow') => {
        if (powerupTimer.current) clearTimeout(powerupTimer.current);

        // Reset previous effects
        magnetActive.current = false;
        speedEffect.current = 1;

        if (type === 'magnet') {
            magnetActive.current = true;
        } else if (type === 'speed') {
            speedEffect.current = 1.5;
        } else if (type === 'slow') {
            speedEffect.current = 0.5;
        }

        // Lasts 5 seconds
        powerupTimer.current = setTimeout(() => {
            magnetActive.current = false;
            speedEffect.current = 1;
        }, 5000);
    };

    const update = (time: number) => {
        if (gameStateRef.current !== 'PLAYING') return;

        const deltaTime = time - lastTimeRef.current;
        if (deltaTime > 100) lastTimeRef.current = time;
        lastTimeRef.current = time;

        difficultyRef.current += 0.0005;

        // Spawn Items
        if (Math.random() < 0.03 * difficultyRef.current) {
            const rand = Math.random();
            let type: FallingItem['type'] = 'fruit';
            let emoji = FRUITS[Math.floor(Math.random() * FRUITS.length)];

            if (rand < 0.15) {
                type = 'bomb';
                emoji = '💣';
            } else if (rand < 0.25) {
                const pRand = Math.random();
                if (pRand < 0.33) { type = 'magnet'; emoji = '🧲'; }
                else if (pRand < 0.66) { type = 'speed'; emoji = '⚡'; }
                else { type = 'slow'; emoji = '❄️'; }
            } else if (rand < 0.30) {
                if (lives < 3 || Math.random() < 0.2) {
                    type = 'heart';
                    emoji = '❤️';
                }
            }

            setItems(prev => [...prev, {
                id: Date.now() + Math.random(),
                x: Math.random() * (widthRef.current - FRUIT_SIZE),
                y: -50,
                type,
                emoji,
                speed: (Math.random() * 3 + 3) * (difficultyRef.current * 0.8)
            }]);
        }

        setItems(prev => {
            const nextItems: FallingItem[] = [];
            const basketLeft = basketXVal.current;
            const basketRight = basketLeft + BASKET_WIDTH;
            // Basket Y is bottom based
            const currentHeight = gameAreaHeightRef.current || heightRef.current;
            // We need to know basket Y position relative to top.
            // basket is bottom: 20, height: 60.
            const basketTopY = currentHeight - 80;

            for (const item of prev) {
                const prevY = item.y;
                // Magnet Effect
                let moveX = item.x;
                if (item.type === 'fruit' && magnetActive.current) {
                    const basketCenter = basketLeft + BASKET_WIDTH / 2;
                    const itemCenter = item.x + FRUIT_SIZE / 2;
                    moveX += (basketCenter - itemCenter) * 0.05;
                }

                const moveY = item.y + (item.speed * speedEffect.current);
                const prevBottom = prevY + FRUIT_SIZE;
                const nextBottom = moveY + FRUIT_SIZE;

                let kept = true;

                // Collision
                const xOverlaps = moveX + FRUIT_SIZE > basketLeft && moveX < basketRight;
                // Top-entry-only: catch only when the item's bottom crosses basketTopY from above.
                const crossesTop = prevBottom <= basketTopY && nextBottom >= basketTopY;
                if (xOverlaps && crossesTop) {

                    if (item.type === 'bomb') {
                        setLives(l => {
                            const newLives = l - 1;
                            livesRef.current = newLives;
                            if (newLives <= 0) endGame();
                            return newLives;
                        });
                    } else if (item.type === 'heart') {
                        setLives(l => Math.min(3, l + 1));
                    } else if (['magnet', 'speed', 'slow'].includes(item.type)) {
                        activatePowerup(item.type as any);
                    } else {
                        setScore(s => s + 10);
                    }
                    kept = false;
                }
                else if (moveY > currentHeight) {
                    kept = false;
                }
                // Debug: report near-miss overlap when item passes basket height.
                if (
                    xOverlaps &&
                    !crossesTop &&
                    nextBottom >= basketTopY &&
                    debugHitCountRef.current < 5
                ) {
                    debugHitCountRef.current += 1;
                }

                if (kept) {
                    nextItems.push({ ...item, x: moveX, y: moveY });
                }
            }
            return nextItems;
        });

        if (gameStateRef.current === 'PLAYING') {
            gameLoopRef.current = requestAnimationFrame(update);
        }
    };

    return (
        <View style={[styles.container, uiMode === 'wrapped' && theme && { backgroundColor: theme.background }]}>


            {/* Game Area */}
            <View
                style={[styles.gameArea, uiMode === 'wrapped' && { backgroundColor: 'transparent' }]}
                onLayout={(event: LayoutChangeEvent) => {
                    const { height: layoutHeight, y } = event.nativeEvent.layout;
                    gameAreaHeightRef.current = layoutHeight;
                    gameAreaYRef.current = y;
                }}
                {...panResponder.panHandlers}
            >
                {theme?.surfaceGradient && (
                    <LinearGradient colors={theme.surfaceGradient} style={StyleSheet.absoluteFill} />
                )}

                {/* Falling Items */}
                {items.map(item => (
                    <View
                        key={item.id}
                        style={[
                            styles.item,
                            {
                                left: item.x,
                                top: item.y
                            }
                        ]}
                    >
                        <Text style={{ fontSize: 32 }}>{item.emoji}</Text>
                    </View>
                ))}

                {/* Basket */}
                <Animated.View
                    style={[
                        styles.basket,
                        { transform: [{ translateX: basketX }] }
                    ]}
                >
                    <Text style={{ fontSize: 50 }}>😸</Text>
                </Animated.View>


            </View>
        </View>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#1F2937' : '#fff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 0 : 16,
        backgroundColor: '#FFF1F2',
        borderBottomWidth: 1,
        borderBottomColor: '#FECDD3',
        zIndex: 10,
    },
    lives: {
        flexDirection: 'row',
        gap: 4,
    },
    scoreBox: {
        alignItems: 'flex-end',
    },
    scoreTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#BE185D',
    },
    scoreText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#9D174D',
    },
    gameArea: {
        flex: 1,
        width: '100%',
        backgroundColor: '#FECDD3',
        position: 'relative',
        overflow: 'hidden',
    },
    item: {
        position: 'absolute',
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    basket: {
        position: 'absolute',
        bottom: 20,
        width: BASKET_WIDTH,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    centerContainer: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(255,255,255,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 30,
    },
    playBtn: {
        backgroundColor: '#DB2777',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 32,
        alignItems: 'center',
        gap: 8,
        elevation: 5,
        shadowColor: '#DB2777',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    playText: {
        color: isDark ? '#1F2937' : '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    instructions: {
        marginTop: 20,
        padding: 10,
        borderRadius: 8,
        backgroundColor: '#FFF1F2',
    },
    instructionText: {
        color: '#BE185D',
        fontSize: 12,
    },
    gameOverText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: isDark ? '#1F2937' : '#fff',
        marginBottom: 8,
    },
    finalScore: {
        fontSize: 18,
        color: isDark ? '#1F2937' : '#fff',
        marginBottom: 20
    },
    startBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DB2777',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        gap: 8,
    },
    btnText: {
        color: isDark ? '#1F2937' : '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
