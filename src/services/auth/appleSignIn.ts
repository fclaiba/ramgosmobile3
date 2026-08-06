/**
 * Platform-specific implementations live in:
 * - appleSignIn.web.ts (expo-auth-session OIDC + Services ID)
 * - appleSignIn.native.ts (expo-apple-authentication)
 */
export {
    configureAppleSignIn,
    signInWithApple,
    isAppleSignInAvailable,
    AppleSignInCancelledError,
} from './appleSignIn.native';
