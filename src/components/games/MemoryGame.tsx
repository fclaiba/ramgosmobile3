import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, RotateCcw, Brain, Trophy, Eye, Heart, Coins, Lock } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withTiming, interpolate, Extrapolate } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { GameActionSignal } from './GameWrapper';
import type { GameAdapterProps, GameEndSummary, GameEvent, GameThemeTokens } from './gameContracts';
import { getArcadeParams } from './gameDifficultyConfig';
import { useTheme } from '../../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../../theme/tokens';


const EMOJIS = ['🐟', '🐁', '🧶', '🥛', '🐾', '📦', '🧸', '🔔', '🍗', '🦋'];
const getRandomLifeInterval = () => (Math.random() < 0.5 ? 2 : 3);

interface CardItem {
    id: number;
    emoji: string;
    isFlipped: boolean;
    isMatched: boolean;
    isSpecial?: boolean; // Heart pair gives life
}

const Card = ({ item, onPress, forcedFlip }: { item: CardItem; onPress: () => void; forcedFlip: boolean }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
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
    // Wrapper integration (optional)
    actionSignal?: GameActionSignal;
    uiMode?: 'standalone' | 'wrapped';
    onEvent?: (event: GameEvent) => void;
    onEnd?: (summary: GameEndSummary) => void;
    gameId?: GameAdapterProps['gameId'];
    family?: GameAdapterProps['family'];
    theme?: GameThemeTokens;
}

