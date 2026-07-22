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
import { glassShadow, Radius, colors } from '../theme/tokens';


// Social Icons Components
import { GoogleIcon, AppleIcon } from '../components/ui/SocialIcons';

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
    const titleOpacity = useRef(new Animated.Value(0)).current;
    const btn1Opacity = useRef(new Animated.Value(0)).current;
    const btn2Opacity = useRef(new Animated.Value(0)).current;
    const btn3Opacity = useRef(new Animated.Value(0)).current;
    const footerOpacity = useRef(new Animated.Value(0)).current;
    const bottomDecoOpacity = useRef(new Animated.Value(0)).current;
    const supportsNativeDriver = Platform.OS !== 'web';

    useEffect(() => {
        // Master Sequence
        Animated.sequence([
            // 1. Icon Entrance
            Animated.spring(iconScale, {
                toValue: 1,
                friction: 5,
                useNativeDriver: supportsNativeDriver,
            }),
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
    }, []);

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
                            {/* Logo Section */}
                            <Animated.View style={[styles.iconContainer, { transform: [{ scale: iconScale }] }]}>
                                <Image
                                    source={require('../../logo.png')}
                                    style={styles.logoImage}
                                    resizeMode="contain"
                                />
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
                                            colors={['#2196F3', '#29B6F6']}
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
                            <Sparkles size={16} color="#4FC3F7" style={{ marginRight: 8 }} />
                            <Text style={styles.bottomDecoText}>Una experiencia única te espera</Text>
                            <Sparkles size={16} color="#4FC3F7" style={{ marginLeft: 8 }} />
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
        borderRadius: Radius.xl,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(79, 195, 247, 0.3)' : 'rgba(79, 195, 247, 0.2)',
        ...Platform.select({
            web: {
                boxShadow: isDark ? '0px 10px 20px rgba(0, 0, 0, 0.4)' : '0px 10px 20px rgba(79, 195, 247, 0.1)',
            },
            default: {
                ...glassShadow(isDark),
            },
        }),
    },

    // Icon
    iconContainer: { marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
    logoImage: { width: 280, height: 96 },

    // Text
    title: { fontSize: 32, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#2196F3', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: colors(isDark).textMuted, textAlign: 'center', paddingHorizontal: 4, lineHeight: 22 },

    // Buttons
    buttonGroup: { width: '100%', gap: 12, marginBottom: 24 },
    primaryBtn: {
        borderRadius: Radius.lg,
        ...Platform.select({
            web: { boxShadow: '0px 8px 16px rgba(33, 150, 243, 0.25)' },
            default: {
                ...glassShadow(isDark),
            },
        }),
    },
    gradientBtn: { flexDirection: 'row', height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    secondaryBtn: { flexDirection: 'row', height: 56, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isDark ? '#1565C0' : '#DDD6FE' },
    secondaryBtnText: { color: colors(isDark).text, fontSize: 16, fontWeight: '600' },

    ghostBtn: { flexDirection: 'row', height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
    ghostBtnText: { color: colors(isDark).textMuted, fontSize: 16, fontWeight: '500' },

    // Footer
    divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 24 },
    line: { flex: 1, height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' },
    orText: { marginHorizontal: 12, color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 12 },

    socialRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
    socialBtn: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', justifyContent: 'center', alignItems: 'center' },

    footerText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#9CA3AF', textAlign: 'center' },
    link: { color: '#2196F3', fontWeight: '500' },

    // Bottom Deco
    bottomDeco: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
    bottomDecoText: { fontSize: 14, color: colors(isDark).textMuted, fontWeight: '500' },
});
