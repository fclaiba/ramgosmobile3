import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, PanResponder, Animated, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, RotateCcw, ArrowDown, Coins } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameLevel } from './useGameLevel';
import { GAME_LEVEL_THRESHOLDS, getArcadeParams } from './gameDifficultyConfig';
import type { GameActionSignal } from './GameWrapper';
import type { GameAdapterProps, GameEndSummary, GameEvent } from './gameContracts';

const { width } = Dimensions.get('window');
// GAME_HEIGHT removed, we will use flex
const GAME_SPEED_START = 6;
const GROUND_HEIGHT = 80;

interface Obstacle {
    id: number;
    x: number;
    type: 'cactus' | 'bird';
    y: number; // 0 relative to ground, negative is UP
    width: number;
    height: number;
}

interface DinoGameProps {
    onGameEnd?: (score: number) => void;
    onClose?: () => void;
    // Wrapper integration (optional)
    actionSignal?: GameActionSignal;
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
    theme?: GameAdapterProps['theme'];
}

export const DinoGame = (props: DinoGameProps) => {
    const {
        onGameEnd,
        onClose,
        actionSignal,
        uiMode = 'standalone',
        onEvent,
        onEnd,
        gameId = 'dino',
        family = 'arcade',
        theme,
    } = props;

    const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('IDLE');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [isCrouching, setIsCrouching] = useState(false);

    // Render trigger for game loop
    const [tick, setTick] = useState(0);

    // Refs
    // Dino Physics
    const dinoY = useRef(new Animated.Value(0)).current;
    const dinoYVal = useRef(0);
    const dinoVel = useRef(0);
    const isJumping = useRef(false);

    // Game Logic
    const obstacles = useRef<Obstacle[]>([]);
    const gameLoopRef = useRef<number | null>(null);
    const scoreRef = useRef(0);
    const gameStateRef = useRef<'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('IDLE');
    const gameSpeed = useRef(GAME_SPEED_START);
    const crouchTimer = useRef<NodeJS.Timeout | null>(null);
    const isCrouchingRef = useRef(false);

    const GRAVITY = 0.8;
    const JUMP_FORCE = -14;

    // Sync Ref
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    const levelState = useGameLevel({
        mode: 'score',
        score,
        baseLevel: 1,
        thresholds: GAME_LEVEL_THRESHOLDS.dino,
    });
    const params = getArcadeParams('dino', levelState.level);
    const lastActionNonce = useRef(0);
    const lastLevelReported = useRef(levelState.level);

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
            }
        });
    }, [levelState.level, levelState.progress, onEvent, score]);

    useEffect(() => {
        if (uiMode !== 'wrapped') return;
        emitMetrics();
        if (levelState.level > lastLevelReported.current) {
            lastLevelReported.current = levelState.level;
            onEvent?.({ type: 'levelup', level: levelState.level });
        }
    }, [uiMode, emitMetrics, levelState.level, onEvent]);

    useEffect(() => {
        if (uiMode === 'wrapped') {
            emitStatus('start');
            emitMetrics();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uiMode]);

    // Load High Score
    useEffect(() => {
        AsyncStorage.getItem('dinoHighScore').then(val => {
            if (val) setHighScore(parseInt(val));
        });
    }, []);

    // Save High Score
    useEffect(() => {
        if (score > highScore) {
            setHighScore(score);
            AsyncStorage.setItem('dinoHighScore', score.toString());
        }
    }, [score]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            if (crouchTimer.current) clearTimeout(crouchTimer.current);
        };
    }, []);

    const startGame = () => {
        setScore(0);
        scoreRef.current = 0;
        setGameState('PLAYING');
        gameStateRef.current = 'PLAYING';
        obstacles.current = [];
        dinoY.setValue(0);
        dinoYVal.current = 0;
        dinoVel.current = 0;
        isJumping.current = false;
        isCrouchingRef.current = false;
        setIsCrouching(false);
        gameSpeed.current = GAME_SPEED_START;

        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(update);
        if (uiMode === 'wrapped') emitStatus('playing');
    };

    const endGame = () => {
        setGameState('GAMEOVER');
        gameStateRef.current = 'GAMEOVER';
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        if (uiMode === 'wrapped') {
            const final = {
                score: scoreRef.current,
                lives: 1,
                level: levelState.level,
                progressToNext: levelState.progress,
            };
            onEvent?.({ type: 'gameover', final, reason: 'collision' });
            onEnd?.({ gameId, family, score: scoreRef.current, finalMetrics: final, reason: 'collision' });
        }
    };

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

    const jump = () => {
        if (!isJumping.current && !isCrouchingRef.current) {
            dinoVel.current = JUMP_FORCE;
            isJumping.current = true;
            cancelCrouch();
        }
    };

    const crouch = () => {
        if (!isJumping.current && !isCrouchingRef.current) {
            isCrouchingRef.current = true;
            setIsCrouching(true);

            if (crouchTimer.current) clearTimeout(crouchTimer.current);
            crouchTimer.current = setTimeout(() => {
                cancelCrouch();
            }, 800); // 0.8s crouch
        }
    };

    const cancelCrouch = () => {
        isCrouchingRef.current = false;
        setIsCrouching(false);
    };

    // Pan Responder for Swipes
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderRelease: (_, gestureState) => {
                const { dy } = gestureState;
                if (dy < -30) {
                    jump(); // Swipe Up
                } else if (dy > 30) {
                    crouch(); // Swipe Down
                } else {
                    jump(); // Tap = Jump
                }
            }
        })
    ).current;

    const update = () => {
        if (gameStateRef.current !== 'PLAYING') return;

        // Difficulty
        const speedMult = params?.gameId === 'dino' ? params.speedMultiplier : 1;
        const spawnMult = params?.gameId === 'dino' ? params.obstacleSpawnMultiplier : 1;
        gameSpeed.current = GAME_SPEED_START * speedMult;

        // Physics
        dinoYVal.current += dinoVel.current;
        dinoVel.current += GRAVITY;

        // Ground Check
        if (dinoYVal.current >= 0) {
            dinoYVal.current = 0;
            dinoVel.current = 0;
            isJumping.current = false;
        }

        dinoY.setValue(dinoYVal.current);

        // Spawn Obstacles
        if (Math.random() < (0.015 + (scoreRef.current * 0.00001)) * spawnMult) {
            const lastObs = obstacles.current[obstacles.current.length - 1];
            if (!lastObs || lastObs.x < width - 200) {
                const type = Math.random() > 0.7 ? 'bird' : 'cactus';
                let y = 0;
                let w = 40;
                let h = 40;

                if (type === 'bird') {
                    // 50% High (Need Crouch), 50% Low (Need Jump)
                    const isHigh = Math.random() > 0.5;
                    y = isHigh ? -55 : -10;
                    w = 40;
                    h = 30;
                } else {
                    // Cactus
                    w = 30;
                    h = 50;
                }

                obstacles.current.push({
                    id: Date.now() + Math.random(),
                    x: width,
                    type,
                    y,
                    width: w,
                    height: h
                });
            }
        }

        // Move & Collision
        for (let i = obstacles.current.length - 1; i >= 0; i--) {
            const obs = obstacles.current[i];
            obs.x -= gameSpeed.current;

            // Remove if offscreen
            if (obs.x < -100) {
                obstacles.current.splice(i, 1);
                setScore(s => s + 10);
                continue;
            }

            // Collision Logic
            const dinoX = 50; // Visual X offset
            const dinoW = 40;
            const currentDinoH = isCrouchingRef.current ? 30 : 50;

            // Dino relative to Ground (0)
            const dinoTop = dinoYVal.current - currentDinoH;
            const dinoBottom = dinoYVal.current;

            // Obs relative to Ground (0)
            const obsBottom = obs.y;
            const obsTop = obs.y - obs.height;

            // Overlap Check
            if (obs.x < dinoX + dinoW && obs.x + obs.width > dinoX) {
                // Check Y overlap (Top is smaller value (negative))
                // Overlap if ranges intersect
                if (dinoBottom > obsTop && dinoTop < obsBottom) {
                    endGame();
                    return;
                }
            }
        }

        // Trigger Render
        setTick(t => t + 1);

        gameLoopRef.current = requestAnimationFrame(update);
    };

    return (
        <View style={styles.container} {...panResponder.panHandlers}>
            {theme?.gradients?.bg ? (
                <LinearGradient colors={theme.gradients.bg} style={StyleSheet.absoluteFill} />
            ) : (
                <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={StyleSheet.absoluteFill} />
            )}

            {/* Ground */}
            <View style={[styles.ground, theme ? { backgroundColor: theme.colors.accent, borderTopColor: theme.colors.border } : {}]} />

            {/* Clouds / Deco */}
            <View style={{ position: 'absolute', top: 50, left: 100, opacity: 0.5 }}><Text style={{ fontSize: 40 }}>☁️</Text></View>
            <View style={{ position: 'absolute', top: 80, left: 250, opacity: 0.5 }}><Text style={{ fontSize: 40 }}>☁️</Text></View>

            {/* Removed Standalone HUD and Menus */}

            {/* Dino */}
            <Animated.View style={[
                styles.dino,
                {
                    bottom: GROUND_HEIGHT,
                    transform: [{ translateY: dinoY }],
                    height: isCrouching ? 30 : 50,
                }
            ]}>
                <View style={{ transform: [{ rotateY: '180deg' }] }}>
                    <Text style={{ fontSize: 40 }}>{isCrouching ? '🙀' : '😺'}</Text>
                </View>
            </Animated.View>

            {/* Obstacles */}
            {obstacles.current.map(obs => (
                <View
                    key={obs.id}
                    style={[
                        styles.obstacle,
                        {
                            left: obs.x,
                            bottom: GROUND_HEIGHT - obs.y,
                            width: obs.width,
                            height: obs.height
                        }
                    ]}
                >
                    <Text style={{ fontSize: obs.type === 'bird' ? 30 : 40 }}>
                        {obs.type === 'bird' ? '🦅' : '🌵'}
                    </Text>
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: '#FEF3C7',
    },
    ground: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        height: GROUND_HEIGHT,
        backgroundColor: '#D97706',
        borderTopWidth: 4,
        borderTopColor: '#B45309'
    },
    hud: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        zIndex: 10,
        paddingTop: Platform.OS === 'ios' ? 0 : 10,
    },
    scoreBox: {
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: 8,
        borderRadius: 8
    },
    scoreText: {
        fontWeight: 'bold',
        color: '#92400E'
    },
    instructions: {
        backgroundColor: 'rgba(255,255,255,0.5)',
        padding: 8,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    instText: {
        fontSize: 12,
        color: '#92400E'
    },
    centerContainer: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(255,255,255,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20
    },
    title: {
        fontSize: 40,
        fontWeight: '900',
        color: '#B45309',
        marginBottom: 20
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
        backgroundColor: '#B45309',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 30,
        alignItems: 'center',
        gap: 8,
        shadowColor: '#000',
        elevation: 5
    },
    btnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    dino: {
        position: 'absolute',
        left: 50,
        width: 40,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5
    },
    obstacle: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    }
});
