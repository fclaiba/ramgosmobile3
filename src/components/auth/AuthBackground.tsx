import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

import { useTheme } from '../../contexts/ThemeContext';

export const AuthBackground = ({ children }: { children: React.ReactNode }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    // Animation values
    const blob1Anim = useRef(new Animated.Value(0)).current;
    const blob2Anim = useRef(new Animated.Value(0)).current;
    const blob3Anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const createAnimation = (animValue: Animated.Value, duration: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.timing(animValue, {
                        toValue: 1,
                        duration: duration,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                    Animated.timing(animValue, {
                        toValue: 0,
                        duration: duration,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                ])
            );
        };

        createAnimation(blob1Anim, 8000).start();
        createAnimation(blob2Anim, 10000).start();
        createAnimation(blob3Anim, 12000).start();
    }, []);

    const blob1Scale = blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
    const blob1Opacity = blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.5] });

    const blob2Scale = blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [1.2, 1] });
    const blob2Opacity = blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.3] });

    const blob3Scale = blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
    const blob3Opacity = blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.6] });

    // Dynamic Colors
    const gradientColors = isDark
        ? ['#111827', '#1F2937', '#0F172A'] // Dark gray/blue gradient
        : ['#F3E8FF', '#FAF5FF', '#FCE7F3']; // Original light gradient

    const blob1Color = isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(167, 139, 250, 0.2)';
    const blob2Color = isDark ? 'rgba(124, 58, 237, 0.15)' : 'rgba(192, 132, 252, 0.2)';
    const blob3Color = isDark ? 'rgba(236, 72, 153, 0.15)' : 'rgba(244, 114, 182, 0.2)';

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={gradientColors as any}
                style={StyleSheet.absoluteFill}
            />

            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}>
                {/* Blob 1 - Top Left */}
                <Animated.View
                    style={[
                        styles.blob,
                        {
                            top: 80, left: 40,
                            backgroundColor: blob1Color,
                            transform: [{ scale: blob1Scale }],
                            opacity: blob1Opacity,
                            width: 288, height: 288, // w-72 h-72
                        }
                    ]}
                />

                {/* Blob 2 - Bottom Right */}
                <Animated.View
                    style={[
                        styles.blob,
                        {
                            bottom: 80, right: 40,
                            backgroundColor: blob2Color,
                            transform: [{ scale: blob2Scale }],
                            opacity: blob2Opacity,
                            width: 384, height: 384, // w-96 h-96
                        }
                    ]}
                />

                {/* Blob 3 - Center */}
                <Animated.View
                    style={[
                        styles.blob,
                        {
                            top: height / 2 - 160, left: width / 2 - 160,
                            backgroundColor: blob3Color,
                            transform: [{ scale: blob3Scale }],
                            opacity: blob3Opacity,
                            width: 320, height: 320, // w-80 h-80
                        }
                    ]}
                />
            </View>

            <View style={styles.content}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    blob: {
        position: 'absolute',
        borderRadius: 9999,
        // blurRadius not fully supported on plain Views in Android without distinct library, 
        // using opacity/color simulation instead or could use expo-blur if needed but opacity works for "glow"
    },
    content: {
        flex: 1,
    }
});
