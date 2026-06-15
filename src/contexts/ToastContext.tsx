import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, runOnJS, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastContextType {
    show: (message: string, type?: ToastType, duration?: number) => void;
    hide: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};

interface ToastProviderProps {
    children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [type, setType] = useState<ToastType>('success');
    const insets = useSafeAreaInsets();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';


    const translateY = useSharedValue(-100);

    const show = useCallback((msg: string, t: ToastType = 'success', duration = 3000) => {
        setMessage(msg);
        setType(t);
        setVisible(true);

        // Reset and Animate In
        translateY.value = withSpring(insets.top + 10, { damping: 20, stiffness: 150, mass: 0.8 });

        // Auto Hide
        if (duration > 0) {
            setTimeout(() => {
                hide();
            }, duration);
        }
    }, [insets.top]);

    const hide = useCallback(() => {
        translateY.value = withTiming(-150, { duration: 300 }, (finished) => {
            if (finished) {
                runOnJS(setVisible)(false);
            }
        });
    }, []);

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle color="#10B981" size={24} fill={isDark ? "rgba(16, 185, 129, 0.2)" : "transparent"} />;
            case 'error': return <AlertCircle color="#EF4444" size={24} fill={isDark ? "rgba(239, 68, 68, 0.2)" : "transparent"} />;
            case 'warning': return <AlertTriangle color="#F59E0B" size={24} fill={isDark ? "rgba(245, 158, 11, 0.2)" : "transparent"} />;
            default: return <Info color="#3B82F6" size={24} fill={isDark ? "rgba(59, 130, 246, 0.2)" : "transparent"} />;
        }
    };

    const getStyles = () => {
        const baseStyle = {
            borderLeftColor: type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : type === 'warning' ? '#F59E0B' : '#3B82F6',
        };
        return baseStyle;
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <ToastContext.Provider value={{ show, hide }}>
            {children}
            {visible && (
                <Animated.View style={[styles.container, animatedStyle, { zIndex: 9999 }]}>
                    <TouchableOpacity onPress={hide} activeOpacity={0.9}>
                        <BlurView
                            intensity={Platform.OS === 'ios' ? 80 : 100}
                            tint={isDark ? 'dark' : 'light'}
                            style={[
                                styles.content,
                                {
                                    backgroundColor: isDark ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                    ...getStyles()
                                }
                            ]}
                        >
                            <View style={styles.iconContainer}>
                                {getIcon()}
                            </View>
                            <View style={styles.textContainer}>
                                <Text style={[styles.title, { color: isDark ? '#FFF' : '#1F2937' }]}>
                                    {type === 'success' ? '¡Éxito!' : type === 'error' ? 'Error' : 'Información'}
                                </Text>
                                <Text style={[styles.message, { color: isDark ? '#D1D5DB' : '#4B5563' }]} numberOfLines={2}>
                                    {message}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={hide} style={styles.closeBtn}>
                                <X size={16} color={isDark ? '#9CA3AF' : '#9CA3AF'} />
                            </TouchableOpacity>
                        </BlurView>
                    </TouchableOpacity>
                </Animated.View>
            )}
        </ToastContext.Provider>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        alignItems: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        width: '100%',
        maxWidth: 400,
        borderWidth: 1,
        borderLeftWidth: 4,
        ...Platform.select({
            web: {
                boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
            },
            default: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
            }
        }),
        overflow: 'hidden', // For BlurView
    },
    iconContainer: {
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontWeight: 'bold',
        fontSize: 14,
        marginBottom: 2,
    },
    message: {
        fontSize: 13,
        lineHeight: 18,
    },
    closeBtn: {
        padding: 4,
        marginLeft: 8,
    }
});
