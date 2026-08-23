import React, { useContext, useMemo, useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';
import { Brand } from '../../theme/brand';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<AvatarSize, number> = {
    sm: 32,
    md: 40,
    lg: 56,
    xl: 80,
};

/** Grosor del anillo. El contenedor mide `dim + RING * 2`. */
const RING = 2;

type StatusType = 'online' | 'away' | 'offline' | 'none';

const STATUS_COLORS: Record<Exclude<StatusType, 'none'>, string> = {
    online: Brand.success,
    away: Brand.warning,
    offline: '#71717A',
};

/**
 * Diámetro real del avatar en curso, para que `AvatarFallback` dimensione su
 * letra sin que cada llamador tenga que repetir el tamaño en dos lugares.
 */
const AvatarDimContext = React.createContext<number>(SIZE_MAP.md);

/**
 * Avatar.
 *
 * El tamaño puede venir de tres lados y el orden importa:
 *   1. `size` numérico — el más explícito.
 *   2. `width`/`height` del `style` — cómo dimensionan 77 de los 95 usos.
 *   3. `size` nominal ('sm' | 'md' | ...) — el default.
 *
 * El caso (2) era un bug: `style` se aplicaba sólo al contenedor externo
 * mientras la imagen seguía midiendo `SIZE_MAP[size]`, o sea 40px por defecto.
 * Una pantalla que pedía un avatar de 140px renderizaba una foto de 40px
 * flotando dentro de una caja vacía de 140. Por eso la foto de perfil "se veía
 * chica" por más que la pantalla reservara lugar para una grande.
 */
export const Avatar = ({ children, style, className, size = 'md' as AvatarSize | number, status }: {
    children: React.ReactNode;
    style?: any;
    className?: string;
    size?: AvatarSize | number;
    status?: StatusType;
}) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const flat = StyleSheet.flatten(style) || {};

    const dim = useMemo(() => {
        if (typeof size === 'number' && size > 0) return size;

        const fromStyle = typeof flat.width === 'number'
            ? flat.width
            : typeof flat.height === 'number'
              ? flat.height
              : null;
        // El estilo dimensiona el contenedor, que incluye el anillo.
        if (fromStyle && fromStyle > RING * 2) return fromStyle - RING * 2;

        return SIZE_MAP[size as AvatarSize] ?? SIZE_MAP.md;
    }, [size, flat.width, flat.height]);

    const outer = dim + RING * 2;
    const statusDot = status && status !== 'none' ? STATUS_COLORS[status] : null;
    // El punto de estado crece con el avatar en vez de saltar entre tres
    // tamaños fijos, para que no se coma la foto en los grandes.
    const dotSize = Math.max(8, Math.min(18, Math.round(dim * 0.28)));

    return (
        <AvatarDimContext.Provider value={dim}>
            <View style={[
                styles.container,
                style,
                { width: outer, height: outer },
            ]}>
                {/* Glass ring */}
                <View style={[
                    styles.ring,
                    {
                        width: outer,
                        height: outer,
                        borderRadius: outer / 2,
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                    },
                ]} />
                {/* Avatar content */}
                <View style={[
                    styles.avatar,
                    {
                        width: dim,
                        height: dim,
                        borderRadius: dim / 2,
                        backgroundColor: c.surface2,
                    },
                ]}>
                    {children}
                </View>
                {/* Status indicator */}
                {statusDot && (
                    <View style={[
                        styles.status,
                        {
                            backgroundColor: statusDot,
                            width: dotSize,
                            height: dotSize,
                            borderRadius: 999,
                            borderColor: c.bg,
                        },
                    ]} />
                )}
            </View>
        </AvatarDimContext.Provider>
    );
};

export const AvatarImage = ({ src, style }: any) => {
    const [hasError, setHasError] = useState(!src);

    React.useEffect(() => {
        setHasError(!src);
    }, [src]);

    // `convex-storage:<id>` es una referencia interna, no una URL cargable: si
    // llega hasta acá es que una query devolvió el documento crudo sin pasar por
    // `resolveMediaUrl`. Mostrar el fallback es mejor que un intento de red que
    // falla en silencio y deja el hueco gris.
    if (hasError || (typeof src === 'string' && src.startsWith('convex-storage:'))) return null;

    return <Image source={{ uri: src }} style={[styles.image, style]} onError={() => setHasError(true)} />;
};

export const AvatarFallback = ({ children, size }: { children: React.ReactNode; size?: AvatarSize | number }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const contextDim = useContext(AvatarDimContext);

    const dim = typeof size === 'number'
        ? size
        : size
          ? SIZE_MAP[size]
          : contextDim;
    // Proporcional al diámetro: la inicial se ve igual de equilibrada en un
    // avatar de 32 y en uno de 140.
    const fontSize = Math.round(dim * 0.38);

    return (
        <View style={[styles.fallback, { backgroundColor: isDark ? c.surface3 : c.surface2 }]}>
            <Text style={[styles.fallbackText, { color: c.textMuted, fontSize }]}>{children}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ring: {
        position: 'absolute',
        borderWidth: RING,
    },
    avatar: {
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        zIndex: 1,
    },
    fallback: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        fontWeight: '700',
    },
    status: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        borderWidth: 2,
        zIndex: 2,
    },
});
