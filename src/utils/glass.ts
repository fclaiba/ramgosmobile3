import { Platform, StyleSheet, ViewStyle } from 'react-native';
import { Brand } from '../theme/brand';
import { colors, glassShadow, Radius } from '../theme/tokens';

export type GlassIntensity = 'subtle' | 'regular' | 'prominent';

export const glassTokens = (isDark: boolean, intensity: GlassIntensity = 'regular') => {
    const c = colors(isDark);
    const blur = intensity === 'subtle' ? 22 : intensity === 'prominent' ? 55 : 40;
    const radius = intensity === 'prominent' ? Radius['2xl'] : Radius.xl;

    return {
        bg: intensity === 'prominent' ? c.glassStrong : c.glass,
        border: c.glassBorder,
        hairline: c.divider,
        tint: isDark ? 'rgba(33, 150, 243,0.12)' : 'rgba(33, 150, 243,0.06)',
        blur,
        radius,
        shadow: glassShadow(isDark),
        backdrop:
            Platform.OS === 'web'
                ? ({
                      backdropFilter: `blur(${intensity === 'subtle' ? 10 : 16}px)`,
                      WebkitBackdropFilter: `blur(${intensity === 'subtle' ? 10 : 16}px)`,
                  } as any)
                : ({} as ViewStyle),
        brand: Brand.primary,
    };
};

export const glassSurface = (
    isDark: boolean,
    intensity: GlassIntensity = 'regular',
    extra?: ViewStyle,
): ViewStyle => {
    const t = glassTokens(isDark, intensity);
    return {
        backgroundColor: t.bg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.border,
        borderRadius: t.radius,
        overflow: 'hidden',
        ...t.shadow,
        ...t.backdrop,
        ...extra,
    };
};

/** Page atmosphere — neutral, brand whisper only (anti purple-wash). */
export const glassGradient = (isDark: boolean): [string, string, string] =>
    isDark ? ['#09090B', '#0C0A14', '#09090B'] : ['#FAFAFA', '#F8F7FC', '#FAFAFA'];

export const glassChip = (isDark: boolean, color: string = Brand.primary): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color,
    backgroundColor: isDark ? `${color}22` : `${color}14`,
});

/**
 * Chrome frost recipe — Liquid Glass for topbar / bottom nav.
 * iOS/web: lighter veil so blur shows. Android: denser veil (blur often weak).
 */
export function chromeFrost(isDark: boolean) {
    const c = colors(isDark);
    const frost =
        Platform.OS === 'android' ? c.chromeDense : c.chrome;
    return {
        frost,
        border: c.chromeBorder,
        specular: c.chromeSpecular,
        blurNative: isDark ? 72 : 88,
        blurWebPx: 28,
        tint: (isDark ? 'dark' : 'light') as 'dark' | 'light',
    };
}
