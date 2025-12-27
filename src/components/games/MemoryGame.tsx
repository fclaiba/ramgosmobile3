import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Vibration, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, RotateCcw, Brain, Trophy, Eye, Heart, Coins, Lock } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withTiming, interpolate, Extrapolate } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];

interface CardItem {
    id: number;
    emoji: string;
    isFlipped: boolean;
    isMatched: boolean;
    isSpecial?: boolean; // Heart pair gives life
}

const Card = ({ item, onPress, forcedFlip }: { item: CardItem; onPress: () => void; forcedFlip: boolean }) => {
    const rotate = useSharedValue(0);

    const showFace = item.isFlipped || item.isMatched || forcedFlip;

    useEffect(() => {
        rotate.value = withSpring(showFace ? 180 : 0, { damping: 12 });
    }, [showFace]);

    const frontStyle = useAnimatedStyle(() => {
        const rotateValue = interpolate(rotate.value, [0, 180], [0, 180]);
        return {
            transform: [{ rotateY: `${rotateValue}deg` }],
            opacity: rotate.value < 90 ? 1 : 0,
            zIndex: rotate.value < 90 ? 1 : 0,
        };
    });

    const backStyle = useAnimatedStyle(() => {
        const rotateValue = interpolate(rotate.value, [0, 180], [180, 360]);
        return {
            transform: [{ rotateY: `${rotateValue}deg` }],
            opacity: rotate.value < 90 ? 0 : 1,
            zIndex: rotate.value < 90 ? 0 : 1,
        };
    });

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.9}
            disabled={item.isMatched || item.isFlipped || forcedFlip}
            style={{ width: '22%', margin: '1.5%', aspectRatio: 1 }}
        >
            <View style={styles.cardContainer}>
                {/* Back (Hidden) */}
                <Animated.View style={[styles.card, styles.cardBack, frontStyle]}>
                    <Brain size={24} color="#fff" />
                </Animated.View>
                {/* Front (Shown) */}
                <Animated.View style={[
                    styles.card,
                    styles.cardFront,
                    backStyle,
                    item.isMatched && { backgroundColor: '#BBF7D0', borderColor: '#22C55E' },
                    item.isSpecial && { borderColor: '#EF4444', borderWidth: 2 }
                ]}>
                    <Text style={styles.emoji}>{item.emoji}</Text>
                </Animated.View>
            </View>
        </TouchableOpacity>
    );
};

interface MemoryGameProps {
    onGameEnd?: (score: number) => void;
    onClose?: () => void;
}

