/**
 * Apple Sign-In for web.
 *
 * Apple no permite localhost como Return URL. El flujo es:
 * 1) Popup → appleid.apple.com
 * 2) Apple hace form_post a EXPO_PUBLIC_CONVEX_SITE_URL/auth/apple/callback
 * 3) Convex responde HTML que hace postMessage al opener (tu localhost)
 */
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

/** Services ID (Identifiers → Services IDs), no el Bundle ID. */
const appleClientId = process.env.EXPO_PUBLIC_APPLE_CLIENT_ID;
const convexSiteUrl = (process.env.EXPO_PUBLIC_CONVEX_SITE_URL || '').replace(
    /\/$/,
    '',
);

export function configureAppleSignIn(): void {
    if ((!appleClientId || !convexSiteUrl) && __DEV__) {
        console.warn(
            '[appleSignIn web] Falta EXPO_PUBLIC_APPLE_CLIENT_ID (Services ID) y/o EXPO_PUBLIC_CONVEX_SITE_URL.',
        );
    }
}

export class AppleSignInCancelledError extends Error {
    constructor() {
        super('Inicio de sesión con Apple cancelado.');
        this.name = 'AppleSignInCancelledError';
    }
}

export async function isAppleSignInAvailable(): Promise<boolean> {
    return !!(appleClientId && convexSiteUrl);
}

function generateNonce(length = 32): string {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const random = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(random);
    } else {
        for (let i = 0; i < length; i++) random[i] = Math.floor(Math.random() * 256);
    }
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[random[i] % chars.length];
    }
    return result;
}

function encodeState(appOrigin: string, nonce: string): string {
    return btoa(JSON.stringify({ o: appOrigin, n: nonce }));
}

type AppleMessage = {
    source?: string;
    id_token?: string | null;
    user?: string | null;
    error?: string | null;
};

function parseFullName(userJson: string | null | undefined): string | undefined {
    if (!userJson) return undefined;
    try {
        const user = JSON.parse(userJson) as {
            name?: { firstName?: string; lastName?: string };
            email?: string;
        };
        const full = [user.name?.firstName, user.name?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();
        return full || undefined;
    } catch {
        return undefined;
    }
}

function parseEmail(userJson: string | null | undefined): string | undefined {
    if (!userJson) return undefined;
    try {
        const user = JSON.parse(userJson) as { email?: string };
        return user.email?.trim() || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Web Apple Sign-In via popup + Convex form_post callback.
 *
 * Apple Developer → Services ID → Domains:
 *   academic-lapwing-311.convex.site  (sin https://)
 * Return URLs:
 *   https://academic-lapwing-311.convex.site/auth/apple/callback
 */
export async function signInWithApple(): Promise<{
    identityToken: string;
    email?: string;
    fullName?: string;
}> {
    if (!appleClientId) {
        throw new Error(
            'Apple Sign-In web no configurado. Definí EXPO_PUBLIC_APPLE_CLIENT_ID (Services ID).',
        );
    }
    if (!convexSiteUrl) {
        throw new Error('Falta EXPO_PUBLIC_CONVEX_SITE_URL para el callback de Apple.');
    }
    if (typeof window === 'undefined') {
        throw new Error('Sign in with Apple web solo corre en el navegador.');
    }

    const redirectUri = `${convexSiteUrl}/auth/apple/callback`;
    const appOrigin = window.location.origin;
    const nonce = generateNonce();
    const state = encodeState(appOrigin, nonce);

    const authUrl = new URL('https://appleid.apple.com/auth/authorize');
    authUrl.searchParams.set('client_id', appleClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code id_token');
    authUrl.searchParams.set('response_mode', 'form_post');
    authUrl.searchParams.set('scope', 'name email');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    if (__DEV__) {
        console.log('[appleSignIn web] redirect_uri (Return URL en Apple):', redirectUri);
        console.log('[appleSignIn web] client_id (Services ID):', appleClientId);
    }

    return new Promise((resolve, reject) => {
        const popup = window.open(
            authUrl.toString(),
            'ramgos-apple-signin',
            'width=520,height=720,menubar=no,toolbar=no',
        );

        if (!popup) {
            reject(
                new Error(
                    'El navegador bloqueó el popup de Apple. Permití ventanas emergentes para este sitio.',
                ),
            );
            return;
        }

        let settled = false;
        const siteOrigin = new URL(convexSiteUrl).origin;

        const cleanup = () => {
            window.removeEventListener('message', onMessage);
            clearInterval(closedPoll);
        };

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            try {
                popup.close();
            } catch {
                /* ignore */
            }
            fn();
        };

        const onMessage = (event: MessageEvent) => {
            if (event.origin !== siteOrigin) return;
            const data = event.data as AppleMessage;
            if (!data || data.source !== 'ramgos-apple-auth') return;

            if (data.error) {
                finish(() => reject(new Error(String(data.error))));
                return;
            }
            if (!data.id_token) {
                finish(() =>
                    reject(new Error('Apple no devolvió id_token en el callback.')),
                );
                return;
            }

            finish(() =>
                resolve({
                    identityToken: data.id_token!,
                    email: parseEmail(data.user),
                    fullName: parseFullName(data.user),
                }),
            );
        };

        window.addEventListener('message', onMessage);

        const closedPoll = setInterval(() => {
            if (!popup.closed || settled) return;
            finish(() => reject(new AppleSignInCancelledError()));
        }, 400);
    });
}
