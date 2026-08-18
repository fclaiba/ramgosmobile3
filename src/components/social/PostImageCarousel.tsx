import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Platform, LayoutChangeEvent } from 'react-native';

/**
 * Carrusel de imágenes de un post, compartido por las dos superficies que
 * renderizan posts: `PostCard` (feed vertical a pantalla completa) y `Post`
 * (tarjeta 16:9 del tab Social). Antes cada una mostraba **sólo
 * `images[0]`**, y recortada.
 *
 * Dos reglas de producto que implementa:
 *
 *  1. **Todas las imágenes**, deslizables en horizontal, con indicador de
 *     puntos cuando hay más de una.
 *  2. **La foto se ve COMPLETA dentro del encuadre** (`contain`), nunca
 *     recortada. Como `contain` deja bandas, detrás va una copia de la misma
 *     imagen en `cover` + `blurRadius`, que es el relleno que usan IG y
 *     TikTok: llena el marco sin distraer ni mutilar el contenido real.
 *
 * El ancho de página se mide con `onLayout` en vez de leerlo de
 * `Dimensions`: así el mismo componente funciona a pantalla completa y
 * dentro de una tarjeta con padding, sin que el llamador tenga que calcular
 * nada ni pasarle medidas.
 */
export const PostImageCarousel = ({
    images,
    alts,
    fallbackAlt,
    dotsPosition = 'top',
}: {
    images: string[];
    alts?: string[];
    fallbackAlt?: string;
    dotsPosition?: 'top' | 'bottom';
}) => {
    const [index, setIndex] = useState(0);
    const [pageWidth, setPageWidth] = useState(0);

    const onLayout = (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== pageWidth) setPageWidth(w);
    };

    const onMomentumEnd = (e: any) => {
        if (!pageWidth) return;
        const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
        if (next !== index) setIndex(next);
    };

    if (images.length === 0) return null;

    return (
        <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
            {/* Hasta tener la medida real no se pagina: renderizar con ancho 0
                dejaría todas las páginas encimadas. */}
            {pageWidth > 0 && (
                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={onMomentumEnd}
                    scrollEnabled={images.length > 1}
                >
                    {images.map((uri, i) => (
                        <View key={`${uri}-${i}`} style={{ width: pageWidth, height: '100%' }}>
                            <Image
                                source={{ uri }}
                                style={StyleSheet.absoluteFill}
                                resizeMode="cover"
                                blurRadius={Platform.OS === 'android' ? 12 : 24}
                            />
                            <View style={styles.backdropTint} />
                            <Image
                                source={{ uri }}
                                style={StyleSheet.absoluteFill}
                                resizeMode="contain"
                                accessible
                                accessibilityLabel={
                                    alts?.[i] || fallbackAlt || `Imagen ${i + 1} de ${images.length}`
                                }
                            />
                        </View>
                    ))}
                </ScrollView>
            )}

            {images.length > 1 && (
                <View
                    style={[styles.dots, dotsPosition === 'bottom' ? styles.dotsBottom : styles.dotsTop]}
                    pointerEvents="none"
                >
                    {images.map((_, i) => (
                        <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    backdropTint: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    dots: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
    },
    dotsTop: { top: 16 },
    dotsBottom: { bottom: 12 },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.55)',
    },
    dotActive: { backgroundColor: '#fff', width: 18 },
});
