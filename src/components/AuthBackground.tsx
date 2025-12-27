import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const AuthBackground = ({ children }: { children: React.ReactNode }) => {
    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#fff', '#F3F4F6', '#EDE9FE']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />
            {/* Shapes */}
            <View style={[styles.shape, styles.shape1]} />
            <View style={[styles.shape, styles.shape2]} />

            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    shape: {
        position: 'absolute',
        borderRadius: 999,
        opacity: 0.4,
    },
    shape1: {
        width: 300,
        height: 300,
        backgroundColor: 'rgba(124, 58, 237, 0.2)', // Voilet
        top: -100,
        right: -50,
    },
    shape2: {
        width: 400,
        height: 400,
        backgroundColor: 'rgba(37, 99, 235, 0.15)', // Blue
        bottom: -150,
        left: -100,
    }
});
