import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, Image } from 'react-native';
import { Heart, Utensils, Zap, Sparkles, Moon, Play, Coins, ArrowRight, Trophy, Gamepad2, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import { usePoints } from '../../contexts/PointsContext';
import { useRewards } from '../../contexts/RewardsContext';
import { MobileHeader } from '../MobileHeader';

// Game Imports
import { FruitCatcher } from '../games/FruitCatcher';
import { DuckHunt } from '../games/DuckHunt';
import { MemoryGame } from '../games/MemoryGame';
import { DinoGame } from '../games/DinoGame';
import { RouletteGame } from '../games/RouletteGame';
import { SlotMachine } from '../games/SlotMachine';

const { width } = Dimensions.get('window');
const ARCADE_REWARD_GAMES = new Set<GameType>(['fruit', 'duck', 'memory', 'dino']);

// --- Types ---
interface PetStats {
    happiness: number;
    hunger: number;
    energy: number;
    level: number;
    exp: number;
    // coins: number; // REMOVED (Global)
}

type PetMood = 'happy' | 'normal' | 'sad' | 'sleeping' | 'playing' | 'eating';
type GameType = 'fruit' | 'duck' | 'memory' | 'dino' | 'roulette' | 'slots' | null;

const GAMES = [
    { id: 'fruit', name: 'Atrapar Frutas', icon: '🍎', gradient: ['#EF4444', '#F97316'] as const, description: 'Ayuda al gatito a atrapar frutas', type: 'skill' },
    { id: 'duck', name: 'Duck Hunt', icon: '🦆', gradient: ['#3B82F6', '#06B6D4'] as const, description: 'Caza patos voladores', type: 'skill' },
    { id: 'memory', name: 'Memoria Gatuna', icon: '🧠', gradient: ['#A855F7', '#EC4899'] as const, description: 'Encuentra las parejas', type: 'skill' },
    { id: 'dino', name: 'Dino Run', icon: '🦖', gradient: ['#22C55E', '#10B981'] as const, description: 'Salta obstáculos sin parar', type: 'skill' },
    { id: 'roulette', name: 'Ruleta', icon: '🎰', gradient: ['#EAB308', '#F97316'] as const, description: 'Gira y prueba tu suerte', type: 'casino' },
    { id: 'slots', name: 'Tragamonedas', icon: '🎲', gradient: ['#9333EA', '#DB2777'] as const, description: 'Consigue el Jackpot', type: 'casino' },
];

// --- Simple Toast Component ---
const Toast = ({ message, type, visible, onHide }: { message: string, type: 'success' | 'error', visible: boolean, onHide: () => void }) => {
    const opacity = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            opacity.value = withSequence(
                withTiming(1, { duration: 300 }),
                withTiming(1, { duration: 2000 }), // Wait
                withTiming(0, { duration: 300 }, (finished) => {
                    if (finished) runOnJS(onHide)();
                })
            );
        }
    }, [visible]);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: withSpring(visible ? 0 : -20) }]
    }));

    if (!visible && opacity.value === 0) return null;

    return (
        <Animated.View style={[styles.toast, type === 'error' ? styles.toastError : styles.toastSuccess, style]}>
            <Text style={styles.toastText}>{message}</Text>
        </Animated.View>
    );
};

interface MiMascotaViewProps {
    onNavigateToMascota?: () => void; // Kept for prop parity, likely processed by parent nav
    navigation?: any; // Start using navigation from props check
}

