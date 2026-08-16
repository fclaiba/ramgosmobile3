/**
 * Ramgos Design Tokens — marketplace / fintech / rewards.
 * Direction: refined utilitarian. Brand blue is accent, NOT wallpaper.
 * Liquid Glass reserved for chrome (nav, headers, sheets, interactive panels).
 *
 * v2 — Glassmorphism redesign: 3-tier surface system, specular rim tokens,
 *       improved shadows, Elevation presets, richer atmosphere.
 */
import { Platform, ViewStyle } from 'react-native';
import { Brand } from './brand';

/* ─── Spacing ────────────────────────────────────────────────────── */

export const Space = {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
} as const;

/* ─── Radii ──────────────────────────────────────────────────────── */

export const Radius = {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 34,
    full: 999,
} as const;

/* ─── Typography ─────────────────────────────────────────────────── */

export const Type = {
    caption: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.2 },
    bodySm: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
    body: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
    title: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
    heading: { fontSize: 22, lineHeight: 28, fontWeight: '800' as const, letterSpacing: -0.4 },
    display: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const, letterSpacing: -0.6 },
    hero: { fontSize: 34, lineHeight: 40, fontWeight: '900' as const, letterSpacing: -0.8 },
};

/* ─── Semantic Colors ────────────────────────────────────────────── */

/** Semantic colors — light/dark. Neutral canvas + brand accent. */
export function colors(isDark: boolean) {
    return {
        // Canvas — deeper dark, warmer light
        bg: isDark ? '#050506' : '#F8F9FA',
        bgElevated: isDark ? '#111113' : '#FFFFFF',

        // 3-tier glass surfaces
        surface1: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
        surface2: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
        surface3: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.88)',

        // Legacy compat — map to surface2
        glass: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
        glassStrong: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.88)',
        glassBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',

        // Specular highlight — rim light
        specular: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)',
        specularStrong: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.85)',

        // Inner glow — brand tint for interactive states
        innerGlow: isDark ? 'rgba(33,150,243,0.08)' : 'rgba(33,150,243,0.05)',
        innerGlowActive: isDark ? 'rgba(33,150,243,0.16)' : 'rgba(33,150,243,0.10)',

        // Chrome (header / bottom nav) — frosted glass over content
        chrome: isDark ? 'rgba(12,12,14,0.78)' : 'rgba(248,249,250,0.78)',
        chromeDense: isDark ? 'rgba(5,5,6,0.88)' : 'rgba(248,249,250,0.88)',
        chromeSolid: isDark ? '#050506' : '#F8F9FA',
        chromeBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
        chromeSpecular: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.50)',

        // Text
        text: isDark ? '#FAFAFA' : '#111113',
        textSecondary: isDark ? '#D4D4D8' : '#3F3F46',
        textMuted: isDark ? '#A1A1AA' : '#71717A',
        textSubtle: isDark ? '#71717A' : '#A1A1AA',

        // Brand
        primary: Brand.primary,
        primarySoft: isDark ? Brand.primarySoft : Brand.primary,
        primaryMuted: isDark ? 'rgba(93, 211, 243,0.16)' : 'rgba(33, 150, 243,0.10)',
        primaryGlow: isDark ? Brand.primaryGlow : 'rgba(33,150,243,0.25)',

        // Status
        success: Brand.success,
        successMuted: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.10)',
        danger: Brand.danger,
        dangerMuted: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)',
        warning: Brand.warning,
        warningMuted: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.10)',

        // Borders / hairlines
        border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
        borderFocus: isDark ? 'rgba(33,150,243,0.55)' : 'rgba(33,150,243,0.45)',
        borderError: isDark ? 'rgba(239,68,68,0.55)' : 'rgba(239,68,68,0.45)',
        divider: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',

        // Overlay
        overlay: isDark ? 'rgba(0,0,0,0.60)' : 'rgba(5,5,6,0.35)',
    };
}

/* ─── Atmosphere Gradient ────────────────────────────────────────── */

/** Ambient atmosphere — 4-stop gradient with subtle brand whisper. */
export function atmosphere(isDark: boolean): [string, string, string, string] {
    return isDark
        ? ['#050506', '#08070E', '#0A0910', '#050506']
        : ['#F8F9FA', '#F5F3FA', '#F0F4FE', '#F8F9FA'];
}

/* ─── Elevation System ───────────────────────────────────────────── */

export const Elevation = {
    1: (isDark: boolean): ViewStyle =>
        Platform.OS === 'web'
            ? ({ boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(5,5,6,0.06)' } as ViewStyle)
            : {
                  shadowColor: isDark ? '#000' : '#111113',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.3 : 0.06,
                  shadowRadius: 4,
                  elevation: 2,
              },
    2: (isDark: boolean): ViewStyle =>
        Platform.OS === 'web'
            ? ({ boxShadow: isDark ? '0 6px 20px rgba(0,0,0,0.45)' : '0 6px 20px rgba(5,5,6,0.08)' } as ViewStyle)
            : {
                  shadowColor: isDark ? '#000' : '#111113',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.35 : 0.08,
                  shadowRadius: 10,
                  elevation: 4,
              },
    3: (isDark: boolean): ViewStyle =>
        Platform.OS === 'web'
            ? ({
                  boxShadow: isDark
                      ? '0 10px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)'
                      : '0 10px 32px rgba(5,5,6,0.10), 0 2px 8px rgba(5,5,6,0.04)',
              } as ViewStyle)
            : {
                  shadowColor: isDark ? '#000' : '#111113',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: isDark ? 0.45 : 0.10,
                  shadowRadius: 18,
                  elevation: 8,
              },
};

/* ─── Glass Shadow (legacy compat — maps to Elevation.2) ─────────── */

export function glassShadow(isDark: boolean): ViewStyle {
    return Elevation[2](isDark);
}

/* ─── Touch Target ───────────────────────────────────────────────── */

export const Touch = {
    min: 44,
} as const;

/* ─── Animation Presets ──────────────────────────────────────────── */

export const Motion = {
    /** Spring for press scale (0.97 → 1.0) */
    pressSpring: { damping: 15, stiffness: 300, mass: 0.8 },
    /** Spring for layout transitions */
    layoutSpring: { damping: 20, stiffness: 200 },
    /** Duration for color/opacity transitions (ms) */
    colorTransition: 200,
    /** Scale value when pressed */
    pressedScale: 0.97,
} as const;
