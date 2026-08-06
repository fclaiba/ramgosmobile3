/** Canonical public web origin for share links and deep links. */

export const APP_WEB_ORIGIN = 'https://ramgos.app';

/** Hosts accepted when parsing deep links (includes legacy .com). */
export const APP_WEB_HOSTS = [
    'ramgos.app',
    'www.ramgos.app',
    'ramgos.com',
    'www.ramgos.com',
] as const;

/** Join APP_WEB_ORIGIN with a path (leading slash optional). */
export function webPath(path: string): string {
    const p = String(path || '').trim();
    if (!p) return APP_WEB_ORIGIN;
    if (/^https?:\/\//i.test(p)) return p;
    return `${APP_WEB_ORIGIN}${p.startsWith('/') ? p : `/${p}`}`;
}

/** Preferred share URL for a referral code (alias or handle). */
export function referralWebLink(code: string): string {
    const cleaned = String(code || '')
        .trim()
        .replace(/^@+/, '');
    if (!cleaned) return '';
    return webPath(`/ref/${encodeURIComponent(cleaned)}`);
}
