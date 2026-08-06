import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

export function configureAppleSignIn(): void {
    // Native Apple Sign-In is configured via app.json (usesAppleSignIn + plugin).
}

export class AppleSignInCancelledError extends Error {
    constructor() {
        super('Inicio de sesión con Apple cancelado.');
        this.name = 'AppleSignInCancelledError';
    }
}

export async function isAppleSignInAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
        return await AppleAuthentication.isAvailableAsync();
    } catch {
        return false;
    }
}

export async function signInWithApple(): Promise<{
    identityToken: string;
    email?: string;
    fullName?: string;
}> {
    if (Platform.OS !== 'ios') {
        throw new Error('Sign in with Apple en nativo solo está disponible en iOS.');
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
        throw new Error(
            'Sign in with Apple no está disponible en este dispositivo. Probá en un iPhone físico.',
        );
    }

    try {
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
        });

        if (!credential.identityToken) {
            throw new Error(
                'Apple no devolvió identityToken. Activá Sign In with Apple en el App ID.',
            );
        }

        const fullName = [
            credential.fullName?.givenName,
            credential.fullName?.familyName,
        ]
            .filter(Boolean)
            .join(' ')
            .trim();

        return {
            identityToken: credential.identityToken,
            email: credential.email ?? undefined,
            fullName: fullName || undefined,
        };
    } catch (error: unknown) {
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code: string }).code === 'ERR_REQUEST_CANCELED'
        ) {
            throw new AppleSignInCancelledError();
        }
        throw error;
    }
}
