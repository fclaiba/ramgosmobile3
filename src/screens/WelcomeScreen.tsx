import React, { useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { UserPlus, LogIn, UserCircle, Sparkles } from 'lucide-react-native';
import { AuthBackground } from '../components/auth/AuthBackground';
import { Logo } from '../components/ui/Logo';
import { useAuth, getAuthDestination } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Radius, colors, Type, Space, Elevation } from '../theme/tokens';
import { Brand } from '../theme/brand';
import { useTranslation } from 'react-i18next';

export default function WelcomeScreen({ navigation }: any) {
    const { status, user } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark, c);
    const { t } = useTranslation(['auth', 'common']);

    useFocusEffect(
        React.useCallback(() => {
            if (status === 'authenticated' && user) {
                const state = navigation.getState();
                if (state && state.routes.length > 1) {
                    return;
                }

                const destination = getAuthDestination(user) ?? { screen: 'Home' as const };
                const timer = setTimeout(() => {
                    navigation.reset({
                        index: 0,
                        routes: [{ name: destination.screen, params: destination.params }],
                    });
                }, 100);
                return () => clearTimeout(timer);
            }
        }, [status, user, navigation])
    );

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
        Animated.parallel([
            // 1. Icon Entrance
            Animated.timing(iconScale, {
                toValue: 1,
                duration: 600,
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
                delay: 200,
                useNativeDriver: supportsNativeDriver,
            }),
            // 5. Bottom Decoration
            Animated.timing(bottomDecoOpacity, {
                toValue: 1,
                duration: 500,
                delay: 300,
                useNativeDriver: supportsNativeDriver,
            }),
        ]).start();
    }, []);

    return (
        <AuthBackground>
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
                    <View style={styles.content}>

                        {/* Glass Card Container */}
                        <View style={styles.card}>
                            {/* Specular rim */}
                            <LinearGradient
                                colors={[c.specularStrong, 'transparent']}
                                start={{ x: 0.5, y: 0 }}
                                end={{ x: 0.5, y: 1 }}
                                style={styles.specularRim}
                            />

                            {/* Logo Section */}
                            <Animated.View style={[styles.iconContainer, { transform: [{ scale: iconScale }] }]}>
                                <Logo height={96} style={styles.logoImage} />
                            </Animated.View>

                            {/* Subtitle */}
                            <Animated.View style={{ opacity: titleOpacity, width: '100%', alignItems: 'center', marginBottom: 32 }}>
                                <Text style={styles.subtitle}>
                                    {t('auth:welcome.subtitle')}
                                </Text>
                            </Animated.View>

                            {/* Buttons */}
                            <View style={styles.buttonGroup}>
                                <Animated.View style={{ opacity: btn1Opacity, transform: [{ translateX: btn1Opacity.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }}>
                                    <TouchableOpacity
                                        style={styles.primaryBtn}
                                        onPress={() => navigation.navigate('SignUp')}
                                        activeOpacity={0.9}
                                    >
                                        <LinearGradient
                                            colors={Brand.gradient}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={styles.gradientBtn}
                                        >
                                            {/* Specular rim on button */}
                                            <LinearGradient
                                                colors={['rgba(255,255,255,0.25)', 'transparent']}
                                                start={{ x: 0.5, y: 0 }}
                                                end={{ x: 0.5, y: 1 }}
                                                style={styles.btnSpecular}
                                            />
                                            <UserPlus size={20} color="#fff" style={{ marginRight: 12 }} />
                                            <Text style={styles.primaryBtnText}>{t('auth:welcome.createAccount')}</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </Animated.View>

                                <Animated.View style={{ opacity: btn2Opacity, transform: [{ translateX: btn2Opacity.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }}>
                                    <TouchableOpacity
                                        style={styles.secondaryBtn}
                                        onPress={() => navigation.navigate('Login')}
                                        activeOpacity={0.8}
                                    >
                                        <LogIn size={20} color={c.text} style={{ marginRight: 12 }} />
                                        <Text style={styles.secondaryBtnText}>{t('auth:welcome.signIn')}</Text>
                                    </TouchableOpacity>
                                </Animated.View>

                                <Animated.View style={{ opacity: btn3Opacity, transform: [{ translateX: btn3Opacity.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }}>
                                    <TouchableOpacity
                                        style={styles.ghostBtn}
                                        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                                    >
                                        <UserCircle size={20} color={c.textMuted} style={{ marginRight: 12 }} />
                                        <Text style={styles.ghostBtnText}>{t('auth:welcome.continueGuest')}</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </View>

                            {/* Footer */}
                            <Animated.View style={{ opacity: footerOpacity, width: '100%', alignItems: 'center' }}>
                                <Text style={styles.footerText}>
                                    {t('auth:welcome.termsPrefix')}{' '}
                                    <Text style={styles.link} onPress={() => navigation.navigate('Terms')}>{t('auth:welcome.terms')}</Text>{' '}
                                    y{' '}
                                    <Text style={styles.link} onPress={() => navigation.navigate('Privacy')}>{t('auth:welcome.privacy')}</Text>
                                </Text>
                            </Animated.View>
                        </View>

                        {/* Bottom Decoration */}
                        <Animated.View style={[styles.bottomDeco, { opacity: bottomDecoOpacity }]}>
                            <Sparkles size={16} color={Brand.primaryLight} style={{ marginRight: 8 }} />
                            <Text style={styles.bottomDecoText}>{t('auth:welcome.bottomDeco')}</Text>
                            <Sparkles size={16} color={Brand.primaryLight} style={{ marginLeft: 8 }} />
                        </Animated.View>

                    </View>
                </ScrollView>
            </SafeAreaView>
        </AuthBackground>
    );
}

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) => StyleSheet.create({
    container: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: Space[4] },
    content: { alignItems: 'center', justifyContent: 'center' },

    // Glass card
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: isDark ? 'rgba(12,12,14,0.85)' : 'rgba(255, 255, 255, 0.82)',
        borderRadius: Radius['2xl'],
        padding: 32,
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.glassBorder,
        overflow: 'hidden',
        ...Elevation[3](isDark),
        ...(Platform.OS === 'web'
            ? ({
                  backdropFilter: 'blur(24px) saturate(1.35)',
                  WebkitBackdropFilter: 'blur(24px) saturate(1.35)',
              } as any)
            : {}),
    },
    specularRim: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 8,
        zIndex: 0,
    },

    // Logo
    iconContainer: { marginBottom: 24, alignItems: 'center', justifyContent: 'center', width: '100%' },
    // El ancho lo calcula `Logo` a partir del alto y del aspecto real del
    // archivo; acá sólo se centra.
    logoImage: { alignSelf: 'center' },

    // Text
    subtitle: { ...Type.body, color: c.textMuted, textAlign: 'center', paddingHorizontal: 4 },

    // Buttons
    buttonGroup: { width: '100%', gap: 12, marginBottom: 24 },
    primaryBtn: {
        borderRadius: Radius.lg,
        overflow: 'hidden',
        shadowColor: Brand.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.30,
        shadowRadius: 14,
        elevation: 6,
    },
    gradientBtn: {
        flexDirection: 'row',
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.lg,
        overflow: 'hidden',
    },
    btnSpecular: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 6,
    },
    primaryBtnText: { color: '#fff', ...Type.body, fontWeight: '700' },

    secondaryBtn: {
        flexDirection: 'row',
        height: 56,
        backgroundColor: c.surface2,
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: isDark ? 'rgba(33,150,243,0.25)' : 'rgba(33,150,243,0.15)',
        ...(Platform.OS === 'web'
            ? ({
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
              } as any)
            : {}),
    },
    secondaryBtnText: { color: c.text, ...Type.body, fontWeight: '600' },

    ghostBtn: {
        flexDirection: 'row',
        height: 56,
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ghostBtnText: { color: c.textMuted, ...Type.body, fontWeight: '500' },

    footerText: { ...Type.caption, color: c.textSubtle, textAlign: 'center' },
    link: { color: Brand.primary, fontWeight: '600' },

    // Bottom Deco
    bottomDeco: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
    bottomDecoText: { ...Type.bodySm, color: c.textMuted, fontWeight: '500' },
});
