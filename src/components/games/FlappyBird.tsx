import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, RotateCcw, Coins } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameLevel } from './useGameLevel';
import { GAME_LEVEL_THRESHOLDS, getArcadeParams } from './gameDifficultyConfig';
import type { GameActionSignal } from './GameWrapper';
import type { GameAdapterProps, GameEndSummary, GameEvent } from './gameContracts';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── GAME CONSTANTS ──
const BIRD_SIZE = 34;
const PIPE_WIDTH = 60;
const GAP_HEIGHT = 160;
const GRAVITY = 0.5;
const FLAP_FORCE = -8;
const PIPE_SPEED = 3;
const PIPE_INTERVAL = 1800; // ms between pipes

interface Pipe {
    id: number;
    x: number;
    gapY: number; // center of the gap
    scored: boolean;
}

interface FlappyBirdProps {
    onGameEnd?: (score: number) => void;
    onClose?: () => void;
    actionSignal?: GameActionSignal;
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
    theme?: GameAdapterProps['theme'];
}

export const FlappyBird = (props: FlappyBirdProps) => {
    const {
        onGameEnd,
        onClose,
        actionSignal,
        uiMode = 'standalone',
        onEvent,
        onEnd,
        gameId = 'flappy',
        family = 'arcade',
        theme,
    } = props;

    const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'GAMEOVER'>('IDLE');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [tick, setTick] = useState(0);

    // Refs for game loop
    const birdY = useRef(SCREEN_HEIGHT * 0.4);
    const birdVel = useRef(0);
    const pipes = useRef<Pipe[]>([]);
    const scoreRef = useRef(0);
    const gameStateRef = useRef<'IDLE' | 'PLAYING' | 'GAMEOVER'>('IDLE');
    const gameLoopRef = useRef<number | null>(null);
    const pipeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pipeIdCounter = useRef(0);
    const gameAreaHeight = useRef(SCREEN_HEIGHT * 0.75);

    // Level system
    const { level } = useGameLevel({
        mode: 'score',
        score,
        thresholds: GAME_LEVEL_THRESHOLDS['flappy'],
    });

    // Sync refs
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    // Load high score
    useEffect(() => {
        AsyncStorage.getItem('flappy_highscore').then(v => {
            if (v) setHighScore(parseInt(v));
        });
    }, []);

    // Wrapper action signal
    useEffect(() => {
        if (!actionSignal) return;
        if (actionSignal.type === 'start' || actionSignal.type === 'restart') startGame();
        if (actionSignal.type === 'pause' && gameStateRef.current === 'PLAYING') {
            // No pause for flappy — just ignore
        }
    }, [actionSignal]);

    const emitEvent = useCallback((event: GameEvent) => {
        if (onEvent) onEvent(event);
    }, [onEvent]);

    const startGame = useCallback(() => {
        birdY.current = gameAreaHeight.current * 0.4;
        birdVel.current = 0;
        pipes.current = [];
        pipeIdCounter.current = 0;
        scoreRef.current = 0;
        setScore(0);
        setGameState('PLAYING');
        gameStateRef.current = 'PLAYING';

        emitEvent({ type: 'status', status: 'playing' });

        // Start spawning pipes
        if (pipeTimerRef.current) clearInterval(pipeTimerRef.current);
        
        const spawnPipe = () => {
            if (gameStateRef.current !== 'PLAYING') return;
            const areaH = gameAreaHeight.current;
            const minGapY = GAP_HEIGHT / 2 + 60;
            const maxGapY = areaH - GAP_HEIGHT / 2 - 60;
            const gapY = minGapY + Math.random() * (maxGapY - minGapY);
            pipes.current.push({
                id: pipeIdCounter.current++,
                x: SCREEN_WIDTH + PIPE_WIDTH,
                gapY,
                scored: false,
            });
        };

        spawnPipe(); // Primer tubo aparece instantáneamente
        pipeTimerRef.current = setInterval(spawnPipe, PIPE_INTERVAL);

        // Start game loop
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        const loop = () => {
            if (gameStateRef.current !== 'PLAYING') return;

            // Bird physics
            birdVel.current += GRAVITY;
            birdY.current += birdVel.current;

            const areaH = gameAreaHeight.current;

            // Floor / ceiling check
            if (birdY.current > areaH - BIRD_SIZE) {
                endGame();
                return;
            }
            if (birdY.current < 0) {
                birdY.current = 0;
                birdVel.current = 0;
            }

            // Move pipes & check collisions
            const birdLeft = SCREEN_WIDTH * 0.25;
            const birdRight = birdLeft + BIRD_SIZE;
            const birdTop = birdY.current;
            const birdBottom = birdTop + BIRD_SIZE;

            for (const pipe of pipes.current) {
                pipe.x -= PIPE_SPEED;

                // Collision detection
                const pipeLeft = pipe.x;
                const pipeRight = pipe.x + PIPE_WIDTH;
                const gapTop = pipe.gapY - GAP_HEIGHT / 2;
                const gapBottom = pipe.gapY + GAP_HEIGHT / 2;

                if (birdRight > pipeLeft && birdLeft < pipeRight) {
                    if (birdTop < gapTop || birdBottom > gapBottom) {
                        endGame();
                        return;
                    }
                }

                // Score
                if (!pipe.scored && pipe.x + PIPE_WIDTH < birdLeft) {
                    pipe.scored = true;
                    scoreRef.current++;
                    setScore(scoreRef.current);
                    emitEvent({
                        type: 'metrics',
                        patch: {
                            score: scoreRef.current,
                            level,
                            progressToNext: 0,
                            lives: 1,
                        },
                    });
                }
            }

            // Remove off-screen pipes
            pipes.current = pipes.current.filter(p => p.x > -PIPE_WIDTH);

            setTick(t => t + 1);
            gameLoopRef.current = requestAnimationFrame(loop);
        };
        gameLoopRef.current = requestAnimationFrame(loop);
    }, [level, emitEvent]);

    const endGame = useCallback(() => {
        setGameState('GAMEOVER');
        gameStateRef.current = 'GAMEOVER';

        if (pipeTimerRef.current) {
            clearInterval(pipeTimerRef.current);
            pipeTimerRef.current = null;
        }
        if (gameLoopRef.current) {
            cancelAnimationFrame(gameLoopRef.current);
            gameLoopRef.current = null;
        }

        const finalScore = scoreRef.current;
        if (finalScore > highScore) {
            setHighScore(finalScore);
            AsyncStorage.setItem('flappy_highscore', String(finalScore));
        }

        emitEvent({ type: 'status', status: 'gameover' });
        if (onEnd) onEnd({ 
            gameId: 'flappy', 
            family: 'arcade', 
            score: finalScore, 
            finalMetrics: { score: finalScore, level: 1, progressToNext: 0, lives: 0 }, 
            reason: 'crash' 
        });
        if (onGameEnd) onGameEnd(finalScore);
    }, [highScore, emitEvent, onEnd, onGameEnd]);

    const flap = useCallback(() => {
        if (gameStateRef.current === 'IDLE') {
            startGame();
            birdVel.current = FLAP_FORCE;
            return;
        }
        if (gameStateRef.current === 'PLAYING') {
            birdVel.current = FLAP_FORCE;
        }
    }, [startGame]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            if (pipeTimerRef.current) clearInterval(pipeTimerRef.current);
        };
    }, []);

    const areaH = gameAreaHeight.current;
    const birdLeft = SCREEN_WIDTH * 0.25;
    const isWrapped = uiMode === 'wrapped';

    // ── RENDER ──
    return (
        <TouchableOpacity
            activeOpacity={1}
            onPress={flap}
            style={s.container}
        >
            <LinearGradient
                colors={['#1A1A2E', '#16213E', '#0F3460']}
                style={s.bg}
            >
                {/* Score HUD */}
                {gameState === 'PLAYING' && (
                    <View style={s.scoreHud}>
                        <Text style={s.scoreHudText}>{score}</Text>
                    </View>
                )}

                {/* Ground */}
                <View style={[s.ground, { top: areaH }]}>
                    <View style={s.grassStripe} />
                </View>

                {/* Pipes */}
                {pipes.current.map(pipe => {
                    const gapTop = pipe.gapY - GAP_HEIGHT / 2;
                    const gapBottom = pipe.gapY + GAP_HEIGHT / 2;
                    return (
                        <View key={pipe.id}>
                            {/* Top pipe */}
                            <View style={[s.pipe, {
                                left: pipe.x,
                                top: 0,
                                height: gapTop,
                                width: PIPE_WIDTH,
                            }]}>
                                <LinearGradient colors={['#2ECC71', '#27AE60']} style={s.pipeFill} />
                                <View style={[s.pipeEnd, { bottom: 0 }]} />
                            </View>
                            {/* Bottom pipe */}
                            <View style={[s.pipe, {
                                left: pipe.x,
                                top: gapBottom,
                                height: areaH - gapBottom,
                                width: PIPE_WIDTH,
                            }]}>
                                <LinearGradient colors={['#27AE60', '#2ECC71']} style={s.pipeFill} />
                                <View style={[s.pipeEnd, { top: 0 }]} />
                            </View>
                        </View>
                    );
                })}

                {/* Bird */}
                <View style={[s.bird, {
                    left: birdLeft,
                    top: birdY.current,
                    transform: [{ rotate: `${Math.min(birdVel.current * 3, 90)}deg` }],
                }]}>
                    <View style={s.birdBody}>
                        <View style={s.birdWing} />
                        <View style={s.birdEye} />
                        <View style={s.birdBeak} />
                    </View>
                </View>

                {/* IDLE SCREEN */}
                {gameState === 'IDLE' && (
                    <View style={s.overlay}>
                        <Text style={s.title}>🐦 Flappy Bird</Text>
                        <Text style={s.subtitle}>Toca para volar</Text>

                        <TouchableOpacity style={s.startBtn} onPress={flap} activeOpacity={0.8}>
                            <LinearGradient colors={['#F59E0B', '#D97706']} style={s.startBtnGrad}>
                                <Play size={24} color="#fff" fill="#fff" />
                                <Text style={s.startBtnText}>Jugar</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {highScore > 0 && (
                            <View style={s.highScoreBadge}>
                                <Coins size={16} color="#F59E0B" />
                                <Text style={s.highScoreText}>Récord: {highScore}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* GAME OVER SCREEN */}
                {gameState === 'GAMEOVER' && uiMode === 'standalone' && (
                    <View style={s.overlay}>
                        <Text style={s.gameOverTitle}>Game Over</Text>
                        <Text style={s.finalScore}>{score}</Text>
                        <Text style={s.finalLabel}>puntos</Text>

                        {score >= highScore && score > 0 && (
                            <View style={s.newRecordBadge}>
                                <Text style={s.newRecordText}>🏆 ¡Nuevo Récord!</Text>
                            </View>
                        )}

                        <TouchableOpacity style={s.startBtn} onPress={startGame} activeOpacity={0.8}>
                            <LinearGradient colors={['#8B5CF6', '#7C3AED']} style={s.startBtnGrad}>
                                <RotateCcw size={20} color="#fff" />
                                <Text style={s.startBtnText}>Reintentar</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </LinearGradient>
        </TouchableOpacity>
    );
};

const s = StyleSheet.create({
    container: {
        flex: 1,
    },
    bg: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
    },

    // Score HUD
    scoreHud: {
        position: 'absolute',
        top: 60,
        alignSelf: 'center',
        zIndex: 100,
    },
    scoreHudText: {
        fontSize: 64,
        fontWeight: '900',
        color: '#fff',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 6,
    },

    // Ground
    ground: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#8B6914',
    },
    grassStripe: {
        height: 6,
        backgroundColor: '#4CAF50',
    },

    // Pipes
    pipe: {
        position: 'absolute',
        overflow: 'hidden',
    },
    pipeFill: {
        flex: 1,
        borderWidth: 2,
        borderColor: '#1E8449',
    },
    pipeEnd: {
        position: 'absolute',
        left: -4,
        right: -4,
        height: 24,
        backgroundColor: '#27AE60',
        borderWidth: 2,
        borderColor: '#1E8449',
        borderRadius: 4,
    },

    // Bird
    bird: {
        position: 'absolute',
        width: BIRD_SIZE,
        height: BIRD_SIZE,
        zIndex: 10,
    },
    birdBody: {
        width: BIRD_SIZE,
        height: BIRD_SIZE,
        backgroundColor: '#FFD93D',
        borderRadius: BIRD_SIZE / 2,
        borderWidth: 2,
        borderColor: '#F0A500',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'visible',
    },
    birdWing: {
        position: 'absolute',
        left: -4,
        top: BIRD_SIZE * 0.35,
        width: 18,
        height: 12,
        backgroundColor: '#FF6B35',
        borderRadius: 6,
        transform: [{ rotate: '-15deg' }],
    },
    birdEye: {
        position: 'absolute',
        right: 6,
        top: 8,
        width: 8,
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.62)',
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#333',
    },
    birdBeak: {
        position: 'absolute',
        right: -6,
        top: BIRD_SIZE * 0.4,
        width: 12,
        height: 8,
        backgroundColor: '#FF6B35',
        borderRadius: 3,
    },

    // Overlays
    overlay: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 50,
    },
    title: {
        fontSize: 36,
        fontWeight: '900',
        color: '#fff',
        marginBottom: 8,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 32,
    },
    startBtn: {
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 16,
    },
    startBtnGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 36,
        paddingVertical: 16,
        borderRadius: 16,
    },
    startBtnText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '800',
    },
    highScoreBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 20,
        backgroundColor: 'rgba(245,158,11,0.15)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    highScoreText: {
        color: '#F59E0B',
        fontWeight: '700',
        fontSize: 14,
    },

    // Game Over
    gameOverTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: '#EF4444',
        marginBottom: 16,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    finalScore: {
        fontSize: 72,
        fontWeight: '900',
        color: '#fff',
        lineHeight: 80,
    },
    finalLabel: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 8,
    },
    newRecordBadge: {
        backgroundColor: 'rgba(245,158,11,0.2)',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 12,
        marginTop: 8,
        marginBottom: 8,
    },
    newRecordText: {
        color: '#F59E0B',
        fontWeight: '800',
        fontSize: 16,
    },
});
