import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, useWindowDimensions, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Store, Users, Trophy, ArrowRight, Sparkles } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

const SLIDES = [
    {
        id: '1',
        title: 'Bienvenido al Marketplace',
        description: 'Compra y vende productos de forma segura, con escrow y sin complicaciones.',
        icon: Store,
        colors: ['#059669', '#10B981']
    },
    {
        id: '2',
        title: 'Tu Red Social',
        description: 'Conecta con negocios, influencers y amigos en un solo lugar. Sigue tus intereses.',
        icon: Users,
        colors: ['#2563EB', '#3B82F6']
    },
    {
        id: '3',
        title: 'Juega y Gana',
        description: 'Gana recompensas diarias, cuida a tu mascota virtual y obtén beneficios exclusivos.',
        icon: Trophy,
        colors: ['#7C3AED', '#8B5CF6']
    }
];

export default function OnboardingScreen() {
    const { width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const navigation = useNavigation<any>();
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const slidesRef = useRef<FlatList>(null);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        checkOnboardingStatus();
    }, []);

    const checkOnboardingStatus = async () => {
        try {
            const hasOnboarded = await AsyncStorage.getItem('@ramgos/has_onboarded');
            if (hasOnboarded === 'true') {
                navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
            } else {
                setIsChecking(false);
            }
        } catch (error) {
            setIsChecking(false);
        }
    };

    const viewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems[0]) {
            setCurrentIndex(viewableItems[0].index);
        }
    }).current;

    const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const scrollToNext = async () => {
        if (currentIndex < SLIDES.length - 1) {
            slidesRef.current?.scrollToIndex({ index: currentIndex + 1 });
        } else {
            try {
                await AsyncStorage.setItem('@ramgos/has_onboarded', 'true');
                navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
            } catch (error) {
                console.log('Error setting onboarding status:', error);
            }
        }
    };

    if (isChecking) {
        return <View style={{ flex: 1, backgroundColor: isDark ? '#111827' : '#fff' }} />;
    }

    const renderItem = ({ item }: { item: typeof SLIDES[0] }) => {
        const Icon = item.icon;
        return (
            <View style={[styles.slide, { width }]}>
                <LinearGradient
                    colors={item.colors as [string, string]}
                    style={styles.iconContainer}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Icon size={80} color="#fff" />
                    <Sparkles size={24} color="#FBBF24" style={styles.sparkle} />
                </LinearGradient>
                <View style={styles.textContainer}>
                    <Text style={[styles.title, { color: isDark ? '#F9FAFB' : '#111827' }]}>{item.title}</Text>
                    <Text style={[styles.description, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                        {item.description}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#111827' : '#fff' }]}>
            <View style={{ flex: 3 }}>
                <FlatList
                    data={SLIDES}
                    renderItem={renderItem}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    pagingEnabled
                    bounces={false}
                    keyExtractor={(item) => item.id}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                        useNativeDriver: false,
                    })}
                    scrollEventThrottle={32}
                    onViewableItemsChanged={viewableItemsChanged}
                    viewabilityConfig={viewConfig}
                    ref={slidesRef}
                />
            </View>
            <View style={styles.footer}>
                <View style={styles.paginator}>
                    {SLIDES.map((_, i) => {
                        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
                        const dotWidth = scrollX.interpolate({
                            inputRange,
                            outputRange: [10, 20, 10],
                            extrapolate: 'clamp',
                        });
                        const opacity = scrollX.interpolate({
                            inputRange,
                            outputRange: [0.3, 1, 0.3],
                            extrapolate: 'clamp',
                        });
                        return (
                            <Animated.View
                                key={i.toString()}
                                style={[
                                    styles.dot,
                                    {
                                        width: dotWidth,
                                        opacity,
                                        backgroundColor: isDark ? '#8B5CF6' : '#7C3AED',
                                    },
                                ]}
                            />
                        );
                    })}
                </View>
                <TouchableOpacity style={styles.button} onPress={scrollToNext} activeOpacity={0.8}>
                    <LinearGradient
                        colors={['#7C3AED', '#9333EA']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientBtn}
                    >
                        <Text style={styles.buttonText}>
                            {currentIndex === SLIDES.length - 1 ? 'Empezar' : 'Siguiente'}
                        </Text>
                        <ArrowRight size={20} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    slide: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    iconContainer: {
        width: 160,
        height: 160,
        borderRadius: 80,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    sparkle: {
        position: 'absolute',
        top: 20,
        right: 20,
    },
    textContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
    },
    footer: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    paginator: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        height: 40,
    },
    dot: {
        height: 10,
        borderRadius: 5,
        marginHorizontal: 8,
    },
    button: {
        borderRadius: 16,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    gradientBtn: {
        flexDirection: 'row',
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        gap: 8,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
});
