import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const Badge = ({ children, style, className, variant = 'default' }: any) => {
    // Definir estilos simples basados en colores comunes de badges
    // Esto es muy básico y no reemplaza el parsing de Tailwind, pero ayuda a la visualización
    let bg = '#E5E5EA';
    let text = '#000';

    if (className?.includes('bg-red')) { bg = '#FF3B30'; text = '#FFF'; }
    if (className?.includes('bg-green')) { bg = '#34C759'; text = '#FFF'; }
    if (className?.includes('bg-blue')) { bg = '#007AFF'; text = '#FFF'; }
    if (className?.includes('bg-pink')) { bg = '#FF2D55'; text = '#FFF'; }
    if (className?.includes('bg-orange')) { bg = '#FF9500'; text = '#FFF'; }
    if (className?.includes('bg-violet')) { bg = '#5856D6'; text = '#FFF'; }

    return (
        <View style={[styles.badge, { backgroundColor: bg }, style]}>
            <Text style={[styles.text, { color: text }]}>
                {children}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row'
    },
    text: {
        fontSize: 10,
        fontWeight: '600'
    }
});