export const MemoryGame = (props: MemoryGameProps) => {
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
        gameId = 'memory',
        family = 'arcade',
        theme,
    } = props;

    const [gameState, setGameState] = useState<'IDLE' | 'PREVIEW' | 'PLAYING' | 'PAUSED' | 'LEVEL_COMPLETE' | 'GAMEOVER'>('IDLE');
    const [level, setLevel] = useState(1);
    const [lives, setLives] = useState(5);
    const [cards, setCards] = useState<CardItem[]>([]);
    const flippedIndicesRef = useRef<number[]>([]);
    const [score, setScore] = useState(0);
    const [peeking, setPeeking] = useState(false);

    // Logic refs
    const processingRef = useRef(false);
    const previewTimerRef = useRef<any>(null);
    const matchTimerRef = useRef<any>(null);
    const lastActionNonce = useRef(0);
    const lastLevelReported = useRef(1);
    const nextLifeLevelRef = useRef<number>(1 + getRandomLifeInterval());

    const progressToNext = useMemo(() => {
        const total = cards.length || 1;
        const matched = cards.filter(c => c.isMatched).length;
        return Math.max(0, Math.min(1, matched / total));
    }, [cards]);

    const emitStatus = useCallback((status: 'start' | 'playing' | 'paused' | 'gameover' | 'levelup') => {
        onEvent?.({ type: 'status', status });
    }, [onEvent]);

    const emitMetrics = useCallback(() => {
        onEvent?.({
            type: 'metrics',
            patch: {
                score,
                lives,
                level,
                progressToNext,
            },
        });
    }, [level, lives, onEvent, progressToNext, score]);

    useEffect(() => {
        if (uiMode === 'wrapped') {
            emitStatus('start');
            emitMetrics();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uiMode]);

    useEffect(() => {
        return () => {
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (uiMode !== 'wrapped' || !actionSignal) return;
        if (actionSignal.nonce === lastActionNonce.current) return;
        lastActionNonce.current = actionSignal.nonce;
        if (actionSignal.type === 'start') startGame();
        if (actionSignal.type === 'restart') startGame();
        if (actionSignal.type === 'pause') {
            setGameState('PAUSED');
            emitStatus('paused');
        }
        if (actionSignal.type === 'resume') {
            // Best-effort resume: if we were paused, go back to playing.
            setGameState((s) => (s === 'PAUSED' ? 'PLAYING' : s));
            emitStatus('playing');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actionSignal, uiMode]);

    useEffect(() => {
        if (uiMode !== 'wrapped') return;
        emitMetrics();
        if (level > lastLevelReported.current) {
            lastLevelReported.current = level;
            onEvent?.({ type: 'levelup', level });
        }
    }, [emitMetrics, level, onEvent, uiMode]);

    const startLevel = (lvl: number) => {
        // La dificultad sale de `gameDifficultyConfig`, igual que en los otros
        // cuatro juegos, en vez de constantes propias. El tablero crece con el
        // nivel y el preview se ACORTA: antes se alargaba (`2000 + lvl*500`),
        // así que el juego se volvía más fácil a medida que avanzabas.
        const params = getArcadeParams('memory', lvl);
        const gridPairs = params && params.gameId === 'memory'
            ? Math.floor((params.grid.cols * params.grid.rows) / 2)
            : 2 + lvl;
        const pairCount = Math.max(3, Math.min(EMOJIS.length, gridPairs));
        const previewMs = params && params.gameId === 'memory' ? params.previewMs : 2000;
        const selectedEmojis = EMOJIS.slice(0, pairCount);

        let deck: CardItem[] = [];

        // Normal Pairs
        selectedEmojis.forEach((emoji, i) => {
            deck.push({ id: i * 2, emoji, isFlipped: true, isMatched: false }); // Start Flipped for Preview
            deck.push({ id: i * 2 + 1, emoji, isFlipped: true, isMatched: false });
        });

        // Special Pair (Life) - only every 2 or 3 levels (randomly)
        const shouldAddLifePair = lvl === nextLifeLevelRef.current;
        if (shouldAddLifePair) {
            const specialIdStart = deck.length;
            deck.push({ id: specialIdStart, emoji: '❤️', isFlipped: true, isMatched: false, isSpecial: true });
            deck.push({ id: specialIdStart + 1, emoji: '❤️', isFlipped: true, isMatched: false, isSpecial: true });
            nextLifeLevelRef.current = lvl + getRandomLifeInterval();
        }

        // Shuffle
        deck = deck.sort(() => Math.random() - 0.5);

        setCards(deck);
        flippedIndicesRef.current = [];
        setGameState('PREVIEW');
        setPeeking(false);
        processingRef.current = false;

        // Clear any running match/mismatch timers
        if (matchTimerRef.current) clearTimeout(matchTimerRef.current);

        // Preview Timer
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(() => {
            setCards(prev => prev.map(c => ({ ...c, isFlipped: false })));
            setGameState('PLAYING');
            if (uiMode === 'wrapped') emitStatus('playing');
        }, previewMs);
    };

    const startGame = () => {
        setLevel(1);
        setScore(0);
        setLives(5);
        nextLifeLevelRef.current = 1 + getRandomLifeInterval();
        startLevel(1);
        if (uiMode === 'wrapped') emitStatus('playing');
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
        if (flippedIndicesRef.current.includes(index)) return;
        if (cards[index].isFlipped || cards[index].isMatched) return;

        flippedIndicesRef.current.push(index);

        if (flippedIndicesRef.current.length === 2) {
            processingRef.current = true;
        }

        setCards(prevCards => {
            if (prevCards[index].isFlipped || prevCards[index].isMatched) return prevCards;
            const newCards = [...prevCards];
            newCards[index] = { ...newCards[index], isFlipped: true };
            return newCards;
        });

        if (flippedIndicesRef.current.length === 2) {
            const idx1 = flippedIndicesRef.current[0];
            const idx2 = flippedIndicesRef.current[1];

            if (cards[idx1].emoji === cards[idx2].emoji) {
                // Match
                matchTimerRef.current = setTimeout(() => {
                    setCards(prev => {
                        const copy = [...prev];
                        copy[idx1] = { ...copy[idx1], isMatched: true };
                        copy[idx2] = { ...copy[idx2], isMatched: true };
                        if (copy[idx1]?.isSpecial) {
                            setLives(l => Math.min(5, l + 1));
                        }
                        const allMatched = copy.every(c => c.isMatched);
                        if (allMatched) {
                            setGameState('LEVEL_COMPLETE');
                            if (uiMode === 'wrapped') {
                                setTimeout(() => {
                                    setLevel(l => {
                                        const next = l + 1;
                                        startLevel(next);
                                        return next;
                                    });
                                }, 600);
                            } else {
                                setTimeout(() => setGameState('LEVEL_COMPLETE'), 500);
                            }
                        }
                        return copy;
                    });
                    setScore(s => s + (10 * level));
                    flippedIndicesRef.current = [];
                    processingRef.current = false;
                }, 500);
            } else {
                // Mismatch
                matchTimerRef.current = setTimeout(() => {
                    setCards(prev => {
                        const copy = [...prev];
                        if (copy[idx1]) copy[idx1] = { ...copy[idx1], isFlipped: false };
                        if (copy[idx2]) copy[idx2] = { ...copy[idx2], isFlipped: false };
                        return copy;
                    });
                    setLives(l => {
                        const nextLives = l - 1;
                        if (nextLives <= 0) {
                            setGameState('GAMEOVER');
                            if (uiMode === 'wrapped') {
                                onEvent?.({ type: 'gameover', final: { score, level, lives: 0, progressToNext } });
                                onEnd?.({ gameId, family, score, finalMetrics: { score, level, lives: 0, progressToNext } });
                            }
                        }
                        return nextLives;
                    });
                    flippedIndicesRef.current = [];
                    processingRef.current = false;
                }, 1000);
            }
        }
    };

    const handlePeek = () => {
        if (lives <= 0 || gameState !== 'PLAYING' || peeking || processingRef.current) return;

        setLives(l => {
            const nextLives = l - 1;
            if (nextLives <= 0) {
                setGameState('GAMEOVER');
                if (uiMode === 'wrapped') {
                    onEvent?.({ type: 'gameover', final: { score, level, lives: 0, progressToNext } });
                    onEnd?.({ gameId, family, score, finalMetrics: { score, level, lives: 0, progressToNext } });
                }
            }
            return nextLives;
        });
        
        setPeeking(true);

        setTimeout(() => {
            setPeeking(false);
        }, 1500); // 1.5s peek
    };

    return (
        <View style={[styles.container, uiMode === 'wrapped' && theme && { backgroundColor: theme.background }]}>
            {theme?.surfaceGradient && (
                <LinearGradient colors={theme.surfaceGradient} style={StyleSheet.absoluteFill} />
            )}

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

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: colors(isDark).glass,
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
        backgroundColor: colors(isDark).glass,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: Radius.sm,
        minWidth: 60
    },
    statLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280'
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2196F3'
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
        borderRadius: Radius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        backfaceVisibility: 'hidden',
        ...glassShadow(isDark),
    },
    cardBack: {
        backgroundColor: '#4FC3F7',
        borderWidth: 2,
        borderColor: '#2196F3'
    },
    cardFront: {
        backgroundColor: colors(isDark).glass,
        borderWidth: 2,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)'
    },
    emoji: {
        fontSize: 28
    },
    centerContainer: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.9)',
        zIndex: 20
    },
    title: {
        fontSize: 40,
        fontWeight: '900',
        color: '#2196F3',
        marginBottom: 20
    },
    startBtn: {
        flexDirection: 'row',
        backgroundColor: '#2196F3',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: Radius['2xl'],
        alignItems: 'center',
        gap: 8,
        ...glassShadow(isDark),},
    btnText: {
        color: isDark ? '#09090B' : '#FAFAFA',
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
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#4B5563',
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
        borderRadius: Radius.xl,
        alignItems: 'center',
        gap: 8
    },
    disabledBtn: {
        opacity: 0.5,
        backgroundColor: isDark ? '#6B7280' : '#9CA3AF'
    }
});
