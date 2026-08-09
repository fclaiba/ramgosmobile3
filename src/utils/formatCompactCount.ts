/** Compact display for social counters (1200 → 1.2K). */
export function formatCompactCount(value: unknown): string {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) return '0';
    if (n < 1000) return String(Math.floor(n));
    if (n < 1_000_000) {
        const k = n / 1000;
        const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
        return `${rounded}K`.replace(/\.0K$/, 'K');
    }
    const m = n / 1_000_000;
    const rounded = m >= 100 ? Math.round(m) : Math.round(m * 10) / 10;
    return `${rounded}M`.replace(/\.0M$/, 'M');
}
