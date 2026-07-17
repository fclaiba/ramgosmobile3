import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const MapView = (props: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    return (
        <View style={[props.style, styles.container]}>
            <Text style={styles.text}>Mapas no disponibles en Web</Text>
            <Text style={styles.subtext}>Descarga la App para ver el mapa</Text>
        </View>
    );
};

export const Marker = (props: any) => null;
export const Callout = (props: any) => props.children || null;
export const Circle = (props: any) => null;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = 'default';
export default MapView;

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    text: {
        fontSize: 16,
        color: '#374151',
        fontWeight: '600',
    },
    subtext: {
        fontSize: 13,
        color: '#6b7280',
        marginTop: 8,
    },
});
