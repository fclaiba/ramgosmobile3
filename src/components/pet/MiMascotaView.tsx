import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, Image, ImageBackground, Platform } from 'react-native';
import { Heart, Utensils, Zap, Sparkles, Moon, Play, Coins, ArrowRight, Trophy, Gamepad2, Info, Check, Shirt, HelpCircle, X, Droplets, Egg } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
    withDelay,
    interpolate,
    FadeInDown,
    FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
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
import { coinsForScore, isRewardGame } from '../games/arcadeRewards';
import { Radius, colors, Motion } from '../../theme/tokens';


// Parte 0 (contrato): tipos/tokens para wrapper compartido (sin refactor aún).
// Ver `src/components/games/gameContracts.ts` y `src/components/games/GAME_CONTRACT.md`.

const { width } = Dimensions.get('window');

// --- Types ---
interface PetStats {
    happiness: number;
    hunger: number;
    energy: number;
    /** Baja sola con el tiempo; si queda baja, acelera la caída de felicidad. */
    hygiene: number;
    level: number;
    exp: number;
}

type PetMood = 'happy' | 'normal' | 'sad' | 'sleeping' | 'playing' | 'eating' | 'dirty' | 'hungry';

/** Lo que dice la burbuja de estado. Nombra la necesidad, no un ánimo vago:
 *  "Con hambre" le dice al usuario qué botón tocar; "Normal" no dice nada. */
const MOOD_LABEL: Record<PetMood, string> = {
    happy: 'Muy Feliz',
    normal: 'Normal',
    sad: 'Triste',
    sleeping: 'Con sueño',
    playing: 'Jugando',
    eating: 'Comiendo',
    dirty: 'Sucio',
    hungry: 'Con hambre',
};
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

/**
 * Partículas del "crack" del huevo: ángulo/distancia/emoji fijos (no
 * `Math.random()` en cada render) repartidos en círculo. Una sola shared
 * value (`hatchBurst`, 0→1) las mueve a todas — cada partícula sólo aporta
 * su propio ángulo/distancia a la interpolación, así no hace falta crear
 * una shared value por partícula. Emojis + colores toman la paleta festiva
 * ya usada en `PaymentSuccessBurst` mezclada con los ámbares del huevo.
 */
const HATCH_PARTICLE_COUNT = 10;
const HATCH_PARTICLE_EMOJIS = ['✨', '🎉', '🥚', '⭐'];
const HATCH_PARTICLE_COLORS = ['#F59E0B', '#FCD34D', '#34D399', '#F472B6'];
const HATCH_PARTICLES = Array.from({ length: HATCH_PARTICLE_COUNT }, (_, i) => {
    const angle = (i / HATCH_PARTICLE_COUNT) * Math.PI * 2;
    return {
        angle,
        distance: 70 + (i % 3) * 18,
        emoji: HATCH_PARTICLE_EMOJIS[i % HATCH_PARTICLE_EMOJIS.length],
        color: HATCH_PARTICLE_COLORS[i % HATCH_PARTICLE_COLORS.length],
        rotate: (i % 2 === 0 ? 1 : -1) * 180,
    };
});

/**
 * Una partícula del "crack": interpola su propia posición/opacidad/rotación
 * a partir del único driver `progress` (0→1) que le pasa el padre — así el
 * `useAnimatedStyle` de cada partícula vive en su propio componente (reglas
 * de hooks) en vez de en un loop dentro de `MiMascotaView`.
 */
function HatchParticle({
    particle,
    progress,
}: {
    particle: (typeof HATCH_PARTICLES)[number];
    progress: any;
}) {
    const style = useAnimatedStyle(() => {
        const p = progress.value;
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cúbico
        const dist = eased * particle.distance;
        return {
            opacity: interpolate(p, [0, 0.15, 0.7, 1], [0, 1, 1, 0]),
            transform: [
                { translateX: Math.cos(particle.angle) * dist },
                { translateY: Math.sin(particle.angle) * dist },
                { scale: interpolate(p, [0, 0.2, 1], [0.3, 1, 0.7]) },
                { rotate: `${p * particle.rotate}deg` },
            ],
        };
    });
    return (
        <Animated.Text style={[hatchParticleStyle, style, { color: particle.color }]}>
            {particle.emoji}
        </Animated.Text>
    );
}

const hatchParticleStyle = {
    position: 'absolute' as const,
    fontSize: 20,
};

