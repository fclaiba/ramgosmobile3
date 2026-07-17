import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { UserPlus, LogIn, UserCircle, Sparkles } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { AuthBackground } from '../components/auth/AuthBackground';
import { useAuth, getAuthDestination } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';

// Social Icons Components
const GoogleIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
);

const FacebookIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#1877F2">
        <Path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </Svg>
);

const AppleIcon = ({ isDark }: { isDark: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={isDark ? "#fff" : "#000"}>
        <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
);

export default function WelcomeScreen({ navigation }: any) {
    const { loginWithSocial, isProcessing, status, user } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const busy = isProcessing || isLoading;

    useEffect(() => {
        if (status === 'authenticated' && user) {
            const destination = getAuthDestination(user) ?? { screen: 'Home' as const };
            const timer = setTimeout(() => {
                navigation.reset({
                    index: 0,
                    routes: [{ name: destination.screen, params: destination.params }],
                });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [status, user, navigation]);

    // Animations
    const iconScale = useRef(new Animated.Value(0)).current;
    const iconRotate = useRef(new Animated.Value(0)).current;
    // Staggered Entrance
    const titleOpacity = useRef(new Animated.Value(0)).current;
    const btn1Opacity = useRef(new Animated.Value(0)).current;
    const btn2Opacity = useRef(new Animated.Value(0)).current;
    const btn3Opacity = useRef(new Animated.Value(0)).current;
    const footerOpacity = useRef(new Animated.Value(0)).current;
    const bottomDecoOpacity = useRef(new Animated.Value(0)).current;

    const sparkleScale = useRef(new Animated.Value(1)).current;
    const supportsNativeDriver = Platform.OS !== 'web';

    useEffect(() => {
        // Master Sequence
        Animated.sequence([
            // 1. Icon Entrance
            Animated.parallel([
                Animated.spring(iconScale, {
                    toValue: 1,
                    friction: 5,
                    useNativeDriver: supportsNativeDriver,
                }),
                Animated.timing(iconRotate, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: supportsNativeDriver,
                }),
            ]),
            // 2. Title & Subtitle
            Animated.timing(titleOpacity, {
                toValue: 1,
                duration: 500,
                useNativeDriver: supportsNativeDriver,
            }),
            // 3. Staggered Buttons
            Animated.stagger(100, [
                Animated.timing(btn1Opacity, { toValue: 1, duration: 400, useNativeDriver: supportsNativeDriver }),
                Animated.timing(btn2Opacity, { toValue: 1, duration: 400, useNativeDriver: supportsNativeDriver }),
                Animated.timing(btn3Opacity, { toValue: 1, duration: 400, useNativeDriver: supportsNativeDriver }),
            ]),
            // 4. Footer & Socials
            Animated.timing(footerOpacity, {
                toValue: 1,
                duration: 500,
                delay: 100,
                useNativeDriver: supportsNativeDriver,
            }),
            // 5. Bottom Decoration
            Animated.timing(bottomDecoOpacity, {
                toValue: 1,
                duration: 500,
                delay: 200,
                useNativeDriver: supportsNativeDriver,
            }),
        ]).start();

        // Sparkle loop
        Animated.loop(
            Animated.sequence([
                Animated.timing(sparkleScale, { toValue: 1.2, duration: 1500, useNativeDriver: supportsNativeDriver }),
                Animated.timing(sparkleScale, { toValue: 1, duration: 1500, useNativeDriver: supportsNativeDriver }),
            ])
        ).start();
    }, []);

    const rotateInterp = iconRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['-180deg', '0deg'],
    });

    const handleSocialLogin = async (provider: Parameters<typeof loginWithSocial>[0]) => {
        if (busy) return;
        setIsLoading(true);
        try {
            const decision = await loginWithSocial(provider);
            const destination = decision.nextRoute ?? { screen: 'Home' as const };
            navigation.reset({ index: 0, routes: [{ name: destination.screen, params: destination.params }] });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'No pudimos iniciar sesión con esa cuenta.';
            show(message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
                    <View style={styles.content}>

                        {/* Card Container */}
                        <View style={styles.card}>
                            {/* Icon Section */}
                            <Animated.View style={[styles.iconContainer, { transform: [{ scale: iconScale }, { rotate: rotateInterp }] }]}>
                                <View style={styles.iconGlowWrapper}>
                                    <LinearGradient
                                        colors={['#8B5CF6', '#9333EA']}
                                        style={styles.iconGlow}
                                    />
                                </View>

                                <LinearGradient
                                    colors={['#8B5CF6', '#9333EA', '#EC4899']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.mainIcon}
                                >
                                    <Image
                                        source={require('../../logo.jpeg')}
                                        style={styles.logoImage}
                                        resizeMode="contain"
                                    />
                                </LinearGradient>

                                <Animated.View style={[styles.sparkle, { transform: [{ scale: sparkleScale }] }]}>
                                    <Sparkles size={24} color="#FBBF24" fill="#FBBF24" />
                                </Animated.View>
                            </Animated.View>

                            {/* Title & Subtitle */}
                            <Animated.View style={{ opacity: titleOpacity, width: '100%', alignItems: 'center', marginBottom: 32 }}>
                                <Text style={styles.title}>Ramgos App</Text>
                                <Text style={styles.subtitle}>
                                    Descubre la oportunidad de conectarte con una comunidad latina latente
                                </Text>
                            </Animated.View>

                            {/* Buttons */}
                            <View style={styles.buttonGroup}>
                                <Animated.View style={{ opacity: btn1Opacity, transform: [{ translateX: btn1Opacity.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }}>
                                    <TouchableOpacity
                                        style={styles.primaryBtn}
                                        onPress={() => navigation.navigate('Register')}
                                        activeOpacity={0.9}
                                    >
                                        <LinearGradient
                                            colors={['#7C3AED', '#9333EA']}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={styles.gradientBtn}
                                        >
                                            <UserPlus size={20} color="#fff" style={{ marginRight: 12 }} />
                                            <Text style={styles.primaryBtnText}>Crear cuenta</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </Animated.View>

                                <Animated.View style={{ opacity: btn2Opacity, transform: [{ translateX: btn2Opacity.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }}>
                                    <TouchableOpacity
                                        style={styles.secondaryBtn}
                                        onPress={() => navigation.navigate('Login')}
                                        activeOpacity={0.8}
                                    >
                                        <LogIn size={20} color="#111827" style={{ marginRight: 12 }} />
                                        <Text style={styles.secondaryBtnText}>Iniciar sesión</Text>
                                    </TouchableOpacity>
                                </Animated.View>

                                <Animated.View style={{ opacity: btn3Opacity, transform: [{ translateX: btn3Opacity.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }}>
                                    <TouchableOpacity
                                        style={styles.ghostBtn}
                                        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                                    >
                                        <UserCircle size={20} color="#6B7280" style={{ marginRight: 12 }} />
                                        <Text style={styles.ghostBtnText}>Continuar como invitado</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </View>

                            {/* Footer & Socials */}
                            <Animated.View style={{ opacity: footerOpacity, width: '100%', alignItems: 'center' }}>

                                <Text style={styles.footerText}>
                                    Al continuar, aceptas nuestros{' '}
                                    <Text style={styles.link} onPress={() => navigation.navigate('Terms')}>Términos</Text>{' '}
                                    y{' '}
                                    <Text style={styles.link} onPress={() => navigation.navigate('Privacy')}>Privacidad</Text>
                                </Text>
                            </Animated.View>
                        </View>

                        {/* Bottom Decoration */}
                        <Animated.View style={[styles.bottomDeco, { opacity: bottomDecoOpacity }]}>
                            <Sparkles size={16} color="#8B5CF6" style={{ marginRight: 8 }} />
                            <Text style={styles.bottomDecoText}>Una experiencia única te espera</Text>
                            <Sparkles size={16} color="#8B5CF6" style={{ marginLeft: 8 }} />
                        </Animated.View>

                    </View>
                </ScrollView>
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 16 },
    content: { alignItems: 'center', justifyContent: 'center' },

    // Card Glass Effect
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.8)',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)',
        ...Platform.select({
            web: {
                boxShadow: isDark ? '0px 10px 20px rgba(0, 0, 0, 0.4)' : '0px 10px 20px rgba(139, 92, 246, 0.1)',
            },
            default: {
                shadowColor: isDark ? '#000' : '#8B5CF6',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.3 : 0.1,
                shadowRadius: 20,
                elevation: 10,
            },
        }),
    },

    // Icon
    iconContainer: { marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
    iconGlowWrapper: { position: 'absolute', width: 100, height: 100 },
    iconGlow: { flex: 1, borderRadius: 30, opacity: 0.5, transform: [{ scale: 1.2 }] },
    mainIcon: { width: 112, height: 112, borderRadius: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: isDark ? '#374151' : '#fff' },
    logoImage: { width: 72, height: 72 },
    sparkle: { position: 'absolute', top: -8, right: -8 },

    // Text
    title: { fontSize: 32, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#7C3AED', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: isDark ? '#D1D5DB' : '#6B7280', textAlign: 'center', paddingHorizontal: 4, lineHeight: 22 },

    // Buttons
    buttonGroup: { width: '100%', gap: 12, marginBottom: 24 },
    primaryBtn: {
        borderRadius: 16,
        ...Platform.select({
            web: { boxShadow: '0px 8px 16px rgba(124, 58, 237, 0.25)' },
            default: {
                shadowColor: '#7C3AED',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
            },
        }),
    },
    gradientBtn: { flexDirection: 'row', height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    secondaryBtn: { flexDirection: 'row', height: 56, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isDark ? '#6D28D9' : '#DDD6FE' },
    secondaryBtnText: { color: isDark ? '#F9FAFB' : '#111827', fontSize: 16, fontWeight: '600' },

    ghostBtn: { flexDirection: 'row', height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    ghostBtnText: { color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 16, fontWeight: '500' },

    // Footer
    divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 24 },
    line: { flex: 1, height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' },
    orText: { marginHorizontal: 12, color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 12 },

    socialRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
    socialBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)', justifyContent: 'center', alignItems: 'center' },

    footerText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#9CA3AF', textAlign: 'center' },
    link: { color: '#7C3AED', fontWeight: '500' },

    // Bottom Deco
    bottomDeco: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
    bottomDecoText: { fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '500' },
});
