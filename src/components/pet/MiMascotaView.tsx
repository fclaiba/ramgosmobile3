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
import { FlappyBird } from '../games/FlappyBird';
import { GameWrapper } from '../games/GameWrapper';
import type { GameId } from '../games/gameContracts';
import { Radius, colors } from '../../theme/tokens';


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
type GameType = 'fruit' | 'duck' | 'memory' | 'dino' | 'flappy' | null;

const GAMES = [
    { id: 'fruit', name: 'Atrapar Frutas', icon: '🍎', gradient: ['#EF4444', '#F97316'] as const, description: 'Ayuda al gatito a atrapar frutas', type: 'skill' },
    { id: 'duck', name: 'Duck Hunt', icon: '🦆', gradient: ['#3B82F6', '#06B6D4'] as const, description: 'Caza patos voladores', type: 'skill' },
    { id: 'memory', name: 'Memoria Gatuna', icon: '🧠', gradient: ['#A855F7', '#EC4899'] as const, description: 'Encuentra las parejas', type: 'skill' },
    { id: 'dino', name: 'Dino Run', icon: '🦖', gradient: ['#22C55E', '#10B981'] as const, description: 'Salta obstáculos sin parar', type: 'skill' },
    { id: 'flappy', name: 'Flappy Cat', icon: '🕊️', gradient: ['#38BDF8', '#0284C7'] as const, description: 'Vuela entre los tubos', type: 'skill' },
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
    const {
        convertCoinsToPoints,
        conversionRate,
        gameCoins,
        petStats,
        petConfig: economyPetConfig,
        feedPet,
        sleepPet: sleepPetRemote,
        cleanPet: cleanPetRemote,
        playPet: playPetRemote,
        addGameCoins,
        updatePetState,
    } = usePoints();
    const { registerArcadeReward, unlockAccessory, equipAccessory } = useRewards();
    const petConfig = economyPetConfig;
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    // --- State ---
    // ponytail: stats come from Convex; local copy only for optimistic animation feel
    const [stats, setStats] = useState<PetStats>(petStats);
    useEffect(() => {
        setStats(petStats);
    }, [petStats.happiness, petStats.hunger, petStats.energy, petStats.level, petStats.exp]);
    const petStage = stats.level < 3 ? 'EGG' : stats.level < 8 ? 'BABY' : stats.level < 30 ? 'YOUNG' : 'ADULT';
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

    // Level Up Logic
    useEffect(() => {
        const requiredExp = stats.level * 100;
        if (stats.exp >= requiredExp) {
            const newLevel = stats.level + 1;
            const newExp = stats.exp - requiredExp;
            
            // Persistir en backend primero
            updatePetState({ level: newLevel, exp: newExp, happiness: 100, hunger: 100, energy: 100 });
            
            setStats(prev => ({ ...prev, level: newLevel, exp: newExp, happiness: 100, hunger: 100, energy: 100 }));
            show(`¡Subiste al nivel ${newLevel}! 🎉`, 'success');
        }
    }, [stats.exp, stats.level, show, updatePetState]);

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

    // --- Actions (Convex) ---
    const handleFeedPet = async () => {
        if (petStage === 'EGG') return show('¡El huevo no tiene boca! 🥚', 'info');
        if (gameCoins < 5) return show('Necesitas 5 monedas para alimentar 🪙', 'error');
        const result = await feedPet();
        if (!result.success) return show(result.message, 'error');
        setIsAnimating(true);
        setCatAnimation('eating');
        animateCat('jump');
        show('¡Comida deliciosa! +30 Hambre, +15 XP 🍖', 'success');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);
    };

    const playWithPet = async () => {
        if (petStage === 'EGG') return show('¡Le diste calorcito al huevo! 🥚❤️', 'success');
        if (stats.energy < 15) return show('Está muy cansado 😿', 'error');
        if (gameCoins < 2) return show('Necesitas 2 monedas para jugar 🪙', 'error');
        const result = await playPetRemote();
        if (!result.success) return show(result.message, 'error');
        setIsAnimating(true);
        setCatAnimation('playing');
        animateCat('shake');
        show('¡A jugar! +20 Felicidad, +25 XP 😺', 'success');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 1000);
    };

    const handleSleepPet = async () => {
        if (petStage === 'EGG') return show('¡El huevo ya está descansando! 🥚', 'info');
        if (gameCoins < 2) return show('Necesitas 2 monedas para dormir 🪙', 'error');
        const result = await sleepPetRemote();
        if (!result.success) return show(result.message, 'error');
        setIsAnimating(true);
        setCatAnimation('sleeping');
        animateCat('sleep');
        show('Zzz... +40 Energía, +10 XP 💤', 'success');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 1000);
    };

    const handleCleanPet = async () => {
        if (petStage === 'EGG') return show('¡Eclosiona primero! 🥚', 'info');
        if (gameCoins < 3) return show('Necesitas 3 monedas para el baño 🪙', 'error');
        const result = await cleanPetRemote();
        if (!result.success) return show(result.message, 'error');
        setIsAnimating(true);
        animateCat('shake');
        show('¡Baño completado! +15 Felicidad, +20 XP 🛁', 'success');
        setTimeout(() => setIsAnimating(false), 1000);
    };

    const handleConvertCoins = async () => {
        const rate = conversionRate || 5;
        if (gameCoins < rate) return show(`Mínimo ${rate} monedas para canjear`, 'error');
        const pointsToEarn = Math.floor(gameCoins / rate);
        const cost = pointsToEarn * rate;
        const result = await convertCoinsToPoints(cost);
        if (result?.success) {
            show(`¡Canjeado! ${cost} monedas → ${result.earnedPoints ?? pointsToEarn} puntos`, 'success');
        } else {
            show(result?.message || 'No se pudo canjear. Probá de nuevo.', 'error');
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
        const currentConfig = STAGE_CONFIG[petStage as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.ADULT;
        const requiredExp = stats.level * 100;
        const progress = Math.min(100, (stats.exp / requiredExp) * 100);

        return (
            <TouchableOpacity style={styles.evoCard} onPress={() => setShowGuide(true)}>
                <View style={styles.evoHeader}>
                    <Text style={styles.evoTitle}>Nivel {stats.level} ({currentConfig.name})</Text>
                    <HelpCircle size={16} color="#9CA3AF" />
                </View>
                <View style={styles.evoTrackContainer}>
                    <View style={styles.evoTrack}>
                        <LinearGradient
                            colors={['#4FC3F7', '#EC4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.evoFill, { width: `${progress}%` }]}
                        />
                    </View>
                    <Text style={styles.evoText}>
                        EXP: {stats.exp} / {requiredExp}
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
                                        onPress={async () => {
                                            const ok = await unlockAccessory('hat', hat.id, hat.cost);
                                            if (ok) show(`¡Compraste ${hat.name}!`, 'success');
                                            else show('No se pudo comprar (¿monedas?)', 'error');
                                        }}>
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
        if (currentGame === 'flappy') ComponentToRender = FlappyBird;

        const gameId = currentGame as GameId;

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
                        gameProps={{}}
                    />
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Mi Mascota"
                subtitle={(STAGE_CONFIG[petStage as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.ADULT).desc}
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
                            <View style={[styles.bubble, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)' }]}>
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
                    <TouchableOpacity style={styles.actionBtn} onPress={handleFeedPet}>
                        <View style={[styles.actionIcon, { backgroundColor: '#FFF7ED' }]}>
                            <Utensils size={24} color="#F97316" />
                        </View>
                        <Text style={styles.actionLabel}>Comer</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={playWithPet}>
                        <View style={[styles.actionIcon, { backgroundColor: '#F0F9FF' }]}>
                            <Gamepad2 size={24} color="#0EA5E9" />
                        </View>
                        <Text style={styles.actionLabel}>{petStage === 'EGG' ? 'Dar Calor' : 'Jugar'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={handleCleanPet}>
                        <View style={[styles.actionIcon, { backgroundColor: '#F0FDF4' }]}>
                            <Sparkles size={24} color="#22C55E" />
                        </View>
                        <Text style={styles.actionLabel}>Baño</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={handleSleepPet}>
                        <View style={[styles.actionIcon, { backgroundColor: '#FAF5FF' }]}>
                            <Moon size={24} color="#4FC3F7" />
                        </View>
                        <Text style={styles.actionLabel}>Dormir</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => {
                        if (petStage === 'EGG') return show('¡Eclosiona primero!', 'info');
                        setShowWardrobe(true);
                    }}>
                        <View style={[styles.actionIcon, { backgroundColor: '#FDF4FF' }]}>
                            <Shirt size={24} color="#D946EF" />
                        </View>
                        <Text style={styles.actionLabel}>Ropa</Text>
                    </TouchableOpacity>
                </View>

                {/* Converter Card */}
                <LinearGradient colors={['#F59E0B', '#B45309']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.converterCard}>
                    <View>
                        <Text style={styles.convTitle}>Bank</Text>
                        <Text style={styles.convDesc}>Convierte tus monedas en R Coins</Text>
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
                                <Text style={styles.gameDesc} numberOfLines={1}>{game.description}</Text>
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
        backgroundColor: colors(isDark).bg,
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
        borderRadius: Radius.md,
        gap: 4,
    },
    headerWalletText: {
        color: '#B45309',
        fontWeight: 'bold',
        fontSize: 12,
    },
    // Hero
    heroCard: {
        borderRadius: Radius.xl,
        overflow: 'hidden',
        backgroundColor: colors(isDark).glass,
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
        borderRadius: Radius.xl,
    },
    bubbleLabel: {
        color: isDark ? '#E5E7EB' : '#4B5563',
        fontSize: 12,
        fontWeight: '600',
    },
    statsGrid: {
        padding: 16,
        gap: 12,
        backgroundColor: colors(isDark).glass,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statIconBox: {
        width: 28,
        height: 28,
        borderRadius: Radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statTrack: {
        height: 8,
        backgroundColor: isDark ? '#374151' : '#F1F5F9',
        borderRadius: Radius.sm,
        overflow: 'hidden',
    },
    statFill: {
        height: '100%',
        borderRadius: Radius.sm,
    },
    statValue: {
        width: 40,
        textAlign: 'right',
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#64748B',
    },
    // Evolution
    evoCard: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.lg,
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
        color: colors(isDark).text,
    },
    evoTrackContainer: {
        gap: 6,
    },
    evoTrack: {
        height: 6,
        backgroundColor: isDark ? '#374151' : '#E2E8F0',
        borderRadius: Radius.sm,
        overflow: 'hidden',
    },
    evoFill: {
        height: '100%',
        borderRadius: Radius.sm,
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
        color: colors(isDark).text,
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
        borderRadius: Radius.xl,
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
        color: colors(isDark).textMuted,
    },
    // Converter
    converterCard: {
        borderRadius: Radius.lg,
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
        borderRadius: Radius.md,
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
        backgroundColor: colors(isDark).glass,
        padding: 12,
        borderRadius: Radius.lg,
        gap: 12,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#F1F5F9',
    },
    gameIconBox: {
        width: 48,
        height: 48,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gameTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors(isDark).text,
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
        borderRadius: Radius.xl,
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
        borderRadius: Radius.full,
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
        borderRadius: Radius.xl,
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
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
    },
    wardrobeItemActive: {
        borderColor: '#4FC3F7',
        backgroundColor: isDark ? 'rgba(79, 195, 247, 0.1)' : '#FAFAFA',
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
        borderRadius: Radius.md,
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
        borderRadius: Radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalFooter: {
        padding: 16,
        borderTopWidth: 1,
        borderColor: isDark ? '#374151' : '#E2E8F0',
    },
    mainBtn: {
        backgroundColor: '#4FC3F7',
        paddingVertical: 16,
        borderRadius: Radius.lg,
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
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.xl,
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
        color: colors(isDark).text,
    },
    guideText: {
        textAlign: 'center',
        color: colors(isDark).textMuted,
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
        borderRadius: Radius.md,
    },
    closeGuideBtn: {
        backgroundColor: isDark ? '#0F172A' : '#1F2937',
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: Radius.md,
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
        borderRadius: Radius.xl,
    },
    gameCoinDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: Radius.xl,
        gap: 6,
    },
});
