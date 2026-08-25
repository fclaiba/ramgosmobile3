/**
 * Barra de fuentes del feed.
 *
 * Reemplaza a `renderFeedModeTabs`, que tenía "Para ti" y "Siguiendo"
 * escritos a mano en el JSX. Acá las tabs son DATOS (`FeedTabDescriptor[]`),
 * así que sumar la de Comunidades — o mañana una por cada comunidad fijada —
 * es empujar un elemento al array, sin tocar este componente.
 *
 * Es un eje distinto del selector Feed/Loops de `SocialScreen`: aquél elige el
 * FORMATO (tarjetas o pantalla completa), éste elige la FUENTE.
 *
 * El indicador se anima con Reanimated sobre las medidas reales de cada chip
 * (`onLayout`) en lugar de calcular anchos a mano, así funciona con etiquetas
 * de cualquier largo — que es lo que hace falta cuando los nombres los ponen
 * los usuarios.
 */
import { Plus } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useResponsive } from '../../hooks/useResponsive';
import { useTheme } from '../../contexts/ThemeContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { colors, Motion, Radius, Space, Touch, Type } from '../../theme/tokens';

export interface FeedTabDescriptor {
    key: string;
    label: string;
    /** Contador tipo "no leídos". `0`/ausente no dibuja nada. */
    badgeCount?: number;
    /** Si se puede desfijar con long-press (comunidades fijadas). */
    pinnable?: boolean;
}

interface TabLayout {
    x: number;
    width: number;
}

export function FeedTabBar({
    tabs,
    activeKey,
    onChange,
    onUnpin,
    onDiscover,
}: {
    tabs: FeedTabDescriptor[];
    activeKey: string;
    onChange: (key: string) => void;
    /** Long-press sobre una tab `pinnable`. */
    onUnpin?: (key: string) => void;
    /** Chip final "Descubrir". Sin esto no se dibuja. */
    onDiscover?: () => void;
}) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const c = colors(isDark);
    const { feedMaxWidth } = useResponsive();

    const layouts = useRef<Record<string, TabLayout>>({});
    const indicatorX = useSharedValue(0);
    const indicatorWidth = useSharedValue(0);
    const [measuredKey, setMeasuredKey] = useState<string | null>(null);

    const moveIndicator = useCallback(
        (key: string) => {
            const layout = layouts.current[key];
            if (!layout) return;
            indicatorX.value = withSpring(layout.x, Motion.layoutSpring);
            // El primer posicionamiento no se anima: arrancar desde 0 haría
            // que el indicador cruce la barra al montar.
            indicatorWidth.value =
                indicatorWidth.value === 0
                    ? layout.width
                    : withSpring(layout.width, Motion.layoutSpring);
        },
        [indicatorX, indicatorWidth],
    );

    const onTabLayout = useCallback(
        (key: string, x: number, width: number) => {
            layouts.current[key] = { x, width };
            if (key === activeKey) {
                moveIndicator(key);
                setMeasuredKey(key);
            }
        },
        [activeKey, moveIndicator],
    );

    React.useEffect(() => {
        moveIndicator(activeKey);
    }, [activeKey, moveIndicator, measuredKey]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value }],
        width: indicatorWidth.value,
    }));

    const handlePress = (key: string) => {
        if (key === activeKey) return;
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        onChange(key);
    };

    const handleLongPress = (tab: FeedTabDescriptor) => {
        if (!tab.pinnable || !onUnpin) return;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onUnpin(tab.key);
    };

    return (
        // Misma columna que el feed: si la barra ocupara todo el ancho, las
        // tabs quedarían despegadas del contenido que gobiernan.
        <View style={[styles.wrapper, { width: '100%', maxWidth: feedMaxWidth, alignSelf: 'center' }]}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.content}
            >
                {tabs.map((tab) => {
                    const active = tab.key === activeKey;
                    return (
                        <Pressable
                            key={tab.key}
                            onPress={() => handlePress(tab.key)}
                            onLongPress={() => handleLongPress(tab)}
                            style={styles.tab}
                            onLayout={(e) =>
                                onTabLayout(tab.key, e.nativeEvent.layout.x, e.nativeEvent.layout.width)
                            }
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={tab.label}
                        >
                            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                                {tab.label}
                            </Text>
                            {tab.badgeCount ? (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>
                                        {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                                    </Text>
                                </View>
                            ) : null}
                        </Pressable>
                    );
                })}

                {onDiscover ? (
                    <Pressable
                        onPress={onDiscover}
                        style={styles.discover}
                        accessibilityRole="button"
                        accessibilityLabel="Descubrir comunidades"
                    >
                        <Plus size={14} color={c.textSecondary} />
                        <Text style={styles.discoverText}>Descubrir</Text>
                    </Pressable>
                ) : null}

                <Animated.View style={[styles.indicator, indicatorStyle]} pointerEvents="none" />
            </ScrollView>
        </View>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    wrapper: {
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
    },
    content: {
        paddingHorizontal: Space[4],
        gap: Space[5],
        alignItems: 'center',
        // Deja lugar al indicador, que se dibuja pegado al borde inferior.
        paddingBottom: 3,
    },
    tab: {
        height: Touch.min,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    label: {
        ...Type.bodySm,
        color: c.textMuted,
    },
    labelActive: {
        fontWeight: '700',
        color: c.text,
    },
    badge: {
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: Radius.full,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        ...Type.caption,
        fontSize: 10,
        color: '#FFF',
    },
    discover: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: 28,
        paddingHorizontal: Space[3],
        borderRadius: Radius.full,
        backgroundColor: c.surface2,
        borderWidth: 1,
        borderColor: c.border,
    },
    discoverText: {
        ...Type.caption,
        fontWeight: '700',
        color: c.textSecondary,
    },
    indicator: {
        position: 'absolute',
        bottom: 0,
        // `left: 0` y no `Space[4]`: el `x` que da `onLayout` ya viene medido
        // desde el borde del contenedor, con su padding incluido.
        left: 0,
        height: 3,
        borderRadius: Radius.full,
        backgroundColor: c.primary,
    },
}));
