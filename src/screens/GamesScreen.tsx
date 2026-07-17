import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, Modal, useWindowDimensions } from 'react-native';
import { Gamepad2, Trophy, ArrowRight, Dna, Target, Grape, Brain, Bird, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MobileHeader } from '../components/MobileHeader';
import { DailyChallenges } from '../components/games/DailyChallenges';
import { usePoints } from '../contexts/PointsContext';
import { useRewards } from '../contexts/RewardsContext';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';

// Games
import { DinoGame } from '../components/games/DinoGame';
import { DuckHunt } from '../components/games/DuckHunt';
import { FruitCatcher } from '../components/games/FruitCatcher';
import { MemoryGame } from '../components/games/MemoryGame';
import { FlappyBird } from '../components/games/FlappyBird';
import { GameWrapper } from '../components/games/GameWrapper';
import type { GameId } from '../components/games/gameContracts';
import { TierProgressBar } from '../components/ui/TierProgressBar';

const ARCADE_REWARD_GAMES = new Set(['dino', 'duck', 'fruit', 'memory', 'flappy']);

const GAMES = [
    {
        id: 'dino',
        title: 'Dino Run',
        description: 'Corre y salta obstáculos en este clásico infinito.',
        icon: <Dna size={32} color="#fff" />,
        color: ['#8B5CF6', '#6D28D9'],
        image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60',
        component: DinoGame
    },
    {
        id: 'duck',
        title: 'Duck Hunt',
        description: 'Pon a prueba tu puntería y velocidad.',
        icon: <Target size={32} color="#fff" />,
        color: ['#F59E0B', '#D97706'],
        image: 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=800&auto=format&fit=crop&q=60',
        component: DuckHunt
    },
    {
        id: 'fruit',
        title: 'Fruit Catcher',
        description: 'Atrapa frutas y evita las bombas.',
        icon: <Grape size={32} color="#fff" />,
        color: ['#EC4899', '#DB2777'],
        image: 'https://images.unsplash.com/photo-1619623832870-17e94f31cfa7?w=800&auto=format&fit=crop&q=60',
        component: FruitCatcher
    },
    {
        id: 'memory',
        title: 'Memory Game',
        description: 'Ejercita tu memoria encontrando pares.',
        icon: <Brain size={32} color="#fff" />,
        color: ['#10B981', '#059669'],
        image: 'https://images.unsplash.com/photo-1626084996923-a12803893345?w=800&auto=format&fit=crop&q=60',
        component: MemoryGame
    },
    {
        id: 'flappy',
        title: 'Flappy Bird',
        description: 'Vuela y esquiva los tubos sin chocar.',
        icon: <Bird size={32} color="#fff" />,
        color: ['#0EA5E9', '#0284C7'],
        image: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=800&auto=format&fit=crop&q=60',
        component: FlappyBird
    }
];

