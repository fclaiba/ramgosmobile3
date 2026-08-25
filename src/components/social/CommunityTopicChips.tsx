/**
 * Filtro por tema del directorio.
 *
 * Los temas los pasa quien llama a partir de lo que hay realmente cargado, no
 * de una taxonomía fija: una categoría que al tocarla no muestra nada es peor
 * que no ofrecerla.
 */
import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { Radius, Space, Type } from '../../theme/tokens';

export function CommunityTopicChips({
    topics,
    selected,
    onSelect,
}: {
    topics: string[];
    selected: string | null;
    /** `null` = quitar el filtro. */
    onSelect: (topic: string | null) => void;
}) {
    const { colorScheme } = useTheme();
    const styles = getStyles(colorScheme === 'dark');

    if (topics.length === 0) return null;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
        >
            <Chip label="Todas" active={selected === null} onPress={() => onSelect(null)} styles={styles} />
            {topics.map((topic) => (
                <Chip
                    key={topic}
                    label={topic}
                    active={selected === topic}
                    // Volver a tocar el tema activo lo quita: sin esto habría
                    // que buscar el chip "Todas" para deseleccionar.
                    onPress={() => onSelect(selected === topic ? null : topic)}
                    styles={styles}
                />
            ))}
        </ScrollView>
    );
}

function Chip({
    label,
    active,
    onPress,
    styles,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
    styles: any;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
        >
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {label}
            </Text>
        </Pressable>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    row: {
        paddingHorizontal: Space[4],
        paddingBottom: Space[3],
        gap: Space[2],
        alignItems: 'center',
    },
    chip: {
        paddingHorizontal: Space[3],
        paddingVertical: 7,
        borderRadius: Radius.full,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
    },
    chipActive: {
        backgroundColor: c.primaryMuted,
        borderColor: c.borderFocus,
    },
    chipText: {
        ...Type.caption,
        color: c.textMuted,
    },
    chipTextActive: {
        color: c.primary,
        fontWeight: '800',
    },
}));
