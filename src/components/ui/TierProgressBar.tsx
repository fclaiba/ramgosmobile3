import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePoints } from '../../contexts/PointsContext';
import { useTheme } from '../../contexts/ThemeContext';

export const TierProgressBar = () => {
    const { currentTier, nextTier, lifetimePoints } = usePoints();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    if (!nextTier) return null; // Already max tier

    const range = nextTier.minPoints - currentTier.minPoints;
    const progress = lifetimePoints - currentTier.minPoints;
    const percentage = Math.min(100, Math.max(0, (progress / range) * 100));

    return (
        <View style={[styles.container, isDark && styles.containerDark]}>
            <View style={styles.header}>
                <Text style={[styles.tierLabel, isDark && styles.textDark]}>{currentTier.label}</Text>
                <Text style={[styles.pointsLabel, isDark && styles.textSubDark]}>
                    {Math.floor(progress)} / {range} pts para {nextTier.label}
                </Text>
            </View>
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${percentage}%` }]} />
            </View>
        </View>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#374151' : '#e5e7eb',
    },
    containerDark: {
        backgroundColor: '#111827',
        borderBottomColor: isDark ? '#D1D5DB' : '#374151',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        alignItems: 'center',
    },
    tierLabel: {
        fontWeight: 'bold',
        color: '#B45309', // Bronze-ish default
        fontSize: 14,
    },
    pointsLabel: {
        fontSize: 12,
        color: isDark ? isDark ? '#6B7280' : '#9CA3AF' : '#6B7280',
    },
    textDark: {
        color: '#FCD34D',
    },
    textSubDark: {
        color: isDark ? '#6B7280' : '#9CA3AF',
    },
    track: {
        height: 6,
        backgroundColor: isDark ? '#374151' : '#e5e7eb',
        borderRadius: 3,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        backgroundColor: '#F59E0B',
        borderRadius: 3,
    },
});
