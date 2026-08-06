/**
 * Platform-specific implementations live in:
 * - googleSignIn.web.ts (expo-auth-session OIDC)
 * - googleSignIn.native.ts (@react-native-google-signin)
 *
 * This file is the TypeScript fallback when the resolver does not pick a platform suffix.
 */
export {
    configureGoogleSignIn,
    signInWithGoogle,
    GoogleSignInCancelledError,
} from './googleSignIn.native';
