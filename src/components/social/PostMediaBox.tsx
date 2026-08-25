/**
 * Encuadre de la media de un post.
 *
 * Dos decisiones de diseño que cambian respecto de la versión anterior:
 *
 *  1. **4:5 en vez de 1:1.** La caja cuadrada desperdiciaba alto en un feed que
 *     se consume en vertical. 4:5 es el encuadre de Instagram y da ~37% más de
 *     superficie de contenido con el mismo ancho.
 *  2. **Full-bleed.** La media rompe el padding horizontal de la tarjeta con un
 *     margen negativo, así el contenido llega al borde y el cromo desaparece.
 *     Se gana el ancho completo de la tarjeta sin que nadie tenga que leer
 *     `Dimensions`.
 *
 * El aspecto es FIJO a propósito. Sería más prolijo respetar el aspecto real de
 * cada archivo, pero el servidor no guarda las dimensiones de la media, y
 * resolverlas en el cliente (`Image.getSize`) obligaría a re-medir después del
 * primer layout: la fila cambiaría de alto con el scroll en curso y saltaría.
 * Un alto predecible vale más que un encuadre perfecto.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { Radius, Space } from '../../theme/tokens';

/** Alto = ancho / MEDIA_ASPECT_RATIO. 4:5 vertical. */
export const MEDIA_ASPECT_RATIO = 4 / 5;

export function PostMediaBox({
    children,
    overlay,
    /** Padding horizontal de la tarjeta contenedora, que este box anula. */
    bleed = Space[4],
}: {
    children: React.ReactNode;
    /** Se ancla abajo a la izquierda, sobre la media (píldora de compra). */
    overlay?: React.ReactNode;
    bleed?: number;
}) {
    const { colorScheme } = useTheme();
    const styles = getStyles(colorScheme === 'dark');

    return (
        <View style={[styles.box, { marginHorizontal: -bleed }]}>
            {children}
            {overlay ? (
                <View style={styles.overlay} pointerEvents="box-none">
                    {overlay}
                </View>
            ) : null}
        </View>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    box: {
        width: 'auto',
        aspectRatio: MEDIA_ASPECT_RATIO,
        borderRadius: Radius.lg,
        overflow: 'hidden',
        backgroundColor: isDark ? '#000' : c.surface2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.glassBorder,
        marginBottom: Space[2],
    },
    overlay: {
        position: 'absolute',
        left: Space[3],
        bottom: Space[3],
        flexDirection: 'row',
        alignItems: 'center',
    },
}));
