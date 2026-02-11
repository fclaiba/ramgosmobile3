import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, Image, ImageBackground, Platform } from 'react-native';
import { Heart, Utensils, Zap, Sparkles, Moon, Play, Coins, ArrowRight, Trophy, Gamepad2, Info, Check, Shirt, HelpCircle, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, FadeInDown, FadeIn } from 'react-native-reanimated';
import { usePoints } from '../../contexts/PointsContext';
import { useRewards } from '../../contexts/RewardsContext';
import { MobileHeader } from '../MobileHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';

// Game Imports
import { FruitCatcher } from '../games/FruitCatcher';
import { DuckHunt } from '../games/DuckHunt';
import { MemoryGame } from '../games/MemoryGame';
import { DinoGame } from '../games/DinoGame';
import { RouletteGame } from '../games/RouletteGame';
import { SlotMachine } from '../games/SlotMachine';
import { GameWrapper } from '../games/GameWrapper';
import type { GameId } from '../games/gameContracts';

// Parte 0 (contrato): tipos/tokens para wrapper compartido (sin refactor aún).
// Ver `src/components/games/gameContracts.ts` y `src/components/games/GAME_CONTRACT.md`.

const { width } = Dimensions.get('window');
const ARCADE_REWARD_GAMES = new Set(['fruit', 'duck', 'memory', 'dino']);

// --- Types ---
interface PetStats {
    happiness: number;
    hunger: number;
    energy: number;
    level: number;
    exp: number;
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
] as const;

const STAGE_CONFIG = {
    EGG: { name: 'Huevo', minStreak: 0, next: 3, emoji: '🥚', desc: 'Incubando...' },
    BABY: { name: 'Bebé', minStreak: 3, next: 8, emoji: '😺', desc: '¡Ha nacido!' },
    YOUNG: { name: 'Joven', minStreak: 8, next: 30, emoji: '😼', desc: 'Creciendo fuerte' },
    ADULT: { name: 'Adulto', minStreak: 30, next: 1000, emoji: '🦁', desc: 'Majestuoso' },
};

const HATS = [
    { id: 'none', icon: '❌', name: 'Nada', cost: 0 },
    { id: 'party', icon: '🎉', name: 'Fiesta', cost: 50 },
    { id: 'crown', icon: '👑', name: 'Rey', cost: 500 },
    { id: 'viking', icon: '⚔️', name: 'Vikingo', cost: 200 },
    { id: 'wizard', icon: '🧙‍♂️', name: 'Mago', cost: 300 },
    { id: 'glasses', icon: '😎', name: 'Cool', cost: 100 },
    { id: 'cowboy', icon: '🤠', name: 'Sheriff', cost: 150 },
    { id: 'alien', icon: '👽', name: 'Alien', cost: 250 },
];

