import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, PanResponder, Animated, Vibration, Image, TouchableWithoutFeedback } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, RotateCcw, AlertOctagon, Trophy, Coins, ArrowRight, ArrowDown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const GAME_HEIGHT = 450;
const DINO_SIZE = 48;
const DINO_WIDTH = 48;
const DINO_HEIGHT = 48;
const OBSTACLE_SIZE = 40;
const GRAVITY = 0.8;
const JUMP_FORCE = -14;
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
}

export const DinoGame = ({ onGameEnd, onClose }: DinoGameProps) => {
    const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'GAMEOVER'>('IDLE');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [isCrouching, setIsCrouching] = useState(false);

    // Render trigger for game loop
    const [tick, setTick] = useState(0);

    // Refs
    const dinoY = useRef(new Animated.Value(0)).current;
    const dinoYVal = useRef(0);
    const dinoVel = useRef(0);
    const isJumping = useRef(false);
    const obstacles = useRef<Obstacle[]>([]);
    const gameLoopRef = useRef<number | null>(null);
    const scoreRef = useRef(0);
    const gameSpeed = useRef(GAME_SPEED_START);
    const crouchTimer = useRef<NodeJS.Timeout | null>(null);
    const isCrouchingRef = useRef(false);

    // Sync Ref
    useEffect(() => { scoreRef.current = score; }, [score]);

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
    };

    const endGame = () => {
        setGameState('GAMEOVER');
        Vibration.vibrate(500);
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };

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
        if (gameState === 'GAMEOVER') return;

        // Difficulty
        gameSpeed.current = GAME_SPEED_START + (scoreRef.current / 500);

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
        if (Math.random() < 0.015 + (scoreRef.current * 0.00001)) {
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
            <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={StyleSheet.absoluteFill} />

            {/* Ground */}
            <View style={styles.ground} />

            {/* Clouds / Deco */}
            <View style={{ position: 'absolute', top: 50, left: 100, opacity: 0.5 }}><Text style={{ fontSize: 40 }}>☁️</Text></View>
            <View style={{ position: 'absolute', top: 80, left: 250, opacity: 0.5 }}><Text style={{ fontSize: 40 }}>☁️</Text></View>

            {/* HUD */}
            <View style={styles.hud}>
                <View style={styles.scoreBox}>
                    <Text style={styles.scoreText}>HI: {highScore}</Text>
                    <Text style={styles.scoreText}>SCORE: {score}</Text>
                </View>
                <View style={styles.instructions}>
                    <ArrowDown size={16} color="#B45309" />
                    <Text style={styles.instText}>Swipe Down to Crouch</Text>
                </View>
            </View>

            {gameState === 'IDLE' && (
                <View style={styles.centerContainer}>
                    <Text style={styles.title}>Dino Run</Text>
                    <TouchableOpacity style={styles.startBtn} onPress={startGame}>
                        <Play size={24} color="#fff" />
                        <Text style={styles.btnText}>START</Text>
                    </TouchableOpacity>
                </View>
            )}

            {gameState === 'GAMEOVER' && (
                <View style={styles.centerContainer}>
                    <Text style={styles.gameOverText}>GAME OVER</Text>
                    <Text style={styles.finalScore}>Score: {score}</Text>
                    <View style={{ gap: 10 }}>
                        <TouchableOpacity style={[styles.startBtn, { backgroundColor: '#EAB308' }]} onPress={() => {
                            if (onGameEnd) onGameEnd(score); // Save Coins
                            if (onClose) onClose();
                        }}>
                            <Coins size={24} color="#fff" />
                            <Text style={styles.btnText}>GUARDAR {Math.floor(score / 5)} MONEDAS</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
                            <RotateCcw size={24} color="#fff" />
                            <Text style={styles.btnText}>TRY AGAIN</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Dino */}
            <Animated.View style={[
                styles.dino,
                {
                    bottom: GROUND_HEIGHT,
                    transform: [{ translateY: dinoY }],
                    height: isCrouching ? 30 : 50,
                }
            ]}>
                <Text style={{ fontSize: 40 }}>{isCrouching ? '🦎' : '🦖'}</Text>
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
        width: '100%',
        height: GAME_HEIGHT,
        borderRadius: 16,
        overflow: 'hidden',
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
        zIndex: 10
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
        ...StyleSheet.absoluteFillObject,
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
