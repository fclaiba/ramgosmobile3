import React, { useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';

export const ImageWithFallback = ({ src, style, className, ...props }: any) => {
    const [error, setError] = useState(false);

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

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        backgroundColor: '#f0f0f0', // Placeholder bg
        width: '100%',
        height: '100%'
    }
});
