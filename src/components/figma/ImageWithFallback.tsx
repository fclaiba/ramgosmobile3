import React, { useEffect, useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export const ImageWithFallback = ({ src, style, className, ...props }: any) => {
    const isInvalidSrc = (url: any) => {
        if (!url || typeof url !== 'string') return true;
        if (url.startsWith('blob:') || url.startsWith('file:')) return true;
        return false;
    };

    const isInvalid = isInvalidSrc(src);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        setLoadError(false);
    }, [src]);

    const hasError = isInvalid || loadError;
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <View style={[styles.container, style]}>
            <Image
                source={hasError ? undefined : { uri: src }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                onError={() => setLoadError(true)}
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
