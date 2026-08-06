import {
    GoogleSignin,
    isErrorWithCode,
    isSuccessResponse,
    statusCodes,
} from '@react-native-google-signin/google-signin';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export function configureGoogleSignIn(): void {
    if (!webClientId) {
        if (__DEV__) {
            console.warn(
                '[googleSignIn] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no configurado.',
            );
        }
        return;
    }

    GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
    });
}

export class GoogleSignInCancelledError extends Error {
    constructor() {
        super('Inicio de sesión con Google cancelado.');
        this.name = 'GoogleSignInCancelledError';
    }
}

export async function signInWithGoogle(): Promise<{ idToken: string }> {
    if (!webClientId) {
        throw new Error('Google Sign-In no configurado en la app.');
    }

    try {
        await GoogleSignin.hasPlayServices({
            showPlayServicesUpdateDialog: true,
        });
        const response = await GoogleSignin.signIn();

        if (!isSuccessResponse(response)) {
            throw new GoogleSignInCancelledError();
        }

        const idToken = response.data.idToken;
        if (!idToken) {
            throw new Error('Google no devolvió idToken. Revisá el Web Client ID.');
        }

        return { idToken };
    } catch (error) {
        if (error instanceof GoogleSignInCancelledError) {
            throw error;
        }
        if (isErrorWithCode(error)) {
            if (error.code === statusCodes.SIGN_IN_CANCELLED) {
                throw new GoogleSignInCancelledError();
            }
            if (error.code === statusCodes.IN_PROGRESS) {
                throw new Error('Google Sign-In ya está en progreso.');
            }
            if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                throw new Error('Google Play Services no está disponible.');
            }
        }
        throw error;
    }
}
