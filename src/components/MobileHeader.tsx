import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';

import { Menu, ChevronLeft } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const MobileHeader = ({ title, subtitle, actions, onMenuPress, backButton, onBack }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    
    const insets = useSafeAreaInsets();
    const styles = getStyles(isDark, insets);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {backButton ? (
                        <TouchableOpacity onPress={onBack}>
                            <ChevronLeft color={isDark ? "#fff" : "#000"} size={24} />
                        </TouchableOpacity>
                    ) : onMenuPress ? (
                        <TouchableOpacity onPress={onMenuPress}>
                            <Menu color={isDark ? "#fff" : "#000"} size={24} />
                        </TouchableOpacity>
                    ) : null}
                    <View>
                        <Text style={styles.title}>{title}</Text>
                        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    </View>
                </View>
                <View>{actions}</View>
            </View>
        </View>
    );
};

const getStyles = (isDark: boolean, insets: any) => StyleSheet.create({
    container: {
        backgroundColor: isDark ? '#111827' : '#fff',
        paddingTop: insets.top,
        zIndex: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#374151' : '#f0f0f0'
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: isDark ? '#fff' : '#1A1A1A'
    },
    subtitle: {
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#666'
    }
});
