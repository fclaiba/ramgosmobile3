import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export const Avatar = ({ children, style, className }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    
    return (
        <View style={[styles.avatar, style]}>
            {children}
        </View>
    );
};

export const AvatarImage = ({ src, style }: any) => {
    const { colorScheme } = useTheme();
    const [hasError, setHasError] = useState(!src);
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    
    React.useEffect(() => {
        setHasError(!src);
    }, [src]);

    if (hasError) return null;

    return <Image source={{ uri: src }} style={[styles.image, style]} onError={() => setHasError(true)} />;
};

export const AvatarFallback = ({ children }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    
    return (
        <View style={styles.fallback}>
            <Text style={styles.fallbackText}>{children}</Text>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: isDark ? '#4B5563' : '#ccc',
        justifyContent: 'center',
        alignItems: 'center'
    },
    image: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        zIndex: 1
    },
    fallback: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: isDark ? '#374151' : '#e1e1e1'
    },
    fallbackText: {
        fontWeight: 'bold',
        color: isDark ? '#9CA3AF' : '#666'
    }
});