export function MiMascotaView({ navigation }: any) {
    const { convertCoinsToPoints, conversionRate, petStage, challengeProgress, transactions } = usePoints();
    const { feedVirtualPet, registerArcadeReward, gameCoins, addGameCoins, spendGameCoins, petConfig, unlockAccessory, equipAccessory } = useRewards();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    // --- State ---
    const [stats, setStats] = useState<PetStats>({ happiness: 80, hunger: 60, energy: 70, level: 1, exp: 0 });
    const [currentGame, setCurrentGame] = useState<GameType>(null);
    const [petMood, setPetMood] = useState<PetMood>('happy');
    const [isAnimating, setIsAnimating] = useState(false);
    const [catAnimation, setCatAnimation] = useState<string>('idle');
    const [showWardrobe, setShowWardrobe] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [previewHat, setPreviewHat] = useState<string | null>(null);
    const [purchaseRewards, setPurchaseRewards] = useState<{ processedPurchaseTxnIds: string[]; giftedHatIds: string[] }>({
        processedPurchaseTxnIds: [],
        giftedHatIds: [],
    });

    const PURCHASE_GIFT_HATS = useMemo(
        () => ['party', 'glasses', 'cowboy', 'viking', 'wizard', 'alien', 'crown'] as const,
        []
    );

    // Sync preview
    useEffect(() => {
        if (showWardrobe) {
            setPreviewHat(petConfig?.activeHat || null);
        }
    }, [showWardrobe, petConfig?.activeHat]);

    // Load/Save Stats
    useEffect(() => {
        AsyncStorage.getItem('petStats').then(saved => {
            if (saved) {
                const parsed = JSON.parse(saved);
                const { coins, ...rest } = parsed; // Legacy clean
                setStats(rest);
            }
        });
    }, []);

    useEffect(() => {
        AsyncStorage.setItem('petStats', JSON.stringify(stats));
    }, [stats]);

    // Load/Save Purchase-linked rewards (Sprint 4)
    useEffect(() => {
        AsyncStorage.getItem('petPurchaseRewards').then((saved) => {
            if (!saved) return;
            try {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    setPurchaseRewards({
                        processedPurchaseTxnIds: Array.isArray(parsed.processedPurchaseTxnIds) ? parsed.processedPurchaseTxnIds : [],
                        giftedHatIds: Array.isArray(parsed.giftedHatIds) ? parsed.giftedHatIds : [],
                    });
                }
            } catch {
                // ignore
            }
        });
    }, []);

    useEffect(() => {
        AsyncStorage.setItem('petPurchaseRewards', JSON.stringify(purchaseRewards));
    }, [purchaseRewards]);

    // Purchase -> Pet: each purchase unlocks a cosmetic (free hat) + pet grows (level++).
    useEffect(() => {
        const purchaseTxs = (transactions ?? []).filter((tx: any) => tx?.source === 'purchase' && tx?.amount > 0);
        if (purchaseTxs.length === 0) return;

        // Process oldest -> newest for deterministic ordering.
        const ordered = [...purchaseTxs].reverse();
        const newOnes = ordered.filter((tx: any) => !purchaseRewards.processedPurchaseTxnIds.includes(tx.id));
        if (newOnes.length === 0) return;

        setPurchaseRewards((prev) => {
            let processed = [...prev.processedPurchaseTxnIds];
            let gifted = [...prev.giftedHatIds];

            newOnes.forEach(() => {
                const nextHat = PURCHASE_GIFT_HATS.find((id) => !gifted.includes(id)) ?? null;
                if (nextHat) {
                    // Free unlock (0 coins)
                    unlockAccessory('hat', nextHat, 0);
                    gifted.push(nextHat);
                    setStats((s) => ({ ...s, level: s.level + 1 }));
                }
            });

            newOnes.forEach((tx: any) => processed.push(tx.id));
            return { processedPurchaseTxnIds: processed, giftedHatIds: gifted };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions]);

    // Decay Loop
    useEffect(() => {
        const interval = setInterval(() => {
            setStats(prev => ({
                ...prev,
                happiness: Math.max(0, prev.happiness - 0.042),
                hunger: Math.max(0, prev.hunger - 0.042),
                energy: Math.max(0, prev.energy - 0.02),
            }));
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Mood Logic
    useEffect(() => {
        if (stats.energy < 20) setPetMood('sleeping');
        else if (stats.happiness > 70 && stats.hunger > 50) setPetMood('happy');
        else if (stats.happiness < 30 || stats.hunger < 20) setPetMood('sad');
        else setPetMood('normal');
    }, [stats]);

    // --- Animation ---
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
        if (petStage === 'EGG') return '🥚';
        if (catAnimation === 'eating') return '😋';
        if (catAnimation === 'playing') return '😸';
        if (catAnimation === 'sleeping') return '😴';

        // Adult/Young Logic
        if (petStage === 'ADULT') return petMood === 'happy' ? '🦁' : '🦁';
        if (petStage === 'YOUNG') return petMood === 'happy' ? '😼' : '😿';

        // Baby Logic
        switch (petMood) {
            case 'happy': return '😺';
            case 'sad': return '😿';
            case 'sleeping': return '😴';
            default: return '😺';
        }
    };

    // --- Actions ---
    const feedPet = () => {
        const result = feedVirtualPet();
        if (result.status !== 'awarded') {
            show(result.message, 'info');
            return;
        }
        setIsAnimating(true);
        setCatAnimation('eating');
        animateCat('jump');
        setStats(prev => ({ ...prev, hunger: Math.min(100, prev.hunger + 30) }));
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);
        show(`¡Ñam ñam! +${result.pointsAwarded ?? 0} Puntos`);
    };

    const playWithPet = () => {
        if (petStage === 'EGG') return show('El huevo necesita calor, no juegos.', 'info');
        if (stats.energy < 15) return show('Está muy cansado 😴', 'error');

        setIsAnimating(true);
        setCatAnimation('playing');
        animateCat('shake');
        setStats(prev => ({
            ...prev,
            happiness: Math.min(100, prev.happiness + 20),
            energy: Math.max(0, prev.energy - 15),
        }));
        show('¡Diversión total! +20 Felicidad');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);
    };

    const cleanPet = () => {
        if (petStage === 'EGG') return;
        if (gameCoins < 3) return show('Necesitas 3 monedas para el baño', 'error');
        if (spendGameCoins(3)) {
            setIsAnimating(true);
            animateCat('shake');
            setStats(prev => ({ ...prev, happiness: Math.min(100, prev.happiness + 15) }));
            show('¡Reluciente! ✨');
            setTimeout(() => setIsAnimating(false), 1000);
        }
    };

    const handleConvertCoins = () => {
        const rate = conversionRate || 5;
        if (gameCoins < rate) return show(`Mínimo ${rate} monedas para canjear`, 'error');
        const points = Math.floor(gameCoins / rate);
        const cost = points * rate;
        if (spendGameCoins(cost)) {
            convertCoinsToPoints(cost);
            show(`¡Canjeado! ${cost} monedas -> ${points} puntos`);
        }
    };

    // --- Components ---
    const renderProgressBar = (value: number, color: string, icon: any) => (
        <View style={styles.statRow}>
            <View style={[styles.statIconBox, { backgroundColor: `${color}20` }]}>
                {icon}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={styles.statTrack}>
                    <Animated.View style={[styles.statFill, { width: `${Math.max(5, value)}%`, backgroundColor: color }]} />
                </View>
            </View>
            <Text style={styles.statValue}>{Math.round(value)}%</Text>
        </View>
    );

    const renderEvolutionTrack = () => {
        const currentConfig = STAGE_CONFIG[petStage];
        const nextStageGoal = currentConfig.next;
        const currentStreak = challengeProgress.loginStreak || 0;
        const progress = Math.min(100, (currentStreak / nextStageGoal) * 100);

        return (
            <TouchableOpacity style={styles.evoCard} onPress={() => setShowGuide(true)}>
                <View style={styles.evoHeader}>
                    <Text style={styles.evoTitle}>Evolución ({currentConfig.name})</Text>
                    <HelpCircle size={16} color="#9CA3AF" />
                </View>
                <View style={styles.evoTrackContainer}>
                    <View style={styles.evoTrack}>
                        <LinearGradient
                            colors={['#8B5CF6', '#EC4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.evoFill, { width: `${progress}%` }]}
                        />
                    </View>
                    <Text style={styles.evoText}>
                        Racha: {currentStreak} / {nextStageGoal} días
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderWardrobeModal = () => (
        <Modal visible={showWardrobe} animationType="slide" transparent>
            <BlurView intensity={Platform.OS === 'ios' ? 40 : 100} tint={isDark ? "dark" : "light"} style={styles.modalOverlay}>
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setShowWardrobe(false)} style={styles.roundBtn}>
                            <X size={24} color={isDark ? "#FFF" : "#000"} />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Vestidor</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <View style={styles.previewStage}>
                        <View style={styles.previewCircle}>
                            {/* Hat Layer */}
                            {previewHat && previewHat !== 'none' && (
                                <Text style={styles.previewHatEmoji}>{HATS.find(h => h.id === previewHat)?.icon}</Text>
                            )}
                            <Text style={styles.previewPetEmoji}>{getCatEmoji()}</Text>
                        </View>
                        <View style={styles.coinBalance}>
                            <Coins size={16} color="#CA8A04" />
                            <Text style={styles.BalanceText}>{gameCoins}</Text>
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={styles.wardrobeGrid}>
                        {HATS.map(hat => {
                            const isUnlocked = petConfig.unlockedHats.includes(hat.id);
                            const isActive = previewHat === hat.id;

                            return (
                                <TouchableOpacity
                                    key={hat.id}
                                    style={[styles.wardrobeItem, isActive && styles.wardrobeItemActive]}
                                    onPress={() => setPreviewHat(hat.id)}
                                >
                                    <Text style={{ fontSize: 32 }}>{hat.icon}</Text>
                                    <Text style={styles.hatName}>{hat.name}</Text>

                                    {!isUnlocked ? (
                                        <View style={styles.priceTag}>
                                            <Text style={styles.priceText}>{hat.cost}</Text>
                                            <Coins size={10} color="#FFF" />
                                        </View>
                                    ) : (
                                        <View style={styles.ownedTag}><Check size={10} color="#FFF" /></View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={styles.modalFooter}>
                        {(() => {
                            const hat = HATS.find(h => h.id === previewHat) || HATS[0];
                            const unlocked = petConfig.unlockedHats.includes(hat.id);

                            if (unlocked) {
                                return (
                                    <TouchableOpacity style={[styles.mainBtn, { backgroundColor: '#10B981' }]}
                                        onPress={() => { equipAccessory('hat', hat.id); setShowWardrobe(false); }}>
                                        <Text style={styles.btnText}>Equipar</Text>
                                    </TouchableOpacity>
                                );
                            } else {
                                return (
                                    <TouchableOpacity style={styles.mainBtn}
                                        onPress={() => unlockAccessory('hat', hat.id, hat.cost)}>
                                        <Text style={styles.btnText}>Comprar ({hat.cost})</Text>
                                    </TouchableOpacity>
                                );
                            }
                        })()}
                    </View>
                </SafeAreaView>
            </BlurView>
        </Modal>
    );

    const renderGuideModal = () => (
        <Modal visible={showGuide} animationType="fade" transparent>
            <View style={styles.guideOverlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                <View style={styles.guideCard}>
                    <Text style={styles.guideTitle}>Guía de Evolución</Text>
                    <Text style={styles.guideText}>Tu mascota evoluciona manteniendo tu Racha Diaria (Login).</Text>

                    <View style={styles.stageRow}>
                        <Text style={{ fontSize: 24 }}>🥚</Text>
                        <ArrowRight size={16} color="#9CA3AF" />
                        <Text style={{ fontSize: 24 }}>😺</Text>
                        <ArrowRight size={16} color="#9CA3AF" />
                        <Text style={{ fontSize: 24 }}>😼</Text>
                        <ArrowRight size={16} color="#9CA3AF" />
                        <Text style={{ fontSize: 24 }}>🦁</Text>
                    </View>

                    <View style={styles.reqList}>
                        <Text style={styles.reqItem}>• Bebé: 3 Días de Racha</Text>
                        <Text style={styles.reqItem}>• Joven: 8 Días de Racha</Text>
                        <Text style={styles.reqItem}>• Adulto: 30 Días de Racha</Text>
                    </View>

                    <TouchableOpacity style={styles.closeGuideBtn} onPress={() => setShowGuide(false)}>
                        <Text style={styles.btnText}>Entendido</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    // --- GAME RENDERER ---
    if (currentGame) {
        let ComponentToRender: any = null;
        if (currentGame === 'fruit') ComponentToRender = FruitCatcher;
        if (currentGame === 'duck') ComponentToRender = DuckHunt;
        if (currentGame === 'memory') ComponentToRender = MemoryGame;
        if (currentGame === 'dino') ComponentToRender = DinoGame;
        if (currentGame === 'roulette') ComponentToRender = RouletteGame;
        if (currentGame === 'slots') ComponentToRender = SlotMachine;

        const gameId = currentGame as GameId;
        const isCasino = currentGame === 'roulette' || currentGame === 'slots';

        return (
            <View style={[styles.gameContainer, { paddingTop: 0 }]}>
                <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
                    <GameWrapper
                        gameId={gameId}
                        GameComponent={ComponentToRender}
                        coins={gameCoins}
                        autoCloseOnSave
                        onClose={() => setCurrentGame(null)}
                        onLegacyGameEnd={(value: number) => {
                            // Arcade: value is score. Casino: value is net delta.
                            if (isCasino) {
                                if (value >= 0) addGameCoins(value);
                                else spendGameCoins(Math.abs(value));
                                show(`Resultado: ${value >= 0 ? '+' : ''}${value} monedas`);
                                return;
                            }

                            const score = value;
                            const coins = Math.floor(score / 5);
                            if (coins > 0) addGameCoins(coins);

                            // Arcade Reward Logic (Points)
                            if (ARCADE_REWARD_GAMES.has(currentGame)) {
                                const result = registerArcadeReward(currentGame, score);
                                if (result.status === 'awarded') show(`+${result.pointsAwarded} Pts Ramgos`);
                            }
                            show(`Fin de juego: Ganaste ${coins} monedas`);
                        }}
                        gameProps={{
                            // Casino components currently require these props.
                            ...(isCasino ? { coins: gameCoins, onClose: () => setCurrentGame(null) } : {}),
                        }}
                    />
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Mi Mascota"
                subtitle={STAGE_CONFIG[petStage].desc}
                onBack={() => navigation?.goBack()}
                backButton={true}
                actions={
                    <View style={styles.headerWallet}>
                        <Coins size={14} color="#B45309" />
                        <Text style={styles.headerWalletText}>{gameCoins}</Text>
                    </View>
                }
            />

            <ScrollView contentContainerStyle={styles.scroll}>
                {/* HERO PET SECTION */}
                <View style={styles.heroCard}>
                    <LinearGradient colors={isDark ? ['#312E81', '#1E1B4B'] : ['#E0E7FF', '#FAFAFA']} style={styles.heroGradient}>
                        <View style={styles.petStageArea}>
                            {petConfig?.activeHat && petConfig.activeHat !== 'none' && (
                                <Animated.Text entering={FadeInDown} style={styles.hatEmoji}>
                                    {HATS.find(h => h.id === petConfig.activeHat)?.icon}
                                </Animated.Text>
                            )}
                            <Animated.Text style={[styles.mainPetEmoji, catStyle]}>
                                {getCatEmoji()}
                            </Animated.Text>
                        </View>

                        {/* Status Bubbles */}
                        <View style={styles.statusBubbles}>
                            <View style={styles.bubble}>
                                <Text style={styles.bubbleLabel}>Nivel {stats.level}</Text>
                            </View>
                            <View style={[styles.bubble, { backgroundColor: isDark ? '#374151' : '#FFF' }]}>
                                <Text style={styles.bubbleLabel}>{petMood === 'happy' ? 'Muy Feliz' : 'Normal'}</Text>
                            </View>
                        </View>
                    </LinearGradient>

                    {/* Stats Grid */}
                    <View style={styles.statsGrid}>
                        {renderProgressBar(stats.happiness, '#EC4899', <Heart size={14} color="#EC4899" fill="#EC4899" />)}
                        {renderProgressBar(stats.hunger, '#F97316', <Utensils size={14} color="#F97316" />)}
                        {renderProgressBar(stats.energy, '#EAB308', <Zap size={14} color="#EAB308" fill="#EAB308" />)}
                    </View>
                </View>

                {/* Evolution Progress */}
                {renderEvolutionTrack()}

                {/* Main Actions */}
                <Text style={styles.sectionTitle}>Cuidados</Text>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={feedPet}>
                        <View style={[styles.actionIcon, { backgroundColor: '#FFF7ED' }]}>
                            <Utensils size={24} color="#F97316" />
                        </View>
                        <Text style={styles.actionLabel}>Comer</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={playWithPet}>
                        <View style={[styles.actionIcon, { backgroundColor: '#F0F9FF' }]}>
                            <Gamepad2 size={24} color="#0EA5E9" />
                        </View>
                        <Text style={styles.actionLabel}>Jugar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={cleanPet}>
                        <View style={[styles.actionIcon, { backgroundColor: '#F0FDF4' }]}>
                            <Sparkles size={24} color="#22C55E" />
                        </View>
                        <Text style={styles.actionLabel}>Baño</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => {
                        if (petStage === 'EGG') return show('¡Eclosiona primero!', 'info');
                        setShowWardrobe(true);
                    }}>
                        <View style={[styles.actionIcon, { backgroundColor: '#FAF5FF' }]}>
                            <Shirt size={24} color="#A855F7" />
                        </View>
                        <Text style={styles.actionLabel}>Ropa</Text>
                    </TouchableOpacity>
                </View>

                {/* Converter Card */}
                <LinearGradient colors={['#F59E0B', '#B45309']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.converterCard}>
                    <View>
                        <Text style={styles.convTitle}>Bank</Text>
                        <Text style={styles.convDesc}>Convierte tus monedas en Puntos Ramgos</Text>
                    </View>
                    <TouchableOpacity style={styles.convBtn} onPress={handleConvertCoins}>
                        <Text style={styles.convBtnText}>Canjear</Text>
                    </TouchableOpacity>
                </LinearGradient>

                {/* Mini Games */}
                <Text style={styles.sectionTitle}>Arcade & Juegos</Text>
                <View style={styles.gameGrid}>
                    {GAMES.map(game => (
                        <TouchableOpacity
                            key={game.id}
                            style={styles.gameItem}
                            onPress={() => setCurrentGame(game.id as GameType)}
                        >
                            <LinearGradient colors={game.gradient} style={styles.gameIconBox}>
                                <Text style={{ fontSize: 24 }}>{game.icon}</Text>
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.gameTitle}>{game.name}</Text>
                                <Text style={styles.gameDesc} numberOfLines={1}>{game.type === 'casino' ? 'Gana Monedas' : 'Gana Puntos'}</Text>
                            </View>
                            <ArrowRight size={16} color={isDark ? '#6B7280' : '#CBD5E1'} />
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {renderWardrobeModal()}
            {renderGuideModal()}
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#111827' : '#F8FAFC',
    },
    scroll: {
        padding: 16,
    },
    headerWallet: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    headerWalletText: {
        color: '#B45309',
        fontWeight: 'bold',
        fontSize: 12,
    },
    // Hero
    heroCard: {
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: isDark ? '#1F2937' : '#FFF',
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    heroGradient: {
        padding: 24,
        alignItems: 'center',
    },
    petStageArea: {
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    mainPetEmoji: {
        fontSize: 80,
    },
    hatEmoji: {
        position: 'absolute',
        top: -35,
        fontSize: 50,
        zIndex: 10,
    },
    statusBubbles: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    bubble: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
    },
    bubbleLabel: {
        color: isDark ? '#E5E7EB' : '#4B5563',
        fontSize: 12,
        fontWeight: '600',
    },
    statsGrid: {
        padding: 16,
        gap: 12,
        backgroundColor: isDark ? '#1F2937' : '#FFF',
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statIconBox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statTrack: {
        height: 8,
        backgroundColor: isDark ? '#374151' : '#F1F5F9',
        borderRadius: 4,
        overflow: 'hidden',
    },
    statFill: {
        height: '100%',
        borderRadius: 4,
    },
    statValue: {
        width: 40,
        textAlign: 'right',
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#64748B',
    },
    // Evolution
    evoCard: {
        backgroundColor: isDark ? '#1F2937' : '#FFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E2E8F0',
    },
    evoHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    evoTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: isDark ? '#F3F4F6' : '#1F2937',
    },
    evoTrackContainer: {
        gap: 6,
    },
    evoTrack: {
        height: 6,
        backgroundColor: isDark ? '#374151' : '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    evoFill: {
        height: '100%',
        borderRadius: 3,
    },
    evoText: {
        fontSize: 11,
        color: '#9CA3AF',
        textAlign: 'right',
    },
    // Actions
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#F3F4F6' : '#1F2937',
        marginBottom: 12,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 24,
    },
    actionBtn: {
        alignItems: 'center',
        gap: 6,
    },
    actionIcon: {
        width: 56,
        height: 56,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: isDark ? '#D1D5DB' : '#4B5563',
    },
    // Converter
    converterCard: {
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    convTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    convDesc: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
    },
    convBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
    },
    convBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 12,
    },
    // Games
    gameGrid: {
        gap: 12,
    },
    gameItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? '#1F2937' : '#FFF',
        padding: 12,
        borderRadius: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#F1F5F9',
    },
    gameIconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gameTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: isDark ? '#F3F4F6' : '#1F2937',
    },
    gameDesc: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.25)',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: isDark ? 'rgba(17,24,39,0.9)' : 'rgba(255,255,255,0.9)',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#1F2937' : '#E5E7EB',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : '#000',
    },
    roundBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewStage: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    previewCircle: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    previewHatEmoji: {
        fontSize: 50,
        position: 'absolute',
        top: -20,
        zIndex: 10,
    },
    previewPetEmoji: {
        fontSize: 80,
    },
    coinBalance: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(251,191,36,0.2)' : '#FEF3C7',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    BalanceText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: isDark ? '#FCD34D' : '#B45309',
    },
    wardrobeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
        gap: 12,
    },
    wardrobeItem: {
        width: (width - 32 - 24) / 3, // 3 columns
        aspectRatio: 1,
        backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFF',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
    },
    wardrobeItemActive: {
        borderColor: '#8B5CF6',
        backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF',
    },
    hatName: {
        fontSize: 10,
        color: isDark ? '#E5E7EB' : '#6B7280',
        marginTop: 4,
    },
    priceTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F59E0B',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        gap: 2,
        marginTop: 4,
    },
    priceText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    ownedTag: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: '#10B981',
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalFooter: {
        padding: 16,
        borderTopWidth: 1,
        borderColor: isDark ? '#374151' : '#E2E8F0',
    },
    mainBtn: {
        backgroundColor: '#8B5CF6',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    btnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // Guide Modal
    guideOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(15,23,42,0.35)',
    },
    guideCard: {
        backgroundColor: isDark ? '#111827' : '#FFF',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? '#1F2937' : '#E5E7EB',
    },
    guideTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 12,
        color: isDark ? '#F9FAFB' : '#1F2937',
    },
    guideText: {
        textAlign: 'center',
        color: isDark ? '#D1D5DB' : '#6B7280',
        marginBottom: 24,
    },
    stageRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
    },
    reqList: {
        width: '100%',
        gap: 12,
        marginBottom: 24,
    },
    reqItem: {
        fontSize: 14,
        color: isDark ? '#E5E7EB' : '#4B5563',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
        padding: 12,
        borderRadius: 12,
    },
    closeGuideBtn: {
        backgroundColor: isDark ? '#0F172A' : '#1F2937',
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: 12,
    },
    // Games
    gameContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    gameTopBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
    },
    gameBackBtn: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
    },
    gameCoinDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
});
