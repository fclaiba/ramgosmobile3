import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Music2 } from 'lucide-react-native';
import { glassChip } from '../../utils/glass';
import { Id } from '../../../convex/_generated/dataModel';

interface SoundPillProps {
    trackId: Id<'audioTracks'>;
    /** Nombre del track — `post.audioTrack?.name` (hidratado en `decoratePosts`,
     *  no una query aparte por card). */
    name?: string | null;
    authorUsername?: string | null;
}

const MARQUEE_THRESHOLD = 22; // caracteres a partir de los cuales anima

/**
 * Píldora tappable del sonido de un post — usada en `LoopItem` (upgrade de
 * un `<View>` estático que no se podía tocar) y `PostCard` (no tenía nada).
 * Sobre `glassChip()` en vez de estilos a mano, envuelta en su propio
 * `TouchableOpacity` en vez de confiar en el `onPress` de `GlassSurface`
 * (su wiring interno no está confirmado).
 */
export const SoundPill = ({ trackId, name, authorUsername }: SoundPillProps) => {
    const navigation = useNavigation<any>();
    const translateX = useRef(new Animated.Value(0)).current;

    const label = `🎵 ${name || 'Sonido original'}${authorUsername ? ` - @${authorUsername}` : ''}`;
    const shouldMarquee = label.length > MARQUEE_THRESHOLD;

    useEffect(() => {
        if (!shouldMarquee) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(1200),
                Animated.timing(translateX, {
                    toValue: -1,
                    duration: 3500,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
                Animated.delay(800),
                Animated.timing(translateX, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [shouldMarquee, translateX]);

    return (
        <TouchableOpacity
            style={styles.chip}
            onPress={() => navigation.navigate('SoundDetails', { trackId })}
            accessibilityRole="button"
            accessibilityLabel={`Ver sonido: ${label}`}
        >
            <Music2 size={12} color="#fff" style={styles.iconShadow} />
            <View style={styles.textClip}>
                <Animated.Text
                    style={[
                        styles.text,
                        shouldMarquee && {
                            transform: [
                                {
                                    translateX: translateX.interpolate({
                                        inputRange: [-1, 0],
                                        outputRange: [-140, 0],
                                    }),
                                },
                            ],
                        },
                    ]}
                    numberOfLines={1}
                >
                    {label}
                </Animated.Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    chip: {
        ...glassChip(true, '#FFFFFF'),
        alignSelf: 'flex-start',
        maxWidth: 220,
    },
    textClip: {
        maxWidth: 170,
        overflow: 'hidden',
    },
    text: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '500',
    },
    iconShadow: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    } as any,
});
