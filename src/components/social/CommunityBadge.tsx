import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Users } from 'lucide-react-native';
import { glassChip } from '../../utils/glass';
import { useTheme } from '../../contexts/ThemeContext';
import { Id } from '../../../convex/_generated/dataModel';

const ACCENT = '#A78BFA';

interface CommunityBadgeProps {
    communityId: Id<'commercialCommunities'>;
    name: string;
    /** `overlay` (default) = blanco fijo, para el HUD sobre video de `LoopItem`.
     *  `surface` = sigue el tema, para la tarjeta de feed de `PostCard`. */
    variant?: 'overlay' | 'surface';
}

/** B3: "posteado en [comunidad]" — mismo patrón que `SoundPill.tsx`
 *  (`glassChip()` + `TouchableOpacity` propio), tinte distinto para no
 *  confundirse con la píldora de sonido cuando un post tiene las dos. */
export const CommunityBadge = ({ communityId, name, variant = 'overlay' }: CommunityBadgeProps) => {
    const navigation = useNavigation<any>();
    const isDark = useTheme().colorScheme === 'dark';
    const onSurface = variant === 'surface';
    // Sobre una tarjeta clara el violeta pastel no contrasta; se oscurece.
    const fg = onSurface ? (isDark ? ACCENT : '#6D28D9') : '#fff';
    return (
        <TouchableOpacity
            style={[styles.chip, onSurface && glassChip(isDark, ACCENT)]}
            onPress={() => navigation.navigate('CommunityDetail', { communityId })}
            accessibilityRole="button"
            accessibilityLabel={`Ver comunidad: ${name}`}
        >
            <Users size={12} color={fg} style={onSurface ? undefined : (styles.iconShadow as any)} />
            <Text style={[styles.text, onSurface && { color: fg }]} numberOfLines={1}>{name}</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    chip: {
        ...glassChip(true, ACCENT),
        alignSelf: 'flex-start',
        maxWidth: 200,
    },
    text: { color: '#fff', fontSize: 12, fontWeight: '600' },
    iconShadow: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
});
