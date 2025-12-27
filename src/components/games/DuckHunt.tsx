import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ImageBackground, Vibration, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Target, RotateCcw, Crosshair, Trophy, Coins, Clock, Zap } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const GAME_HEIGHT = 400;

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
}

export const DuckHunt = ({ onGameEnd, onClose }: DuckHuntProps) => {
    const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'GAMEOVER'>('IDLE');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [ammo, setAmmo] = useState(5);
    const [items, setItems] = useState<FlyingObject[]>([]);

    const gameStateRef = useRef<'IDLE' | 'PLAYING' | 'GAMEOVER'>('IDLE');
    const scoreRef = useRef(0);
    const ammoRef = useRef(5);

    // Refs
    const gameLoopRef = useRef<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Sync Refs
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { ammoRef.current = ammo; }, [ammo]);

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


    const startGame = () => {
        setScore(0);
        scoreRef.current = 0;
        setTimeLeft(30);
        setAmmo(5);
        ammoRef.current = 5;
        setItems([]);
        setGameState('PLAYING');
        gameStateRef.current = 'PLAYING';

        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(updateLoop);

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

    const endGame = () => {
        setGameState('GAMEOVER');
        gameStateRef.current = 'GAMEOVER';
        Vibration.vibrate(500);
        if (timerRef.current) clearInterval(timerRef.current);
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };

    const updateLoop = () => {
        if (gameStateRef.current !== 'PLAYING') return;

        const currentScore = scoreRef.current;
        const difficulty = 1 + (currentScore / 1000);

        // Spawn Logic
        // Base chance doubled
        if (Math.random() < 0.04 * difficulty) {
            setItems(prev => {
                if (prev.length >= 6) return prev;

                const rand = Math.random();
                let type: FlyingObject['type'] = 'duck';
                let emoji = '🦆';
                let speedX = (Math.random() * 2 + 2) * difficulty;
                let speedY = 0;
                let x = 0;
                let y = Math.random() * (GAME_HEIGHT - 100);
                const direction = Math.random() > 0.5 ? 1 : -1;

                if (rand < 0.1) {
                    // Ammo (Thrown in air)
                    type = 'ammo';
                    emoji = '🧨'; // Cartridge
                    x = Math.random() * (width - 100) + 50;
                    y = GAME_HEIGHT; // Start bottom
                    speedY = -10 - (Math.random() * 5); // Shoot up
                    speedX = (Math.random() - 0.5) * 4; // Drift
                } else if (rand < 0.2) {
                    // Clock (Fast)
                    type = 'clock';
                    emoji = '⏰';
                    speedX = (Math.random() * 5 + 5) * difficulty; // Very fast
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
                    (item.type === 'ammo' && newY > GAME_HEIGHT + 50);

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

        // This fires on background tap
        Vibration.vibrate(20);

        setAmmo(prev => {
            const newAmmo = prev - 1;
            if (newAmmo <= 0) {
                // Check if we hit something? 
                // Wait, item press fires FIRST.
                // If item press handled it, this shouldn't matter?
                // Actually, if we tap background, we lose ammo.
                // If we tap item, we ALSO lose ammo (unless it's ammo refill).
                // So ammo decrement is universal, except refill?
            }
            if (newAmmo < 0) {
                // Game Over Trigger immediately?
                // State update is async.
                // We need to handle this.
                // Actually better to check in effect or sync logic.
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
            } else if (item.type === 'ammo') {
                Vibration.vibrate([0, 50, 50, 50]);
                setAmmo(a => Math.min(10, a + 3)); // Refill
                // No ammo cost for hitting ammo? 
                // Or we spent 1 to hit it, but gained 3. Net +2.
                // Since background press fires too? No, stop propagation.
            } else if (item.type === 'clock') {
                Vibration.vibrate(100);
                setTimeLeft(t => t + 5);
            }

            // Remove item
            return prev.filter(i => i.id !== id);
        });

        // Decrement Ammo for shooting (UNLESS it's the ammo box itself? Logic: You shoot the box to open it)
        // So yes, you spend 1 bullet to get 3.
        setAmmo(prev => {
            const val = prev - 1;
            if (val < 0) { endGame(); return 0; }
            return val;
        });
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#87CEEB', '#E0F7FA']} style={StyleSheet.absoluteFill} />

            <View style={styles.hud}>
                <View style={styles.scoreContainer}>
                    <Trophy size={20} color="#F59E0B" />
                    <Text style={styles.scoreText}>{score}</Text>
                    <Text style={styles.highScoreText}>Hi: {highScore}</Text>
                </View>
                <View style={styles.ammoContainer}>
                    {/* Ammo Shells */}
                    {[...Array(Math.max(0, ammo))].map((_, i) => (
                        <View key={i} style={styles.shell} />
                    ))}
                    {ammo === 0 && <Text style={{ color: 'red', fontWeight: 'bold' }}>EMPTY</Text>}
                </View>
                <View style={styles.timerContainer}>
                    <Text style={[styles.timerText, timeLeft < 10 && { color: 'red' }]}>{timeLeft}s</Text>
                </View>
            </View>

            {gameState === 'IDLE' && (
                <View style={styles.centerContainer}>
                    <Text style={styles.title}>Duck Hunt</Text>
                    <Text style={styles.subtitle}>Tap targets!</Text>
                    <TouchableOpacity style={styles.startBtn} onPress={startGame}>
                        <Crosshair size={24} color="#fff" />
                        <Text style={styles.btnText}>START HUNT</Text>
                    </TouchableOpacity>
                </View>
            )}

            {gameState === 'GAMEOVER' && (
                <View style={styles.centerContainer}>
                    <Text style={styles.gameOverText}>
                        {ammo <= 0 ? 'NO AMMO!' : 'TIME UP!'}
                    </Text>
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
                                transform: [{ scaleX: item.type === 'ammo' ? 1 : item.direction }]
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

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: GAME_HEIGHT,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#87CEEB',
        marginBottom: 20
    },
    hud: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
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
        color: '#6B7280',
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
        ...StyleSheet.absoluteFillObject,
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
        color: '#4B5563',
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
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
            }
        }),
    },
    btnText: {
        color: '#fff',
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
