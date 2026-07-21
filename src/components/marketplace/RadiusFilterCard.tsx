import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Animated, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { Move, MapPin, Target } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../../theme/tokens';


export const RadiusFilterCard = ({ radius, setRadius, resultsCount, onMoveCenter, isCustomMode }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <View style={styles.container}>
            <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.blurContainer}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <View style={styles.iconContainer}>
                            <Target size={16} color="#2196F3" />
                        </View>
                        <Text style={styles.title}>Radio de búsqueda</Text>
                    </View>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{resultsCount} resultados</Text>
                    </View>
                </View>

                {/* Slider Row */}
                <View style={styles.sliderRow}>
                    <Text style={styles.radiusText}>{radius} km</Text>
                    <Slider
                        style={styles.slider}
                        minimumValue={0.5}
                        maximumValue={25}
                        step={0.5}
                        value={radius}
                        onValueChange={setRadius}
                        minimumTrackTintColor="#2196F3"
                        maximumTrackTintColor={isDark ? '#4B5563' : '#E5E7EB'}
                        thumbTintColor="#2196F3"
                    />
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, isCustomMode && styles.actionBtnActive]}
                        onPress={onMoveCenter}
                    >
                        <Move size={14} color={isCustomMode ? '#fff' : (isDark ? '#D1D5DB' : '#374151')} />
                        <Text style={[styles.actionBtnText, isCustomMode && styles.actionBtnTextActive]}>
                            {isCustomMode ? 'Centro: Manual' : 'Centro: GPS'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </BlurView>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        borderRadius: Radius.xl,
        overflow: 'hidden',
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255,255,255,0.9)',
        ...Platform.select({
            web: { boxShadow: '0px 12px 24px rgba(15, 23, 42, 0.08)' },
            default: {
                ...glassShadow(isDark),
            },
        }),
    },
    blurContainer: { padding: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconContainer: { width: 28, height: 28, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(33, 150, 243, 0.15)' : '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 14, fontWeight: '600', color: colors(isDark).text },
    badge: { backgroundColor: colors(isDark).glass, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.md },
    badgeText: { fontSize: 11, fontWeight: '600', color: colors(isDark).textMuted },

    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    radiusText: { fontSize: 14, fontWeight: 'bold', color: '#2196F3', width: 45 },
    slider: { flex: 1, height: 40 },

    actions: { flexDirection: 'row' },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors(isDark).glass, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', gap: 8 },
    actionBtnActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
    actionBtnText: { fontSize: 12, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151' },
    actionBtnTextActive: { color: '#fff' },
});
