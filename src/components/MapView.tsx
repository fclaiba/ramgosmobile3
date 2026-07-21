import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Radius } from '../theme/tokens';


export const MapView = ({ items, radius, onItemClick }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Vista de Mapa Interactiva</Text>
            <Text style={styles.subtext}>{items.length} items encontrados en {radius}km</Text>
            <View style={styles.placeholderMap}>
                {/* Simulación de pines */}
                {items.slice(0, 5).map((item: any, idx: number) => (
                    <View key={item.id} style={[styles.pin, { top: 50 + idx * 20, left: 50 + idx * 30 }]}>
                        <Text style={{ fontSize: 10 }}>📍</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        height: 400,
        backgroundColor: '#e1e1e1',
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    text: { fontSize: 18, fontWeight: 'bold', color: '#555' },
    subtext: { color: '#777', marginTop: 5 },
    placeholderMap: { width: '100%', height: '100%', position: 'absolute', opacity: 0.3 },
    pin: { position: 'absolute', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }
});
