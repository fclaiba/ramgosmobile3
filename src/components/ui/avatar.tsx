import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';
import { Brand } from '../../theme/brand';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<AvatarSize, number> = {
    sm: 32,
    md: 40,
    lg: 56,
    xl: 80,
};

const FONT_MAP: Record<AvatarSize, number> = {
    sm: 12,
    md: 14,
    lg: 20,
    xl: 28,
};

type StatusType = 'online' | 'away' | 'offline' | 'none';

const STATUS_COLORS: Record<Exclude<StatusType, 'none'>, string> = {
    online: Brand.success,
    away: Brand.warning,
    offline: '#71717A',
};

export const Avatar = ({ children, style, className, size = 'md' as AvatarSize, status }: {
    children: React.ReactNode;
    style?: any;
    className?: string;
    size?: AvatarSize;
    status?: StatusType;
}) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const dim = SIZE_MAP[size];
    const statusDot = status && status !== 'none' ? STATUS_COLORS[status] : null;

    return (
        <View style={[
            styles.container,
            { width: dim + 4, height: dim + 4 },
            style,
        ]}>
            {/* Glass ring */}
            <View style={[
                styles.ring,
                {
                    width: dim + 4,
                    height: dim + 4,
                    borderRadius: (dim + 4) / 2,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                },
            ]} />
            {/* Avatar content */}
            <View style={[
                styles.avatar,
                {
                    width: dim,
                    height: dim,
                    borderRadius: dim / 2,
                    backgroundColor: c.surface2,
                },
            ]}>
                {children}
            </View>
            {/* Status indicator */}
            {statusDot && (
                <View style={[
                    styles.status,
                    {
                        backgroundColor: statusDot,
                        width: size === 'sm' ? 8 : size === 'xl' ? 16 : 12,
                        height: size === 'sm' ? 8 : size === 'xl' ? 16 : 12,
                        borderRadius: 999,
                        borderColor: c.bg,
                    },
                ]} />
            )}
        </View>
    );
};

export const AvatarImage = ({ src, style }: any) => {
    const [hasError, setHasError] = useState(!src);

    React.useEffect(() => {
        setHasError(!src);
    }, [src]);

    if (hasError) return null;

    return <Image source={{ uri: src }} style={[styles.image, style]} onError={() => setHasError(true)} />;
};

export const AvatarFallback = ({ children, size = 'md' as AvatarSize }: { children: React.ReactNode; size?: AvatarSize }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const fontSize = FONT_MAP[size];

    return (
        <View style={[styles.fallback, { backgroundColor: isDark ? c.surface3 : c.surface2 }]}>
            <Text style={[styles.fallbackText, { color: c.textMuted, fontSize }]}>{children}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ring: {
        position: 'absolute',
        borderWidth: 2,
    },
    avatar: {
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        zIndex: 1,
    },
    fallback: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        fontWeight: '700',
    },
    status: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        borderWidth: 2,
        zIndex: 2,
    },
});
