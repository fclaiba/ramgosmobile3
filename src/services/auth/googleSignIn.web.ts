import {
    AuthRequest,
    ResponseType,
    makeRedirectUri,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';

WebBrowser.maybeCompleteAuthSession();

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const googleDiscovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export function configureGoogleSignIn(): void {
    if (!webClientId && __DEV__) {
        console.warn(
            '[googleSignIn] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no configurado.',
        );
    }
}

export class GoogleSignInCancelledError extends Error {
    constructor() {
        super('Inicio de sesión con Google cancelado.');
        this.name = 'GoogleSignInCancelledError';
    }
}

function generateNonce(length = 32): string {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const random = Crypto.getRandomValues(new Uint8Array(length));
    for (let i = 0; i < length; i++) {
        result += chars[random[i] % chars.length];
    }
    return result;
}

/**
 * Web Google Sign-In via OIDC id_token (implicit).
 * Register this redirect URI in Google Cloud Web client:
 * - Authorized JavaScript origins: http://localhost:8081 (or your port)
 * - Authorized redirect URIs: same origin (e.g. http://localhost:8081)
 */
export async function signInWithGoogle(): Promise<{ idToken: string }> {
    if (!webClientId) {
        throw new Error('Google Sign-In no configurado en la app.');
    }

    const redirectUri = makeRedirectUri();
    if (__DEV__) {
        console.log(
            '[googleSignIn web] redirectUri (agregalo en Google Cloud → Web client):',
            redirectUri,
        );
    }
    const nonce = generateNonce();

    const request = new AuthRequest({
        clientId: webClientId,
        scopes: ['openid', 'profile', 'email'],
        responseType: ResponseType.IdToken,
        redirectUri,
        usePKCE: false,
        extraParams: {
            nonce,
            prompt: 'select_account',
        },
    });

    const result = await request.promptAsync(googleDiscovery);

    if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new GoogleSignInCancelledError();
    }
    if (result.type !== 'success') {
        throw new Error('No se pudo completar el inicio con Google.');
    }

    const idToken = result.params.id_token;
    if (!idToken) {
        throw new Error(
            'Google no devolvió idToken. Revisá el Web Client ID y las redirect URIs en Google Cloud.',
        );
    }

    return { idToken };
}
