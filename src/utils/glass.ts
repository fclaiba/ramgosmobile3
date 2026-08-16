/**
 * Liquid Glass utilities — Ramgos glassmorphism design system.
 *
 * v2 — 3-tier surface system, specular gradient helpers,
 *       press animation configs, input/sheet presets.
 */
import { Platform, StyleSheet, ViewStyle } from 'react-native';
import { Brand } from '../theme/brand';
import { colors, Elevation, Radius, Motion } from '../theme/tokens';

/* ─── Glass Intensity ────────────────────────────────────────────── */

export type GlassIntensity = 'subtle' | 'regular' | 'prominent';

/* ─── Surface Presets ────────────────────────────────────────────── */

const SURFACE_PRESET = {
    subtle: { blur: 22, blurWeb: 10, tier: 1 as const, radius: Radius.lg },
    regular: { blur: 40, blurWeb: 16, tier: 2 as const, radius: Radius.xl },
    prominent: { blur: 55, blurWeb: 22, tier: 3 as const, radius: Radius['2xl'] },
} as const;

/* ─── Core Glass Tokens ──────────────────────────────────────────── */

export const glassTokens = (isDark: boolean, intensity: GlassIntensity = 'regular') => {
    const c = colors(isDark);
    const preset = SURFACE_PRESET[intensity];
    const surfaceKey = `surface${preset.tier}` as 'surface1' | 'surface2' | 'surface3';

    return {
        bg: c[surfaceKey],
        border: c.glassBorder,
        hairline: c.divider,
        tint: isDark ? 'rgba(33, 150, 243,0.08)' : 'rgba(33, 150, 243,0.04)',
        blur: preset.blur,
        blurWeb: preset.blurWeb,
        radius: preset.radius,
        shadow: Elevation[preset.tier](isDark),
        backdrop:
            Platform.OS === 'web'
                ? ({
                      backdropFilter: `blur(${preset.blurWeb}px) saturate(1.3)`,
                      WebkitBackdropFilter: `blur(${preset.blurWeb}px) saturate(1.3)`,
                  } as any)
                : ({} as ViewStyle),
        brand: Brand.primary,
        // Specular
        specular: c.specular,
        specularStrong: c.specularStrong,
        specularHeight: intensity === 'prominent' ? 10 : intensity === 'regular' ? 8 : 6,
        // Inner glow
        innerGlow: c.innerGlow,
        innerGlowActive: c.innerGlowActive,
    };
};

/* ─── Glass Surface Style Helper ─────────────────────────────────── */

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

/* ─── Specular Gradient ──────────────────────────────────────────── */

/**
 * Returns colors + start/end for a top specular rim.
 * Use with `<LinearGradient>` inside a glass container.
 */
export function specularGradient(isDark: boolean, intensity: GlassIntensity = 'regular') {
    const t = glassTokens(isDark, intensity);
    return {
        colors: [t.specular, 'transparent'] as [string, string],
        start: { x: 0.5, y: 0 } as const,
        end: { x: 0.5, y: 1 } as const,
        height: t.specularHeight,
    };
}

/* ─── Page Atmosphere ────────────────────────────────────────────── */

/** Page atmosphere — neutral, brand whisper only (anti purple-wash). */
export const glassGradient = (isDark: boolean): [string, string, string] =>
    isDark ? ['#050506', '#08070E', '#050506'] : ['#F8F9FA', '#F5F3FA', '#F8F9FA'];

/* ─── Glass Chip ─────────────────────────────────────────────────── */

export const glassChip = (isDark: boolean, color: string = Brand.primary): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? `${color}55` : `${color}44`,
    backgroundColor: isDark ? `${color}18` : `${color}0E`,
});

/* ─── Glass Input Tokens ─────────────────────────────────────────── */

export function glassInput(isDark: boolean) {
    const c = colors(isDark);
    return {
        bg: c.surface1,
        bgFocus: c.surface2,
        border: c.border,
        borderFocus: c.borderFocus,
        borderError: c.borderError,
        text: c.text,
        placeholder: c.textSubtle,
        radius: Radius.lg,
        blur: 20,
        blurWeb: 8,
        backdrop:
            Platform.OS === 'web'
                ? ({
                      backdropFilter: 'blur(8px) saturate(1.2)',
                      WebkitBackdropFilter: 'blur(8px) saturate(1.2)',
                  } as any)
                : ({} as ViewStyle),
    };
}

/* ─── Glass Sheet Tokens ─────────────────────────────────────────── */

export function glassSheet(isDark: boolean) {
    const c = colors(isDark);
    return {
        bg: c.surface3,
        handleColor: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.12)',
        overlay: c.overlay,
        radius: Radius['3xl'],
        specular: c.specular,
        shadow: Elevation[3](isDark),
        blur: 55,
        blurWeb: 22,
        backdrop:
            Platform.OS === 'web'
                ? ({
                      backdropFilter: 'blur(22px) saturate(1.35)',
                      WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
                  } as any)
                : ({} as ViewStyle),
    };
}

/* ─── Chrome Frost ───────────────────────────────────────────────── */

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
        saturation: 1.35,
        tint: (isDark ? 'dark' : 'light') as 'dark' | 'light',
        specularHeight: 10,
        innerBorder: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.35)',
    };
}

/* ─── Press Animation Config ─────────────────────────────────────── */

export const pressConfig = {
    scale: Motion.pressedScale,
    spring: Motion.pressSpring,
} as const;
