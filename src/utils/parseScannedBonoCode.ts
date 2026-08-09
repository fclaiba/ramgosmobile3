/**
 * Extract a redeemable bono code from a QR / barcode payload.
 * Accepts plain codes (BNO-…), URLs, and deep links with query params.
 */
export function parseScannedBonoCode(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    let text = String(raw).trim();
    if (!text) return null;

    // Strip surrounding quotes / whitespace noise
    text = text.replace(/^["'\s]+|["'\s]+$/g, '');

    // Try URL / deep-link shapes first
    const fromUrl = extractFromUrlLike(text);
    if (fromUrl) return normalizeCode(fromUrl);

    // Path-ish: …/redeem/CODE, …/bono/CODE or …/code/CODE
    const pathMatch = text.match(/(?:redeem|bono|code|bn)[/:=]([A-Za-z0-9_-]+)/i);
    if (pathMatch?.[1]) return normalizeCode(pathMatch[1]);

    // Plain code (may include spaces the cashier typed)
    return normalizeCode(text);
}

function extractFromUrlLike(text: string): string | null {
    // ramgos://bono/CODE or https://…
    const candidate = text.includes('://') || text.startsWith('ramgos:')
        ? text
        : text.startsWith('http')
          ? text
          : null;

    // Also accept host-less paths that look like URLs with query
    const withQuery = text.includes('?') || text.includes('://') ? text : candidate;
    if (!withQuery) return null;

    try {
        const url = withQuery.includes('://')
            ? new URL(withQuery)
            : new URL(withQuery, 'https://ramgos.app');

        const keys = ['bonoCode', 'bono', 'code', 'c'];
        for (const key of keys) {
            const v = url.searchParams.get(key);
            if (v) return v;
        }

        // pathname: /redeem/CODE or /bono/CODE (POS QR uses redeem)
        const parts = url.pathname.split('/').filter(Boolean);
        const redeemIdx = parts.findIndex((p) => p.toLowerCase() === 'redeem');
        if (redeemIdx >= 0 && parts[redeemIdx + 1]) {
            return parts[redeemIdx + 1];
        }
        const bonoIdx = parts.findIndex((p) => p.toLowerCase() === 'bono');
        if (bonoIdx >= 0 && parts[bonoIdx + 1]) {
            const candidate = parts[bonoIdx + 1];
            // Marketing links use listing ids; redeem codes look like BNO-…
            if (/^BNO[-_]/i.test(candidate) || candidate.length >= 8) {
                return candidate;
            }
        }
    } catch {
        // fall through
    }

    // Query string without full URL: bonoCode=BNO-…
    const qs = text.match(/(?:^|[?&#])(?:bonoCode|bono|code)=([^&#\s]+)/i);
    if (qs?.[1]) {
        try {
            return decodeURIComponent(qs[1]);
        } catch {
            return qs[1];
        }
    }

    return null;
}

function normalizeCode(code: string): string | null {
    const cleaned = String(code || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase();
    if (!cleaned) return null;
    // Reasonable length guard (mock / real codes are short)
    if (cleaned.length < 4 || cleaned.length > 64) return null;
    // Reject obvious garbage (no alphanumerics)
    if (!/[A-Z0-9]/.test(cleaned)) return null;
    return cleaned;
}