export function MiMascotaView({ navigation }: any) {
    const { convertCoinsToPoints } = usePoints();
    const { feedVirtualPet, registerArcadeReward, gameCoins, addGameCoins, spendGameCoins } = useRewards();

    // --- State ---
    const [stats, setStats] = useState<PetStats>({
        happiness: 80,
        hunger: 60,
        energy: 70,
        level: 1,
        exp: 0,
    });
    const [currentGame, setCurrentGame] = useState<GameType>(null);
    const [petMood, setPetMood] = useState<PetMood>('happy');
    const [isAnimating, setIsAnimating] = useState(false);
    const [catAnimation, setCatAnimation] = useState<string>('idle');

    // Toast State
    const [toast, setToast] = useState<{ visible: boolean, message: string, type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ visible: true, message, type });
    };

    // --- Effects ---
    // Load Stats
    useEffect(() => {
        AsyncStorage.getItem('petStats').then(saved => {
            if (saved) {
                const parsed = JSON.parse(saved);
                // Migrate from old state if needed (remove coins)
                const { coins, ...rest } = parsed;
                setStats(rest);
            }
        });
    }, []);

    // Save Stats
    useEffect(() => {
        AsyncStorage.setItem('petStats', JSON.stringify(stats));
    }, [stats]);

    // Stat Decay
    useEffect(() => {
        const interval = setInterval(() => {
            setStats(prev => ({
                ...prev,
                happiness: Math.max(0, prev.happiness - 0.5),
                hunger: Math.max(0, prev.hunger - 0.8),
                energy: Math.max(0, prev.energy - 0.3),
            }));
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Determine Mood
    useEffect(() => {
        if (stats.energy < 20) setPetMood('sleeping');
        else if (stats.happiness > 70 && stats.hunger > 50) setPetMood('happy');
        else if (stats.happiness < 30 || stats.hunger < 20) setPetMood('sad');
        else setPetMood('normal');
    }, [stats]);

    // --- Cat Animation ---
    const catScale = useSharedValue(1);
    const catRotate = useSharedValue(0);
    const catY = useSharedValue(0);

    const animateCat = (type: 'jump' | 'shake' | 'sleep' | 'idle') => {
        if (type === 'jump') {
            catY.value = withSequence(withTiming(-20, { duration: 300 }), withTiming(0, { duration: 300 }));
        } else if (type === 'shake') {
            catRotate.value = withSequence(
                withTiming(10, { duration: 100 }),
                withTiming(-10, { duration: 100 }),
                withTiming(10, { duration: 100 }),
                withTiming(0, { duration: 100 })
            );
        }
    };

    const catStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: catScale.value },
            { rotate: `${catRotate.value}deg` },
            { translateY: catY.value }
        ]
    }));

    const getCatEmoji = () => {
        if (catAnimation === 'eating') return '😋';
        if (catAnimation === 'playing') return '😸';
        if (catAnimation === 'sleeping') return '😴';

        switch (petMood) {
            case 'happy': return '😺';
            case 'sad': return '😿';
            case 'sleeping': return '😴';
            case 'playing': return '😸';
            case 'eating': return '😋';
            default: return '😺';
        }
    };

    // --- Actions ---
    const feedPet = () => {
        if (gameCoins < 5) {
            showToast('Necesitas 5 monedas', 'error');
            return;
        }

        const paid = spendGameCoins(5);
        if (!paid) return;

        setIsAnimating(true);
        setCatAnimation('eating');
        animateCat('jump');
        setStats(prev => ({
            ...prev,
            hunger: Math.min(100, prev.hunger + 30),
            happiness: Math.min(100, prev.happiness + 10),
        }));
        const reward = feedVirtualPet();
        const toastMessage = reward.status === 'awarded' && reward.pointsAwarded
            ? `¡Miau! Que rico 😋 +${reward.pointsAwarded} pts`
            : reward.status === 'already_claimed'
                ? '¡Miau! Ya reclamaste los puntos diarios'
                : '¡Miau! Que rico 😋';
        const toastType: 'success' | 'error' = reward.status === 'already_claimed' ? 'error' : 'success';
        showToast(toastMessage, toastType);
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);
    };

    const playWithPet = () => {
        if (stats.energy < 15) {
            showToast('Muy cansado para jugar 😴', 'error');
            return;
        }
        setIsAnimating(true);
        setCatAnimation('playing');
        animateCat('shake');
        setStats(prev => ({
            ...prev,
            happiness: Math.min(100, prev.happiness + 20),
            energy: Math.max(0, prev.energy - 15),
        }));
        showToast('¡Ronroneo! 😸 +20 Felicidad');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);
    };

    const cleanPet = () => {
        if (gameCoins < 3) {
            showToast('Necesitas 3 monedas', 'error');
            return;
        }

        const paid = spendGameCoins(3);
        if (!paid) return;

        setIsAnimating(true);
        animateCat('shake');
        setStats(prev => ({
            ...prev,
            happiness: Math.min(100, prev.happiness + 15),
        }));
        showToast('¡Brillante y limpio! ✨');
        setTimeout(() => setIsAnimating(false), 1000);
    };

    const restPet = () => {
        setIsAnimating(true);
        setCatAnimation('sleeping');
        setStats(prev => ({
            ...prev,
            energy: Math.min(100, prev.energy + 40),
            happiness: Math.min(100, prev.happiness + 5),
        }));
        showToast('Zzz... Recuperando energía 💤');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 3000);
    };

    const handleConvertCoins = () => {
        if (gameCoins < 5) {
            showToast('Mínimo 5 monedas', 'error');
            return;
        }
        const points = convertCoinsToPoints(gameCoins);
        if (points > 0) {
            spendGameCoins(gameCoins); // Spend ALL coins
            showToast(`¡${points} puntos canjeados! 🎉`);
        }
    };

    // --- Game Logic ---
    const handleCloseGame = () => setCurrentGame(null);

    const handleGameEnd = (score: number) => {
        const expGained = Math.floor(score / 10);
        const coinsEarned = Math.floor(score / 5);

        if (coinsEarned > 0) {
            addGameCoins(coinsEarned);
        }

        setStats(prev => {
            const newExp = prev.exp + expGained;
            const newLevel = Math.floor(newExp / 100) + 1;
            if (newLevel > prev.level) {
                showToast(`¡SUBISTE A NIVEL ${newLevel}! 🎉`);
            }
            return {
                ...prev,
                exp: newExp,
                level: newLevel,
                happiness: Math.min(100, prev.happiness + 10),
                energy: Math.max(0, prev.energy - 15),
            };
        });
        const rewardOutcome = currentGame && ARCADE_REWARD_GAMES.has(currentGame)
            ? registerArcadeReward(currentGame, score)
            : null;
        let summaryToast = `Fin: +${coinsEarned} Monedas, +${expGained} EXP`;
        if (rewardOutcome) {
            if (rewardOutcome.status === 'awarded' && rewardOutcome.pointsAwarded) {
                summaryToast += ` · +${rewardOutcome.pointsAwarded} pts`;
            } else if (rewardOutcome.status !== 'awarded') {
                showToast(rewardOutcome.message, 'error');
            }
        }
        showToast(summaryToast);
        // Do NOT close game automatically. Let the game component handle "Play Again" or "Exit".
        // setCurrentGame(null);
    };

    // --- Render Helpers ---
    const renderGame = () => {
        switch (currentGame) {
            case 'fruit': return <FruitCatcher onGameEnd={handleGameEnd} onClose={handleCloseGame} />;
            case 'duck': return <DuckHunt onGameEnd={handleGameEnd} onClose={handleCloseGame} />;
            case 'memory': return <MemoryGame onGameEnd={handleGameEnd} onClose={handleCloseGame} />;
            case 'dino': return <DinoGame onGameEnd={handleGameEnd} onClose={handleCloseGame} />;
            case 'roulette': return (
                <RouletteGame
                    coins={gameCoins}
                    onClose={handleCloseGame}
                    onGameEnd={(val) => {
                        if (val > 0) {
                            addGameCoins(val);
                            showToast(`¡Ganaste! +${val}`);
                        } else if (val < 0) {
                            spendGameCoins(Math.abs(val));
                            // showToast(`Perdiste ${Math.abs(val)}`, 'error'); // Optional spam
                        }
                    }}
                />
            );
            case 'slots': return (
                <SlotMachine
                    coins={gameCoins}
                    onClose={handleCloseGame}
                    onGameEnd={(val) => {
                        if (val > 0) {
                            addGameCoins(val);
                            showToast(`Jackpot! +${val}`);
                        } else if (val < 0) {
                            spendGameCoins(Math.abs(val));
                        }
                    }}
                />
            );
            default: return null;
        }
    };

    const renderProgressBar = (value: number, color: string) => (
        <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }]} />
        </View>
    );

    // --- Main Render ---
    if (currentGame) {
        return (
            <View style={styles.fullScreenContainer}>
                <View style={styles.gameHeader}>
                    <TouchableOpacity onPress={() => setCurrentGame(null)} style={styles.backButton}>
                        <ArrowRight size={24} color="#000" style={{ transform: [{ rotate: '180deg' }] }} />
                        <Text style={styles.backText}>Volver</Text>
                    </TouchableOpacity>
                    <View style={styles.coinBadge}>
                        <Coins size={16} color="#CA8A04" />
                        <Text style={styles.coinText}>{gameCoins}</Text>
                    </View>
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    {renderGame()}
                </View>
                <Toast {...toast} onHide={() => setToast(prev => ({ ...prev, visible: false }))} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            {/* Global Wallet Counter (Top Right) */}
            <View style={styles.globalWallet}>
                <Coins size={16} color="#854D0E" />
                <Text style={styles.globalWalletText}>{gameCoins}</Text>
            </View>

            <MobileHeader title="Mi Mascota" subtitle="Cuida a tu gatito" backButton onBack={() => navigation?.goBack()} />

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Pet Card */}
                <View style={styles.petCard}>
                    <LinearGradient colors={['rgba(236, 72, 153, 0.1)', 'rgba(59, 130, 246, 0.1)']} style={styles.petGradient}>
                        <Animated.Text style={[styles.emojiDisplay, catStyle]}>
                            {getCatEmoji()}
                        </Animated.Text>

                        <View style={styles.petInfo}>
                            <Text style={styles.petLevel}>Gatito Nivel {stats.level}</Text>
                            <Text style={styles.petStatus}>
                                {petMood === 'happy' ? '¡Muy feliz!' : petMood === 'sad' ? 'Triste...' : 'Normal'}
                            </Text>

                            {/* Level Progress */}
                            <View style={styles.levelBarContainer}>
                                <Text style={styles.levelText}>EXP {stats.exp % 100}/100</Text>
                                <View style={styles.levelTrack}>
                                    <View style={[styles.levelFill, { width: `${stats.exp % 100}%` }]} />
                                </View>
                            </View>
                        </View>
                    </LinearGradient>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Heart size={16} color="#EF4444" fill="#EF4444" />
                            <Text style={styles.statLabel}>Felicidad</Text>
                            {renderProgressBar(stats.happiness, '#EF4444')}
                        </View>
                        <View style={styles.statItem}>
                            <Utensils size={16} color="#F97316" />
                            <Text style={styles.statLabel}>Hambre</Text>
                            {renderProgressBar(stats.hunger, '#F97316')}
                        </View>
                        <View style={styles.statItem}>
                            <Zap size={16} color="#EAB308" fill="#EAB308" />
                            <Text style={styles.statLabel}>Energía</Text>
                            {renderProgressBar(stats.energy, '#EAB308')}
                        </View>
                    </View>
                </View>

                {/* Coins & Actions */}
                <View style={styles.actionsGrid}>
                    <BlurView intensity={20} style={styles.coinCard}>
                        <View style={styles.coinHeader}>
                            <Coins size={24} color="#CA8A04" fill="#CA8A04" />
                            <Text style={styles.coinValue}>{gameCoins}</Text>
                        </View>
                        <TouchableOpacity style={styles.convertBtn} onPress={handleConvertCoins}>
                            <Text style={styles.convertText}>Convertir a Puntos</Text>
                        </TouchableOpacity>
                    </BlurView>

                    <View style={styles.careButtons}>
                        <TouchableOpacity style={styles.careBtn} onPress={feedPet}>
                            <View style={[styles.iconCircle, { backgroundColor: '#FFF7ED' }]}>
                                <Utensils size={20} color="#F97316" />
                            </View>
                            <Text style={styles.careLabel}>Comer</Text>
                            <Text style={styles.costLabel}>5 🪙</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.careBtn} onPress={playWithPet}>
                            <View style={[styles.iconCircle, { backgroundColor: '#FAF5FF' }]}>
                                <Gamepad2 size={20} color="#A855F7" />
                            </View>
                            <Text style={styles.careLabel}>Jugar</Text>
                            <Text style={styles.costLabel}>-15 ⚡</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.careBtn} onPress={cleanPet}>
                            <View style={[styles.iconCircle, { backgroundColor: '#ECFEFF' }]}>
                                <Sparkles size={20} color="#06B6D4" />
                            </View>
                            <Text style={styles.careLabel}>Limpiar</Text>
                            <Text style={styles.costLabel}>3 🪙</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.careBtn} onPress={restPet}>
                            <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
                                <Moon size={20} color="#3B82F6" />
                            </View>
                            <Text style={styles.careLabel}>Dormir</Text>
                            <Text style={styles.costLabel}>+40 ⚡</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Games Selection */}
                <Text style={styles.sectionTitle}>Minijuegos</Text>
                <View style={styles.gamesGrid}>
                    {GAMES.map((game) => (
                        <TouchableOpacity
                            key={game.id}
                            style={styles.gameCard}
                            onPress={() => setCurrentGame(game.id as GameType)}
                            activeOpacity={0.9}
                        >
                            <LinearGradient colors={game.gradient} style={styles.gameGradient}>
                                <Text style={styles.gameIcon}>{game.icon}</Text>
                            </LinearGradient>
                            <View style={styles.gameInfo}>
                                <Text style={styles.gameName}>{game.name}</Text>
                                <Text style={styles.gameDesc}>{game.description}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Tips */}
                <View style={styles.tipsCard}>
                    <View style={styles.tipIcon}>
                        <Trophy size={20} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.tipTitle}>Consejos Pro</Text>
                        <Text style={styles.tipText}>• Juega minijuegos para ganar monedas.</Text>
                        <Text style={styles.tipText}>• Mantén feliz a tu gatito para bonos.</Text>
                    </View>
                </View>

            </ScrollView>

            <Toast {...toast} onHide={() => setToast(prev => ({ ...prev, visible: false }))} />
        </View>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    fullScreenContainer: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        paddingTop: 40, // Status bar safe area approx
    },
    gameHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 10,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    backText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1E293B',
    },
    coinBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF9C3',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    coinText: {
        fontWeight: 'bold',
        color: '#854D0E',
    },
    // Pet Card
    petCard: {
        backgroundColor: '#fff',
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    petGradient: {
        padding: 24,
        alignItems: 'center',
    },
    emojiDisplay: {
        fontSize: 80,
        marginBottom: 16,
    },
    petInfo: {
        alignItems: 'center',
        width: '100%',
    },
    petLevel: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1E293B',
    },
    petStatus: {
        fontSize: 14,
        color: '#64748B',
        marginBottom: 12,
    },
    levelBarContainer: {
        width: '100%',
        marginTop: 8,
    },
    levelText: {
        fontSize: 12,
        color: '#94A3B8',
        marginBottom: 4,
        textAlign: 'right',
    },
    levelTrack: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    levelFill: {
        height: '100%',
        backgroundColor: '#3B82F6',
        borderRadius: 3,
    },
    statsRow: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
    },
    statItem: {
        flex: 1,
    },
    statLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
        marginVertical: 4,
    },
    progressContainer: {
        height: 6,
        backgroundColor: '#F1F5F9',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 3,
    },
    // Actions
    actionsGrid: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 24,
    },
    coinCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    coinHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    coinValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#B45309',
    },
    convertBtn: {
        backgroundColor: '#FCD34D',
        paddingVertical: 8,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 12,
    },
    convertText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#78350F',
    },
    careButtons: {
        flex: 1,
        gap: 8,
        flexDirection: 'row', // Updated to Grid-like wrap if needed, but flex=1 means it takes half
        flexWrap: 'wrap',
    },
    careBtn: {
        width: '47%', // 2 cols
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        elevation: 1,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    careLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#334155',
    },
    costLabel: {
        fontSize: 10,
        color: '#94A3B8',
        marginTop: 2,
    },
    // Games
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1E293B',
        marginBottom: 16,
    },
    gamesGrid: {
        gap: 12,
        marginBottom: 24,
    },
    gameCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    gameGradient: {
        width: 60,
        height: 60,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gameIcon: {
        fontSize: 28,
    },
    gameInfo: {
        flex: 1,
        marginLeft: 12,
    },
    gameName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1E293B',
    },
    gameDesc: {
        fontSize: 12,
        color: '#64748B',
    },
    // Tips
    tipsCard: {
        flexDirection: 'row',
        backgroundColor: '#F5F3FF',
        borderRadius: 16,
        padding: 16,
        gap: 12,
    },
    tipIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#EDE9FE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tipTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#5B21B6',
        marginBottom: 4,
    },
    tipText: {
        fontSize: 12,
        color: '#6D28D9',
        lineHeight: 18,
    },
    // Toast
    toast: {
        position: 'absolute',
        bottom: 80,
        left: 20,
        right: 20,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 10,
        zIndex: 100,
    },
    toastSuccess: {
        backgroundColor: '#10B981',
    },
    toastError: {
        backgroundColor: '#EF4444',
    },
    toastText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    globalWallet: {
        position: 'absolute',
        top: 50, // Approx status bar + padding
        right: 20,
        zIndex: 100, // On top of header
        backgroundColor: '#FEF9C3',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
        borderWidth: 1,
        borderColor: '#EAB308',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    globalWalletText: {
        fontWeight: 'bold',
        color: '#854D0E',
        fontSize: 14,
    }
});