export default function GamesScreen() {
    const { width } = useWindowDimensions();
    const { points } = usePoints();
    const { registerArcadeReward, getArcadeStatus, gameCoins, addGameCoins, spendGameCoins } = useRewards();
    const navigation = useNavigation<any>();
    const [activeGame, setActiveGame] = useState<string | null>(null);
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const rewardArcadeGame = (gameId: string, score: number) => {
        if (!ARCADE_REWARD_GAMES.has(gameId)) {
            return;
        }
        const coins = Math.floor(score / 5);
        if (coins > 0) addGameCoins(coins);
        const outcome = registerArcadeReward(gameId, score);
        if (outcome.status === 'awarded') {
            show(
                coins > 0
                    ? `${outcome.message} (+${coins} monedas)`
                    : outcome.message,
                'success',
            );
        } else if (outcome.status !== 'error') {
            show(
                coins > 0 ? `+${coins} monedas. ${outcome.message}` : outcome.message,
                'info',
            );
        }
    };

    const handlePlay = (gameId: string) => {
        if (ARCADE_REWARD_GAMES.has(gameId)) {
            const arcade = getArcadeStatus();
            if (arcade.remaining <= 0) {
                show('Has usado tus 3 recompensas de Arcade por hoy. Vuelve mañana.', 'warning');
                return;
            }
        }
        setActiveGame(gameId);
    };

    const handleCloseGame = () => {
        setActiveGame(null);
    };

    const renderActiveGame = () => {
        const game = GAMES.find(g => g.id === activeGame);
        if (!game) return null;

        const GameComponent = game.component as any;
        const gameId = game.id as GameId;

        return (
            <Modal animationType="slide" visible={!!activeGame} onRequestClose={handleCloseGame}>
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.gameWrapper}>
                        <GameWrapper
                            gameId={gameId}
                            GameComponent={GameComponent}
                            coins={0}
                            onClose={handleCloseGame}
                            onLegacyGameEnd={(value: number) => {
                                if (ARCADE_REWARD_GAMES.has(game.id)) rewardArcadeGame(game.id, value);
                            }}
                            gameProps={{}}
                        />
                    </View>
                </SafeAreaView>
            </Modal>
        );
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Game Center"
                showSearch={false}
                rightElement={
                    <View style={styles.pointsBadge}>
                        <Trophy size={16} color="#F59E0B" fill="#F59E0B" />
                        <Text style={styles.pointsText}>{points}</Text>
                    </View>
                }
            />

            <ScrollView contentContainerStyle={styles.content}>
                {/* Hero Section */}
                <View style={styles.heroSection}>
                    <Text style={styles.heroTitle}>Juega y Gana</Text>
                    <Text style={styles.heroSubtitle}>Compite por premios exclusivos</Text>
                </View>

                {/* Tier Progress */}
                <View style={styles.section}>
                    <TierProgressBar />
                </View>

                {/* Daily Challenges */}
                <View style={styles.section}>
                    <DailyChallenges />
                </View>

                {/* Access to Pet */}
                <TouchableOpacity
                    style={styles.petCard}
                    onPress={() => navigation.navigate('MiMascota')}
                >
                    <LinearGradient
                        colors={['#8B5CF6', '#7C3AED']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.petGradient}
                    >
                        <View style={styles.petContent}>
                            <View>
                                <Text style={styles.petTitle}>Mi Mascota</Text>
                                <Text style={styles.petSubtitle}>Cuida a tu compañero y gana monedas</Text>
                            </View>
                            <Text style={{ fontSize: 32 }}>😺</Text>
                        </View>
                    </LinearGradient>
                </TouchableOpacity>

                {/* Games Grid */}
                <Text style={styles.gridTitle}>Catálogo de Juegos</Text>
                <View style={styles.grid}>
                    {GAMES.map((game) => (
                        <TouchableOpacity
                            key={game.id}
                            style={styles.gameCard}
                            onPress={() => handlePlay(game.id)}
                            activeOpacity={0.9}
                        >
                            <ImageBackground
                                source={{ uri: game.image }}
                                style={styles.gameBg}
                                imageStyle={{ borderRadius: 16 }}
                            >
                                <LinearGradient
                                    colors={['transparent', 'rgba(0,0,0,0.9)']}
                                    style={styles.gameOverlay}
                                >
                                    <View style={[styles.gameIcon, { backgroundColor: game.color[0] }]}>
                                        {game.icon}
                                    </View>
                                    <View>
                                        <Text style={styles.gameTitle}>{game.title}</Text>
                                        <Text style={[styles.gameDesc, { maxWidth: width * 0.5 }]} numberOfLines={2}>
                                            {game.description}
                                        </Text>
                                    </View>
                                    <TouchableOpacity style={[styles.playButton, { backgroundColor: game.color[0] }]}>
                                        <Text style={styles.playText}>Jugar</Text>
                                        <ArrowRight size={14} color="#fff" />
                                    </TouchableOpacity>
                                </LinearGradient>
                            </ImageBackground>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Game Modal */}
            {renderActiveGame()}

        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#09090B' : '#FAFAFA',
    },
    content: {
        padding: 16,
    },
    pointsBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    pointsText: {
        color: isDark ? '#F59E0B' : '#B45309',
        fontWeight: 'bold',
        fontSize: 14,
    },
    heroSection: {
        marginBottom: 24,
    },
    heroTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
        marginBottom: 4,
    },
    heroSubtitle: {
        fontSize: 16,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    section: {
        marginBottom: 32,
    },
    gridTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: isDark ? '#F9FAFB' : '#111827',
        marginBottom: 16,
    },
    grid: {
        gap: 16,
    },
    gameCard: {
        height: 160,
        borderRadius: 16,
        marginBottom: 16,
        // Basic shadow for light mode
        shadowColor: isDark ? 'transparent' : '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    gameBg: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    gameOverlay: {
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        borderRadius: 16,
        height: '100%',
        justifyContent: 'flex-end', // Fallback
        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.7)',
    },
    gameIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gameTitle: {
        color: '#fff', // Always white due to overlay
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    gameDesc: {
        color: '#D1D5DB', // Light gray on dark overlay
        fontSize: 12,
    },
    playButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginLeft: 'auto',
    },
    playText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    petCard: {
        marginBottom: 24,
        borderRadius: 16,
        overflow: 'hidden',
    },
    petGradient: {
        padding: 20,
    },
    petContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    petTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    petSubtitle: {
        fontSize: 14,
        color: '#E9D5FF',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: isDark ? '#000' : '#fff', // Game modal might want dark always, but flexible
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: isDark ? '#000' : '#fff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#333' : '#E5E7EB',
    },
    closeBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: isDark ? '#333' : '#F3F4F6',
    },
    modalTitle: {
        color: isDark ? '#fff' : '#000',
        fontSize: 18,
        fontWeight: 'bold',
    },
    gameWrapper: {
        flex: 1,
        backgroundColor: '#111', // Games are likely dark themed by default
        justifyContent: 'center',
        padding: 16,
    },
});
