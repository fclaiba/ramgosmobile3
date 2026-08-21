import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Users } from 'lucide-react-native';
import { glassChip } from '../../utils/glass';
import { Id } from '../../../convex/_generated/dataModel';

interface CommunityBadgeProps {
    communityId: Id<'commercialCommunities'>;
    name: string;
}

/** B3: "posteado en [comunidad]" — mismo patrón que `SoundPill.tsx`
 *  (`glassChip()` + `TouchableOpacity` propio), tinte distinto para no
 *  confundirse con la píldora de sonido cuando un post tiene las dos. */
export const CommunityBadge = ({ communityId, name }: CommunityBadgeProps) => {
    const navigation = useNavigation<any>();
    return (
        <TouchableOpacity
            style={styles.chip}
            onPress={() => navigation.navigate('CommunityDetail', { communityId })}
            accessibilityRole="button"
            accessibilityLabel={`Ver comunidad: ${name}`}
        >
            <Users size={12} color="#fff" style={styles.iconShadow as any} />
            <Text style={styles.text} numberOfLines={1}>{name}</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    chip: {
        ...glassChip(true, '#A78BFA'),
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
