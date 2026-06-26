import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Map } from 'lucide-react-native';

export const MapView = () => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
            <Map size={48} color={isDark ? '#4B5563' : '#D1D5DB'} />
            <Text style={[styles.text, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                La vista de mapa no está disponible en la versión web.
            </Text>
            <Text style={[styles.subText, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
                Por favor, utiliza la vista de lista o cuadrícula.
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    text: {
        marginTop: 16,
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
    },
    subText: {
        marginTop: 8,
        fontSize: 14,
        textAlign: 'center',
    }
});