export const MemoryGame = ({ onGameEnd, onClose }: MemoryGameProps) => {
    const [gameState, setGameState] = useState<'IDLE' | 'PREVIEW' | 'PLAYING' | 'LEVEL_COMPLETE' | 'GAMEOVER'>('IDLE');
    const [level, setLevel] = useState(1);
    const [lives, setLives] = useState(3);
    const [cards, setCards] = useState<CardItem[]>([]);
    const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
    const [score, setScore] = useState(0);
    const [peeking, setPeeking] = useState(false);

    // Logic refs
    const processingRef = useRef(false);

    const startLevel = (lvl: number) => {
        // Config
        const pairCount = 2 + lvl; // Lvl 1: 3 pairs, Lvl 2: 4 pairs...
        // Always add 1 special pair for Life
        const selectedEmojis = EMOJIS.slice(0, pairCount);

        let deck: CardItem[] = [];

        // Normal Pairs
        selectedEmojis.forEach((emoji, i) => {
            deck.push({ id: i * 2, emoji, isFlipped: true, isMatched: false }); // Start Flipped for Preview
            deck.push({ id: i * 2 + 1, emoji, isFlipped: true, isMatched: false });
        });

        // Special Pair
        const specialIdStart = deck.length;
        deck.push({ id: specialIdStart, emoji: '❤️', isFlipped: true, isMatched: false, isSpecial: true });
        deck.push({ id: specialIdStart + 1, emoji: '❤️', isFlipped: true, isMatched: false, isSpecial: true });

        // Shuffle
        deck = deck.sort(() => Math.random() - 0.5);

        setCards(deck);
        setFlippedIndices([]);
        setGameState('PREVIEW');
        setPeeking(false);
        processingRef.current = false;

        // Preview Timer
        setTimeout(() => {
            setCards(prev => prev.map(c => ({ ...c, isFlipped: false })));
            setGameState('PLAYING');
        }, 2000 + (lvl * 500)); // Longer preview for higher levels
    };

    const startGame = () => {
        setLevel(1);
        setScore(0);
        setLives(3);
        startLevel(1);
    };

    const nextLevel = () => {
        setLevel(l => {
            const next = l + 1;
            startLevel(next);
            return next;
        });
    };

    const handleCardPress = (index: number) => {
        if (gameState !== 'PLAYING' || peeking || processingRef.current) return;
        if (cards[index].isFlipped || cards[index].isMatched) return;

        // Flip
        const newCards = [...cards];
        newCards[index].isFlipped = true;
        setCards(newCards);

        const newFlipped = [...flippedIndices, index];
        setFlippedIndices(newFlipped);
        Vibration.vibrate(5);

        if (newFlipped.length === 2) {
            processingRef.current = true;
            const idx1 = newFlipped[0];
            const idx2 = newFlipped[1];

            if (newCards[idx1].emoji === newCards[idx2].emoji) {
                // Match
                setTimeout(() => {
                    setCards(prev => {
                        const copy = [...prev];
                        copy[idx1].isMatched = true;
                        copy[idx2].isMatched = true;
                        // Special Check
                        if (copy[idx1].isSpecial) {
                            setLives(l => Math.min(5, l + 1));
                            Vibration.vibrate(200);
                        }
                        return copy;
                    });
                    setFlippedIndices([]);
                    setScore(s => s + (10 * level));

                    // Check completion
                    setCards(current => {
                        const allMatched = current.every(c => c.isMatched);
                        if (allMatched) {
                            setTimeout(() => setGameState('LEVEL_COMPLETE'), 500);
                        }
                        return current;
                    });

                    processingRef.current = false;
                }, 500);
            } else {
                // Mismatch
                setTimeout(() => {
                    setCards(prev => {
                        const copy = [...prev];
                        copy[idx1].isFlipped = false;
                        copy[idx2].isFlipped = false;
                        return copy;
                    });
                    setFlippedIndices([]);
                    processingRef.current = false;
                    // Optional: Lose life on mismatch? User didn't specify.
                }, 1000);
            }
        }
    };

    const handlePeek = () => {
        if (lives <= 0 || gameState !== 'PLAYING' || peeking || processingRef.current) return;

        setLives(l => l - 1);
        setPeeking(true);
        Vibration.vibrate(100);

        setTimeout(() => {
            setPeeking(false);
        }, 1500); // 1.5s peek
    };

    const renderLevelComplete = () => (
        <View style={styles.centerContainer}>
            <Trophy size={64} color="#F59E0B" />
            <Text style={styles.winTitle}>LEVEL {level} COMPLETE!</Text>
            <View style={{ gap: 10, marginTop: 20 }}>
                <TouchableOpacity style={styles.startBtn} onPress={nextLevel}>
                    <Play size={24} color="#fff" />
                    <Text style={styles.btnText}>NEXT LEVEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.startBtn, { backgroundColor: '#EAB308' }]} onPress={() => {
                    if (onGameEnd) onGameEnd(score);
                    if (onClose) onClose();
                }}>
                    <Coins size={24} color="#fff" />
                    <Text style={styles.btnText}>SAVE & EXIT</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderGameOver = () => (
        <View style={styles.centerContainer}>
            <Text style={styles.gameOverText}>GAME OVER</Text>
            <Text style={styles.finalScore}>Final Score: {score}</Text>
            <View style={{ gap: 10 }}>
                <TouchableOpacity style={[styles.startBtn, { backgroundColor: '#EAB308' }]} onPress={() => {
                    if (onGameEnd) onGameEnd(score);
                    if (onClose) onClose();
                }}>
                    <Coins size={24} color="#fff" />
                    <Text style={styles.btnText}>GUARDAR {Math.floor(score / 5)} MONEDAS</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.startBtn} onPress={startGame}>
                    <RotateCcw size={24} color="#fff" />
                    <Text style={styles.btnText}>PLAY AGAIN</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#A78BFA', '#DDD6FE']} style={StyleSheet.absoluteFill} />

            <View style={styles.header}>
                <View style={styles.statBox}>
                    <Text style={styles.statLabel}>LEVEL</Text>
                    <Text style={styles.statValue}>{level}</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statLabel}>LIVES</Text>
                    <View style={{ flexDirection: 'row' }}>
                        {[...Array(3)].map((_, i) => (
                            <Heart key={i} size={16}
                                color={i < lives ? "#EF4444" : "#9CA3AF"}
                                fill={i < lives ? "#EF4444" : "none"}
                            />
                        ))}
                        {lives > 3 && <Text style={{ marginLeft: 4, fontWeight: 'bold', color: '#EF4444' }}>+{lives - 3}</Text>}
                    </View>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statLabel}>SCORE</Text>
                    <Text style={styles.statValue}>{score}</Text>
                </View>
            </View>

            {gameState === 'IDLE' && (
                <View style={styles.centerContainer}>
                    <Brain size={64} color="#7C3AED" />
                    <Text style={styles.title}>Memory</Text>
                    <TouchableOpacity style={styles.startBtn} onPress={startGame}>
                        <Play size={24} color="#fff" />
                        <Text style={styles.btnText}>START GAME</Text>
                    </TouchableOpacity>
                </View>
            )}

            {gameState === 'GAMEOVER' && renderGameOver()}
            {gameState === 'LEVEL_COMPLETE' && renderLevelComplete()}

            <View style={styles.gridContainer}>
                <View style={styles.grid}>
                    {cards.map((item, index) => (
                        <Card
                            key={item.id}
                            item={item}
                            forcedFlip={peeking}
                            onPress={() => handleCardPress(index)}
                        />
                    ))}
                </View>
            </View>

            {/* Peek Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.peekBtn, (lives <= 0 || gameState !== 'PLAYING') && styles.disabledBtn]}
                    onPress={handlePeek}
                    disabled={lives <= 0 || gameState !== 'PLAYING'}
                >
                    <Eye size={24} color="#fff" />
                    <Text style={styles.btnText}>PEEK (-1 Life)</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        minHeight: 500,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
        marginBottom: 20
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.8)',
        zIndex: 10
    },
    statBox: {
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        minWidth: 60
    },
    statLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#6B7280'
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#7C3AED'
    },
    gridContainer: {
        flex: 1,
        justifyContent: 'center',
        padding: 8
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center'
    },
    cardContainer: {
        width: '100%',
        height: '100%',
    },
    card: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        backfaceVisibility: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 3,
    },
    cardBack: {
        backgroundColor: '#8B5CF6',
        borderWidth: 2,
        borderColor: '#7C3AED'
    },
    cardFront: {
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#E5E7EB'
    },
    emoji: {
        fontSize: 28
    },
    centerContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.9)',
        zIndex: 20
    },
    title: {
        fontSize: 40,
        fontWeight: '900',
        color: '#7C3AED',
        marginBottom: 20
    },
    startBtn: {
        flexDirection: 'row',
        backgroundColor: '#7C3AED',
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
    gameOverText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#EF4444',
        marginBottom: 10
    },
    winTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#F59E0B',
        marginBottom: 10
    },
    finalScore: {
        fontSize: 20,
        color: '#4B5563',
        marginBottom: 20
    },
    footer: {
        padding: 16,
        alignItems: 'center'
    },
    peekBtn: {
        flexDirection: 'row',
        backgroundColor: '#F59E0B',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        alignItems: 'center',
        gap: 8
    },
    disabledBtn: {
        opacity: 0.5,
        backgroundColor: '#9CA3AF'
    }
});


