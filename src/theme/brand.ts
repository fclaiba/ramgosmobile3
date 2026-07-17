/**
 * Ramgos brand tokens — single source of truth.
 * Liquid Glass surfaces must tint with these, not generic iOS blue/purple kits.
 */
export const Brand = {
    primary: '#7C3AED',
    primaryDark: '#6D28D9',
    primaryLight: '#8B5CF6',
    primarySoft: '#A78BFA',
    accent: '#9333EA',
    accentPink: '#DB2777',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
} as const;

export const brandTint = (isDark: boolean, alpha = 0.14) =>
    isDark ? `rgba(167,139,250,${alpha})` : `rgba(124,58,237,${alpha})`;

export const brandText = (isDark: boolean) => (isDark ? Brand.primarySoft : Brand.primary);
