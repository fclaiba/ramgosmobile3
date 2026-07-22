import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Menu, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, Radius, Type, Touch } from '../theme/tokens';
import { ChromeGlass } from './ui/ChromeGlass';

export const MobileHeader = ({ title, subtitle, actions, onMenuPress, backButton, onBack }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const c = colors(isDark);
    const styles = getStyles(isDark, insets, c);

    return (
        <View style={styles.container} accessibilityRole="header">
            <ChromeGlass edge="bottom" />
            <View style={styles.header}>
                <View style={styles.left}>
                    {backButton ? (
                        <TouchableOpacity
                            onPress={onBack}
                            style={styles.iconBtn}
                            activeOpacity={0.75}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Volver"
                        >
                            <ChevronLeft color={c.text} size={22} />
                        </TouchableOpacity>
                    ) : onMenuPress ? (
                        <TouchableOpacity
                            onPress={onMenuPress}
                            style={styles.iconBtn}
                            activeOpacity={0.75}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Abrir menú"
                        >
                            <Menu color={c.text} size={22} />
                        </TouchableOpacity>
                    ) : null}
                    <View style={styles.titles}>
                        <Text style={styles.title} numberOfLines={1}>
                            {title}
                        </Text>
                        {subtitle ? (
                            <Text style={styles.subtitle} numberOfLines={1}>
                                {subtitle}
                            </Text>
                        ) : null}
                    </View>
                </View>
                <View style={styles.actions}>{actions}</View>
            </View>
        </View>
    );
};

const getStyles = (isDark: boolean, insets: any, c: ReturnType<typeof colors>) =>
    StyleSheet.create({
        container: {
            paddingTop: insets.top,
            zIndex: 10,
            overflow: 'hidden',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.chromeBorder,
            // Transparent so ChromeGlass blur can sample content behind
            backgroundColor: 'transparent',
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: Touch.min,
        },
        left: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            flex: 1,
            minWidth: 0,
        },
        titles: { flex: 1, minWidth: 0 },
        actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        iconBtn: {
            width: Touch.min - 4,
            height: Touch.min - 4,
            borderRadius: Radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.chromeBorder,
        },
        title: { ...Type.title, color: c.text },
        subtitle: { ...Type.caption, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    });
