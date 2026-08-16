/**
 * Ramgos brand tokens — single source of truth.
 * Liquid Glass surfaces must tint with these, not generic iOS blue/purple kits.
 */
export const Brand = {
    primary: '#2196F3',
    primaryDark: '#1565C0',
    primaryLight: '#4FC3F7',
    primarySoft: '#5DD3F3',
    accent: '#29B6F6',
    accentPink: '#DB2777',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',

    /** Glow colors for specular / interactive states */
    primaryGlow: 'rgba(33, 150, 243, 0.35)',
    surfaceGlow: 'rgba(33, 150, 243, 0.12)',

    /** CTA gradient (start → end) */
    gradient: ['#1E88E5', '#29B6F6'] as [string, string],
    gradientVivid: ['#1565C0', '#4FC3F7'] as [string, string],
} as const;

export const brandTint = (isDark: boolean, alpha = 0.14) =>
    isDark ? `rgba(93, 211, 243,${alpha})` : `rgba(33, 150, 243,${alpha})`;

export const brandText = (isDark: boolean) => (isDark ? Brand.primarySoft : Brand.primary);
