/**
 * Prepaid-credit bono share / deep-link helpers.
 * Canonical: https://ramgos.app/ref/{code}?bono={listingId}
 * Also: ramgos://bono/{listingId}?ref={code}
 * Legacy .com URLs are still parsed.
 */

import { APP_WEB_ORIGIN, referralWebLink, webPath } from '../config/appOrigin';

export type ParsedBonoDeepLink = {
    listingId: string;
    referralCode: string;
};

/**
 * Canonical POS redeem QR payload (not a marketing listing link).
 * Parsed by `parseScannedBonoCode` → plain BNO-… code.
 */
export function buildBonoRedeemPayload(bonoCode: string): string {
    const code = String(bonoCode || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase();
    if (!code) return '';
    return `ramgos://redeem/${encodeURIComponent(code)}`;
}

/** Build share URL for an influencer bono listing. */
export function buildBonoShareLink(opts: {
    referralCodeOrLink: string;
    listingId: string;
}): string {
    const id = String(opts.listingId || '').trim();
    const raw = String(opts.referralCodeOrLink || '').trim();
    if (!id) return '';

    if (/^https?:\/\//i.test(raw) || raw.startsWith('ramgos://')) {
        const sep = raw.includes('?') ? '&' : '?';
        return `${raw}${sep}bono=${encodeURIComponent(id)}`;
    }

    const code = raw.replace(/^@+/, '');
    if (!code) {
        return `ramgos://bono/${encodeURIComponent(id)}`;
    }
    return `${referralWebLink(code)}?bono=${encodeURIComponent(id)}`;
}

/**
 * Parse bono deep links / share URLs.
 * Returns null if URL is not a bono+ref link.
 */
export function parseBonoDeepLink(url: string | null | undefined): ParsedBonoDeepLink | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    try {
        // ramgos://bono/{id}?ref=CODE
        const schemeMatch = trimmed.match(
            /^ramgos:\/\/bono\/([^/?#]+)(?:\?([^#]*))?/i,
        );
        if (schemeMatch) {
            const listingId = decodeURIComponent(schemeMatch[1]);
            const qs = new URLSearchParams(schemeMatch[2] || '');
            const referralCode = (qs.get('ref') || qs.get('referral') || '').trim();
            if (listingId) {
                return { listingId, referralCode };
            }
        }

        // Path-only from React Navigation linking (no host): ref/CODE?bono=ID or bono/ID?ref=CODE
        const asUrlish = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
            ? trimmed
            : trimmed.startsWith('//')
              ? `https:${trimmed}`
              : webPath(trimmed.replace(/^\//, ''));

        const u = new URL(asUrlish);
        const bonoParam = u.searchParams.get('bono') || u.searchParams.get('bonus');
        const refParam =
            u.searchParams.get('ref') ||
            u.searchParams.get('referral') ||
            u.searchParams.get('referralCode') ||
            '';

        const pathParts = u.pathname.split('/').filter(Boolean);
        const refIdx = pathParts.findIndex((p) => p.toLowerCase() === 'ref');
        let referralCode = refParam.trim();
        if (!referralCode && refIdx >= 0 && pathParts[refIdx + 1]) {
            referralCode = decodeURIComponent(pathParts[refIdx + 1]);
        }

        const bonoIdx = pathParts.findIndex((p) => p.toLowerCase() === 'bono');
        let listingId = (bonoParam || '').trim();
        if (!listingId && bonoIdx >= 0 && pathParts[bonoIdx + 1]) {
            listingId = decodeURIComponent(pathParts[bonoIdx + 1]);
        }

        if (listingId) {
            return { listingId, referralCode };
        }
    } catch {
        return null;
    }
    return null;
}

export { APP_WEB_ORIGIN };
