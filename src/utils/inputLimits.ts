/** Límites coherentes por tipo de dato en formularios de onboarding/KYC. */
export const LIMITS = {
    name: 80,
    email: 254,
    password: 128,
    ein: 10, // XX-XXXXXXX
    businessAddress: 200,
    businessName: 120,
    socialUrl: 500,
    socialHandle: 30,
    referralCode: 32,
    phone: 20,
    taxId: 20,
    legalRep: 80,
} as const;

export const MIN = {
    businessAddress: 10,
    name: 2,
    businessName: 2,
    password: 8,
} as const;

export function clamp(text: string, max: number) {
    return text.slice(0, max);
}

/** EIN federal US: 9 dígitos → XX-XXXXXXX */
export function formatEin(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function isValidEin(ein: string) {
    return /^\d{2}-\d{7}$/.test(ein.trim());
}

export function isValidBusinessAddress(addr: string) {
    const t = addr.trim();
    return t.length >= MIN.businessAddress && t.length <= LIMITS.businessAddress;
}

export function isValidSocialUrl(raw: string) {
    const t = raw.trim();
    if (!t || t.length > LIMITS.socialUrl) return false;
    try {
        const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
        return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.');
    } catch {
        return false;
    }
}

export function formatReferralCode(raw: string) {
    return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, LIMITS.referralCode);
}

export function formatSocialHandle(raw: string) {
    return raw.replace(/^@+/, '').replace(/[^\w.]/g, '').slice(0, LIMITS.socialHandle);
}

export function formatPhone(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 15);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;
}

export function formatTaxId(raw: string) {
    return clamp(raw.replace(/[^\dA-Za-z-]/g, ''), LIMITS.taxId);
}

// ponytail: self-check mínimo
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    console.assert(formatEin('123456789') === '12-3456789', 'formatEin');
    console.assert(isValidEin('12-3456789'), 'isValidEin');
    console.assert(!isValidSocialUrl('notaurl'), 'isValidSocialUrl reject');
}
