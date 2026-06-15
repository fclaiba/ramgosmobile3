import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, Sparkles } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withRepeat, withSequence } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';

interface SocialAuthCompleteScreenProps {
    route: {
        params: {
            provider: 'google' | 'facebook' | 'apple';
        };
    };
}

export const SocialAuthCompleteScreen = ({ route }: SocialAuthCompleteScreenProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const provider = route?.params?.provider || 'google';
    const navigation = useNavigation<any>();
    const [isLoading, setIsLoading] = useState(true);

    // Animations
    const scale = useSharedValue(0.9);
    const opacity = useSharedValue(0);
    const iconScale = useSharedValue(0);

    useEffect(() => {
        // Entrance animation
        opacity.value = withTiming(1, { duration: 500 });
        scale.value = withSpring(1);

        // Simulate auth check
        const timer = setTimeout(() => {
            setIsLoading(false);
            iconScale.value = withSpring(1);
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    const getProviderInfo = () => {
        switch (provider) {
            case 'google':
                return { name: 'Google', colors: ['#4285F4', '#34A853'] };
            case 'facebook':
                return { name: 'Facebook', colors: ['#1877F2', '#0C5DC7'] };
            case 'apple':
                return { name: 'Apple', colors: ['#000000', '#333333'] };
            default:
                return { name: 'Social', colors: ['#8B5CF6', '#EC4899'] };
        }
    };

    const info = getProviderInfo();

    const containerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    const iconStyle = useAnimatedStyle(() => ({
        transform: [{ scale: iconScale.value }],
    }));

    const handleContinue = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
        });
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#F3F4F6', '#E5E7EB']} style={StyleSheet.absoluteFill} />

            <Animated.View style={[styles.card, containerStyle]}>
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <View style={styles.spinner}>
                            {/* Simple spinner placeholder */}
                            <Text style={{ fontSize: 30 }}>↻</Text>
                        </View>
                        <Text style={styles.title}>Conectando con {info.name}</Text>
                        <Text style={styles.subtitle}>Validando tu cuenta...</Text>
                    </View>
                ) : (
                    <View style={styles.successContainer}>
                        <Animated.View style={[styles.iconWrapper, iconStyle]}>
                            <CheckCircle2 size={48} color="#22C55E" />
                        </Animated.View>
                        <Text style={styles.title}>¡Cuenta vinculada!</Text>
                        <Text style={styles.subtitle}>Tu cuenta ha sido vinculada exitosamente</Text>

                        <TouchableOpacity onPress={handleContinue} style={styles.button}>
                            <LinearGradient colors={info.colors as [string, string]} style={styles.gradientButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                <Sparkles size={20} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.buttonText}>Continuar</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </Animated.View>
        </View>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 340, backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 24, padding: 32, alignItems: 'center', shadowColor: isDark ? '#F9FAFB' : '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
    loadingContainer: { alignItems: 'center' },
    spinner: { marginBottom: 20 },
    successContainer: { alignItems: 'center', width: '100%' },
    iconWrapper: { marginBottom: 20, padding: 16, backgroundColor: '#DCFCE7', borderRadius: 50 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280', marginBottom: 24, textAlign: 'center' },
    button: { width: '100%', borderRadius: 16, overflow: 'hidden' },
    gradientButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
    buttonText: { color: isDark ? '#1F2937' : '#fff', fontSize: 16, fontWeight: '600' },
});
