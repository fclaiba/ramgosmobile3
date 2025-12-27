import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

export const Avatar = ({ children, style, className }: any) => {
    return (
        <View style={[styles.avatar, style]}>
            {children}
        </View>
    );
};

export const AvatarImage = ({ src, style }: any) => {
    return <Image source={{ uri: src }} style={[styles.image, style]} />;
};

export const AvatarFallback = ({ children }: any) => {
    // Si hay una imagen cargada encima, esto no se ve, pero idealmente se maneja con estado
    // Simplificado: mostramos fallback si no hay imagen (no implementado detección de error aquí para simpleza extrema si renderizo ambos)
    // En RN, la imagen opaca tapará esto si la pongo absolute.
    return (
        <View style={styles.fallback}>
            <Text style={styles.fallbackText}>{children}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#ccc',
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
        backgroundColor: '#e1e1e1'
    },
    fallbackText: {
        fontWeight: 'bold',
        color: '#666'
    }
});
