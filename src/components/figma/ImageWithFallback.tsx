import React, { useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export const ImageWithFallback = ({ src, style, className, ...props }: any) => {
    const [error, setError] = useState(false);
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <View style={[styles.container, style]}>
            <Image
                source={{ uri: error ? 'https://via.placeholder.com/300' : src }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
                onError={() => setError(true)}
                {...props}
            />
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        overflow: 'hidden',
        backgroundColor: isDark ? '#374151' : '#f0f0f0', // Placeholder bg
        width: '100%',
        height: '100%'
    }
});