export function MiMascotaView({ navigation }: any) {
    const {
        convertCoinsToPoints,
        conversionRate,
        gameCoins,
        petStats,
        petConfig: economyPetConfig,
        eggProgress,
        eggReady,
        primaryNeed,
        feedPet,
        sleepPet: sleepPetRemote,
        cleanPet: cleanPetRemote,
        playPet: playPetRemote,
        openEgg,
        addGameCoins,
        updatePetState,
    } = usePoints();
    const { registerArcadeReward, unlockAccessory, equipAccessory, getPetCareStatus } = useRewards();
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
    }, [petStats.happiness, petStats.hunger, petStats.energy, petStats.hygiene, petStats.level, petStats.exp]);
    const petStage = stats.level < 3 ? 'EGG' : stats.level < 8 ? 'BABY' : stats.level < 30 ? 'YOUNG' : 'ADULT';
    const [currentGame, setCurrentGame] = useState<GameType>(null);
    const [petMood, setPetMood] = useState<PetMood>('happy');
    const [isAnimating, setIsAnimating] = useState(false);
    const [catAnimation, setCatAnimation] = useState<string>('idle');
    const [isHatching, setIsHatching] = useState(false);
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

    // El desgaste lo deriva el servidor a partir de timestamps
    // (`convex/economy/petLifecycle.ts`). Acá había un `setInterval` que bajaba
    // los stats sólo en memoria: se perdía al cerrar la pantalla y lo pisaba el
    // siguiente update de Convex, así que cerrar la app congelaba la mascota.

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

    // Humor: la necesidad urgente manda sobre el ánimo general, así el usuario
    // ve QUÉ le falta a la mascota y no sólo que "está triste". `primaryNeed`
    // lo decide el servidor con los mismos umbrales que aplica el desgaste.
    useEffect(() => {
        if (primaryNeed === 'hungry') setPetMood('hungry');
        else if (primaryNeed === 'dirty') setPetMood('dirty');
        else if (primaryNeed === 'sleepy' || stats.energy < 20) setPetMood('sleeping');
        else if (stats.happiness > 70 && stats.hunger > 50) setPetMood('happy');
        else if (stats.happiness < 30) setPetMood('sad');
        else setPetMood('normal');
    }, [stats, primaryNeed]);

    // --- Animation ---
    const catScale = useSharedValue(1);
    const catRotate = useSharedValue(0);
    const catY = useSharedValue(0);
    // Destello + anillos + partículas, sólo para la secuencia de eclosión.
    const eggBurstScale = useSharedValue(0);
    const eggBurstOpacity = useSharedValue(0);
    const ring1Scale = useSharedValue(0);
    const ring1Opacity = useSharedValue(0);
    const ring2Scale = useSharedValue(0);
    const ring2Opacity = useSharedValue(0);
    /** Driver 0→1 de las partículas del crack — cada una interpola su propio
     *  ángulo/distancia a partir de este único valor (ver `HATCH_PARTICLES`). */
    const hatchBurst = useSharedValue(0);

    /** Duración total de la secuencia 'hatch' (anticipación + shake + crack),
     *  en ms. Se usa para esperar a que asiente antes de llamar al backend. */
    const HATCH_ANIMATION_MS = 1300;
    // Momento, dentro de esa secuencia, en el que "revienta" el huevo — todo
    // lo demás (rings, partículas, haptic fuerte) se ancla a este offset.
    const HATCH_CRACK_MS = 780;

    const hapticImpact = (style: Haptics.ImpactFeedbackStyle) => {
        if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
    };
    const hapticSuccess = () => {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    };

    const animateCat = (type: 'jump' | 'shake' | 'sleep' | 'idle' | 'hatch') => {
        if (type === 'jump') {
            catY.value = withSequence(withTiming(-20, { duration: 300 }), withTiming(0, { duration: 300 }));
        } else if (type === 'shake') {
            catRotate.value = withSequence(
                withTiming(10, { duration: 100 }),
                withTiming(-10, { duration: 100 }),
                withTiming(10, { duration: 100 }),
                withTiming(0, { duration: 100 })
            );
        } else if (type === 'hatch') {
            // 1) Anticipación: el huevo "respira" antes de temblar.
            catScale.value = withSequence(
                withTiming(1.06, { duration: 120 }),
                withTiming(1, { duration: 120 }),
                withTiming(1.06, { duration: 120 }),
                withTiming(1, { duration: 120 }),
                // 3) Crack: el pop grande, justo cuando arrancan los anillos
                // y las partículas (ver más abajo).
                withDelay(
                    240, // el shake de abajo dura 240ms (240 a 780 total)
                    withSequence(
                        withTiming(1.4, { duration: 180 }),
                        withTiming(0.85, { duration: 120 }),
                        withTiming(1, { duration: 160 })
                    )
                )
            );
            // 2) Shake: tiembla cada vez más fuerte mientras dura la anticipación.
            catRotate.value = withDelay(
                240,
                withSequence(
                    withTiming(-8, { duration: 90 }),
                    withTiming(8, { duration: 90 }),
                    withTiming(-10, { duration: 90 }),
                    withTiming(10, { duration: 90 }),
                    withTiming(-6, { duration: 90 }),
                    withTiming(0, { duration: 90 })
                )
            );

            // Destello central.
            eggBurstScale.value = withDelay(HATCH_CRACK_MS, withTiming(2.4, { duration: 400 }));
            eggBurstOpacity.value = withDelay(
                HATCH_CRACK_MS,
                withSequence(withTiming(0.9, { duration: 100 }), withTiming(0, { duration: 300 }))
            );
            // Dos anillos concéntricos expandiéndose, el segundo un toque
            // más tarde para que se sienta como una onda, no un solo pulso.
            ring1Scale.value = withDelay(HATCH_CRACK_MS, withTiming(3, { duration: 500 }));
            ring1Opacity.value = withDelay(
                HATCH_CRACK_MS,
                withSequence(withTiming(0.8, { duration: 80 }), withTiming(0, { duration: 420 }))
            );
            ring2Scale.value = withDelay(HATCH_CRACK_MS + 120, withTiming(3.4, { duration: 500 }));
            ring2Opacity.value = withDelay(
                HATCH_CRACK_MS + 120,
                withSequence(withTiming(0.6, { duration: 80 }), withTiming(0, { duration: 420 }))
            );
            // Partículas: salen disparadas del centro al mismo tiempo que el pop.
            hatchBurst.value = 0;
            hatchBurst.value = withDelay(HATCH_CRACK_MS, withTiming(1, { duration: 460 }));
        }
    };

    const catStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: catScale.value },
            { rotate: `${catRotate.value}deg` },
            { translateY: catY.value }
        ]
    }));

    const eggBurstStyle = useAnimatedStyle(() => ({
        opacity: eggBurstOpacity.value,
        transform: [{ scale: eggBurstScale.value }],
    }));

    const ring1Style = useAnimatedStyle(() => ({
        opacity: ring1Opacity.value,
        transform: [{ scale: ring1Scale.value }],
    }));

    const ring2Style = useAnimatedStyle(() => ({
        opacity: ring2Opacity.value,
        transform: [{ scale: ring2Scale.value }],
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
            case 'hungry': return '🙀';
            case 'dirty': return '😾';
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
        const bonus = result.pointsAwarded ? ` · +${result.pointsAwarded} pts` : '';
        show(`¡Comida deliciosa! +30 Hambre, +15 XP 🍖${bonus}`, 'success');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);
    };

    const playWithPet = async () => {
        if (gameCoins < 2) return show('Necesitas 2 monedas 🪙', 'error');

        // Sobre el huevo la acción es "dar calor" y sí llama al backend: acelera
        // la incubación. Antes sólo mostraba un toast simpático sin hacer nada,
        // así que cuidar el huevo no servía para nada.
        if (petStage === 'EGG') {
            const result = await playPetRemote();
            if (!result.success) return show(result.message, 'error');
            setIsAnimating(true);
            animateCat('shake');
            show(result.message || 'Le diste calor al huevo 🔥', 'success');
            setTimeout(() => setIsAnimating(false), 1000);
            return;
        }

        if (stats.energy < 15) return show('Está muy cansado 😿', 'error');
        const result = await playPetRemote();
        if (!result.success) return show(result.message, 'error');
        setIsAnimating(true);
        setCatAnimation('playing');
        animateCat('shake');
        show('¡A jugar! +20 Felicidad, +25 XP 😺', 'success');
        setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 1000);
    };

    /**
     * Abre el huevo. La animación corre primero (anticipación + shake +
     * crack con anillos/partículas) y recién cuando termina se llama al
     * backend — así el usuario siempre ve la eclosión completa, en vez de
     * que el huevo cambie de golpe apenas responde Convex. El rebote final
     * de la cría se dispara en un `useEffect` propio, sincronizado con el
     * cambio real de `petStage` (no con la latencia de red).
     */
    const handleOpenEgg = () => {
        if (!eggReady || isHatching) return;
        setIsHatching(true);
        animateCat('hatch');
        hapticImpact(Haptics.ImpactFeedbackStyle.Medium);
        setTimeout(() => hapticImpact(Haptics.ImpactFeedbackStyle.Heavy), HATCH_CRACK_MS);
        setTimeout(async () => {
            const result = await openEgg();
            if (!result.success) {
                setIsHatching(false);
                return show(result.message, 'error');
            }
            show(result.message || '¡Tu mascota nació! 🐣', 'success');
        }, HATCH_ANIMATION_MS);
    };

    // Rebote + haptic de éxito cuando la cría realmente aparece (petStage deja
    // de ser 'EGG'), en vez de atarlo a cuándo respondió la mutation.
    useEffect(() => {
        if (isHatching && petStage !== 'EGG') {
            catScale.value = 0.4;
            catScale.value = withSpring(1, Motion.pressSpring);
            hapticSuccess();
            setIsHatching(false);
        }
    }, [petStage, isHatching]);

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
        show('¡Baño completado! +40 Higiene, +20 XP 🛁', 'success');
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

    /**
     * R Coins que genera la mascota.
     *
     * La pantalla mostraba nivel, EXP y monedas de juego, pero nada de los
     * R Coins —que son los que tienen valor real y los que el usuario quiere
     * ver. Sin esto, cuidar la mascota parecía no dar nada.
     */
    const renderPetRewards = () => {
        const { claimedToday, dailyPoints } = getPetCareStatus();
        return (
            <View style={styles.rewardsCard}>
                <View style={styles.rewardsHeader}>
                    <Trophy size={16} color="#D97706" />
                    <Text style={styles.rewardsTitle}>R Coins de tu mascota</Text>
                </View>
                <View style={styles.rewardsRow}>
                    <Text style={styles.rewardsLabel}>Cuidado diario</Text>
                    <Text style={[styles.rewardsValue, claimedToday && styles.rewardsValueDone]}>
                        {claimedToday ? `✓ +${dailyPoints} hoy` : `+${dailyPoints} disponible`}
                    </Text>
                </View>
                <View style={styles.rewardsRow}>
                    <Text style={styles.rewardsLabel}>Monedas de juego</Text>
                    <Text style={styles.rewardsValue}>{gameCoins}</Text>
                </View>
                <Text style={styles.rewardsHint}>
                    {claimedToday
                        ? 'Ya cobraste el cuidado de hoy. Volvé mañana por los próximos R Coins.'
                        : `Alimentá a tu mascota para ganar ${dailyPoints} R Coins hoy.`}
                </Text>
            </View>
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
                    <Text style={styles.guideText}>
                        El huevo se rompe juntando 100 monedas jugando a los minijuegos del
                        Arcade (darle calor también suma un poco). Estas monedas son las de tu
                        mascota — no tienen nada que ver con los Pts Ramgos, que son otro
                        sistema aparte para descuentos. Al llegar a 100 aparece el botón
                        "Abrir huevo". Después de nacer, tu mascota sube de nivel con la
                        experiencia que gana cada vez que la cuidás.
                    </Text>

                    <View style={styles.stageRow}>
                        <Text style={{ fontSize: 24 }}>🥚</Text>
                        <ArrowRight size={16} color="#9CA3AF" />
                        <Text style={{ fontSize: 24 }}>😺</Text>
                        <ArrowRight size={16} color="#9CA3AF" />
                        <Text style={{ fontSize: 24 }}>😼</Text>
                        <ArrowRight size={16} color="#9CA3AF" />
                        <Text style={{ fontSize: 24 }}>🦁</Text>
                    </View>

                    {/* Los números son de NIVEL, no de días de racha: eso decía
                        antes esta lista y nunca fue cierto — la racha no
                        intervenía en la evolución por ningún lado. */}
                    <View style={styles.reqList}>
                        <Text style={styles.reqItem}>• Huevo: 100 monedas jugando en el Arcade</Text>
                        <Text style={styles.reqItem}>• Bebé: al nacer (nivel 3)</Text>
                        <Text style={styles.reqItem}>• Joven: nivel 8</Text>
                        <Text style={styles.reqItem}>• Adulto: nivel 30</Text>
                    </View>

                    <View style={styles.reqList}>
                        <Text style={styles.reqItem}>
                            🍖 Comer +30 hambre · 🛁 Baño +40 higiene · 💤 Dormir +40 energía
                        </Text>
                        <Text style={styles.reqItem}>
                            Si queda sucia o con hambre, pierde felicidad al doble.
                        </Text>
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
                            const coins = coinsForScore(score);
                            if (coins > 0) addGameCoins(coins);

                            // La lista de juegos con recompensa se comparte con
                            // GamesScreen: acá faltaba `flappy`, así que jugarlo
                            // desde la mascota no acreditaba puntos y desde Game
                            // Center sí.
                            if (isRewardGame(currentGame)) {
                                const result = registerArcadeReward(currentGame, score);
                                if (result.status === 'awarded') show(`+${result.pointsAwarded} Pts Ramgos`);
                            }
                            // Mientras es huevo, estas mismas monedas también suman para
                            // romperlo — decirlo acá evita que parezca que "no contabiliza".
                            show(
                                petStage === 'EGG' && coins > 0
                                    ? `Fin de juego: +${coins} monedas → suman para tu huevo 🥚`
                                    : `Fin de juego: Ganaste ${coins} monedas`
                            );
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
                            <Animated.View pointerEvents="none" style={[styles.hatchRing, ring2Style]} />
                            <Animated.View pointerEvents="none" style={[styles.hatchRing, ring1Style]} />
                            <Animated.View pointerEvents="none" style={[styles.eggBurst, eggBurstStyle]} />
                            {HATCH_PARTICLES.map((particle, i) => (
                                <HatchParticle key={i} particle={particle} progress={hatchBurst} />
                            ))}
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
                                <Text style={styles.bubbleLabel}>{MOOD_LABEL[petMood]}</Text>
                            </View>
                        </View>
                    </LinearGradient>

                    {/* Stats Grid — el huevo no tiene stats que mostrar; en su
                        lugar va la incubación, que es lo único que avanza. */}
                    {petStage === 'EGG' ? (
                        <View style={styles.statsGrid}>
                            {renderProgressBar(eggProgress, '#F59E0B', <Egg size={14} color="#F59E0B" />)}
                            <Text style={styles.eggHint}>
                                {eggReady
                                    ? '¡Tu huevo está listo! Tocá el botón para abrirlo 🥚'
                                    : `Llevás ${eggProgress}/100 monedas para tu huevo. Jugá los minijuegos del Arcade y ganá monedas — cada moneda cuenta acá (dar calor también suma un poco). Esto no tiene nada que ver con los Pts Ramgos.`}
                            </Text>
                            {eggReady && (
                                <TouchableOpacity
                                    style={styles.openEggBtn}
                                    onPress={handleOpenEgg}
                                    disabled={isHatching}
                                >
                                    <Text style={styles.openEggBtnText}>
                                        {isHatching ? 'Abriendo...' : 'Abrir huevo 🥚'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <View style={styles.statsGrid}>
                            {renderProgressBar(stats.happiness, '#EC4899', <Heart size={14} color="#EC4899" fill="#EC4899" />)}
                            {renderProgressBar(stats.hunger, '#F97316', <Utensils size={14} color="#F97316" />)}
                            {renderProgressBar(stats.energy, '#EAB308', <Zap size={14} color="#EAB308" fill="#EAB308" />)}
                            {renderProgressBar(stats.hygiene, '#38BDF8', <Droplets size={14} color="#38BDF8" />)}
                        </View>
                    )}
                </View>

                {/* Evolution Progress */}
                {renderEvolutionTrack()}

                {/* R Coins de la mascota */}
                {renderPetRewards()}

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
    eggBurst: {
        position: 'absolute',
        width: 90,
        height: 90,
        borderRadius: Radius.full,
        backgroundColor: '#FDE68A',
    },
    hatchRing: {
        position: 'absolute',
        width: 90,
        height: 90,
        borderRadius: Radius.full,
        borderWidth: 3,
        borderColor: '#F59E0B',
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
    eggHint: {
        fontSize: 12,
        lineHeight: 17,
        color: isDark ? '#A1A1AA' : '#6B7280',
        textAlign: 'center',
    },
    openEggBtn: {
        backgroundColor: '#F59E0B',
        paddingVertical: 12,
        borderRadius: Radius.lg,
        alignItems: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 3,
    },
    openEggBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
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
    rewardsCard: {
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.lg,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E2E8F0',
        gap: 8,
    },
    rewardsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rewardsTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors(isDark).text,
    },
    rewardsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rewardsLabel: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' },
    rewardsValue: { fontSize: 14, fontWeight: '700', color: '#D97706' },
    rewardsValueDone: { color: '#10B981' },
    rewardsHint: {
        fontSize: 12,
        color: isDark ? '#6B7280' : '#9CA3AF',
        lineHeight: 16,
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
