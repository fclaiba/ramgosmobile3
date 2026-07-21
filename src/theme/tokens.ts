/**
 * Ramgos Design Tokens — marketplace / fintech / rewards.
 * Direction: refined utilitarian. Brand violet is accent, NOT wallpaper.
 * Liquid Glass reserved for chrome (nav, headers, sheets, interactive panels).
 */
import { Platform, ViewStyle } from 'react-native';
import { Brand } from './brand';

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

export const Radius = {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    '2xl': 28,
    full: 999,
} as const;

export const Type = {
    caption: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.2 },
    bodySm: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
    body: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
    title: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
    heading: { fontSize: 22, lineHeight: 28, fontWeight: '800' as const, letterSpacing: -0.4 },
    display: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const, letterSpacing: -0.6 },
};

/** Semantic colors — light/dark. Neutral canvas + brand accent. */
export function colors(isDark: boolean) {
    return {
        // Canvas (NOT purple)
        bg: isDark ? '#09090B' : '#FAFAFA',
        bgElevated: isDark ? '#18181B' : '#FFFFFF',
        // Glass fills (cards / panels — not chrome)
        glass: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
        glassStrong: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.88)',
        glassBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
        // Chrome (header / bottom nav) — frosted glass over content
        // Soft enough for blur to read; dense enough for text contrast (WCAG-friendly)
        chrome: isDark ? 'rgba(24,24,27,0.72)' : 'rgba(255,255,255,0.72)',
        chromeDense: isDark ? 'rgba(9,9,11,0.88)' : 'rgba(250,250,250,0.88)', // Android / weak blur
        chromeSolid: isDark ? '#09090B' : '#FAFAFA',
        chromeBorder: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
        chromeSpecular: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)',
        // Text
        text: isDark ? '#FAFAFA' : '#18181B',
        textMuted: isDark ? '#A1A1AA' : '#71717A',
        textSubtle: isDark ? '#71717A' : '#A1A1AA',
        // Brand
        primary: Brand.primary,
        primarySoft: isDark ? Brand.primarySoft : Brand.primary,
        primaryMuted: isDark ? 'rgba(93, 211, 243,0.16)' : 'rgba(33, 150, 243,0.10)',
        // Status
        success: Brand.success,
        danger: Brand.danger,
        warning: Brand.warning,
        // Borders / hairlines
        border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
        divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        // Overlay
        overlay: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(24,24,27,0.35)',
    };
}

/** Subtle atmosphere gradient — brand whisper only, not purple wallpaper. */
export function atmosphere(isDark: boolean): [string, string, string] {
    return isDark
        ? ['#09090B', '#0C0A14', '#09090B']
        : ['#FAFAFA', '#F8F7FC', '#FAFAFA'];
}

export function glassShadow(isDark: boolean): ViewStyle {
    if (Platform.OS === 'web') {
        return {
            boxShadow: isDark
                ? '0 8px 28px rgba(0,0,0,0.4)'
                : '0 8px 28px rgba(24,24,27,0.08)',
        } as ViewStyle;
    }
    return {
        shadowColor: isDark ? '#000' : '#18181B',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.35 : 0.08,
        shadowRadius: 14,
        elevation: 4,
    };
}

export const Touch = {
    min: 44,
} as const;
