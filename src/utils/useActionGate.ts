import { useCallback, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as Haptics from 'expo-haptics';

/**
 * Gate reasons that explain why an action was blocked
 */
type GateReason = 'loading' | 'anonymous' | 'pending_verification' | 'kyc_required';

/**
 * Gate categories for analytics tracking
 */
type GateCategory = 'checkout' | 'sell_publish_withdraw' | 'social' | 'withdraw';

/**
 * Represents a blocked action with all necessary info for UI feedback
 */
type GateBlock = {
  reason: GateReason;
  title: string;
  message: string;
  ctaLabel: string;
  onCta: () => void;
};

/**
 * Options for gate functions
 */
type GateOptions = {
  /** Called when the action is allowed */
  onAllowed?: () => void;
  /** Called when the action is blocked */
  onBlocked?: (block: GateBlock) => void;
  /** If true, skips the alert/toast feedback (for custom UI handling) */
  silent?: boolean;
};

/**
 * Analytics event for blocked actions (can be extended to send to analytics service)
 */
const logGateEvent = (category: GateCategory, reason: GateReason, allowed: boolean) => {
  if (__DEV__) {
    console.log(`[ActionGate] ${category.toUpperCase()} - ${allowed ? 'ALLOWED' : `BLOCKED:${reason}`}`);
  }
  // Analytics event sent to external service
  // analytics.track('action_gate', { category, reason, allowed });
};

/**
 * Haptic feedback for blocked actions
 */
const triggerBlockedHaptic = () => {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
};

/**
 * Central hook for controlling access to sensitive actions based on user state.
 * 
 * @example
 * ```tsx
 * const { gateCheckout, canCheckout } = useActionGate();
 * 
 * // Declarative check
 * if (!canCheckout) {
 *   return <LoginPrompt />;
 * }
 * 
 * // Imperative check with feedback
 * const handleBuy = () => {
 *   if (!gateCheckout()) return;
 *   // proceed with checkout
 * };
 * ```
 */
export function useActionGate() {
  const navigation = useNavigation<any>();
  const { show } = useToast();
  const { status, user, pendingVerification } = useAuth();

  const emailForVerification = pendingVerification?.email ?? user?.email;

  const kycRouteName = user?.role === 'business' ? 'VerifyBusiness' : 'KYC';
  const kycRouteParams =
    user?.role === 'business' ? undefined : { accountType: user?.role ?? 'consumer' };

  /* Safe check for KYC approval:
   * 1. If not required, approved.
   * 2. If status is 'approved', approved.
   * 3. Business role users are handled differently (via VerifyBusiness), but if they have status 'approved' they are good.
   */
  const isKycApproved = (!user?.requiresKyc) || (user?.kycStatus === 'approved');
  const isEmailVerified = status === 'authenticated';

  const getCheckoutBlock = useCallback((): GateBlock | null => {
    if (status === 'loading') {
      return {
        reason: 'loading',
        title: 'Cargando',
        message: 'Espera un momento e intenta nuevamente.',
        ctaLabel: 'Entendido',
        onCta: () => { },
      };
    }

    if (status === 'anonymous') {
      return {
        reason: 'anonymous',
        title: 'Inicia sesión para pagar',
        message: 'Puedes armar tu carrito como visitante, pero para confirmar el pago necesitas iniciar sesión.',
        ctaLabel: 'Iniciar sesión',
        onCta: () => navigation.navigate('Login'),
      };
    }

    return null;
  }, [navigation, status]);

  const getSellPublishWithdrawBlock = useCallback((): GateBlock | null => {
    if (status === 'loading') {
      return {
        reason: 'loading',
        title: 'Cargando',
        message: 'Espera un momento e intenta nuevamente.',
        ctaLabel: 'Entendido',
        onCta: () => { },
      };
    }

    if (status === 'anonymous') {
      return {
        reason: 'anonymous',
        title: 'Inicia sesión para continuar',
        message: 'Necesitas una cuenta para vender, publicar o retirar.',
        ctaLabel: 'Iniciar sesión',
        onCta: () => navigation.navigate('Login'),
      };
    }

    if (status === 'pending_verification') {
      return {
        reason: 'pending_verification',
        title: 'Verifica tu email',
        message: 'Para vender, publicar o retirar primero debes verificar tu email.',
        ctaLabel: 'Verificar email',
        onCta: () => navigation.navigate('Verification', { email: emailForVerification }),
      };
    }

    if (status === 'authenticated' && !user) {
      return {
        reason: 'anonymous',
        title: 'Inicia sesión para continuar',
        message: 'Necesitas una cuenta para vender, publicar o retirar.',
        ctaLabel: 'Iniciar sesión',
        onCta: () => navigation.navigate('Login'),
      };
    }

    if (status === 'authenticated' && user && !isKycApproved) {
      return {
        reason: 'kyc_required',
        title: 'Verificación KYC requerida',
        message: 'Para vender, publicar o retirar necesitas completar tu verificación KYC.',
        ctaLabel: 'Ir a KYC',
        onCta: () => navigation.navigate(kycRouteName, kycRouteParams),
      };
    }

    return null;
  }, [emailForVerification, isKycApproved, kycRouteName, kycRouteParams, navigation, status, user]);

  /**
   * Get block for social actions (comment, post, follow, like)
   * These require login but NOT KYC or email verification
   */
  const getSocialBlock = useCallback((): GateBlock | null => {
    if (status === 'loading') {
      return {
        reason: 'loading',
        title: 'Cargando',
        message: 'Espera un momento e intenta nuevamente.',
        ctaLabel: 'Entendido',
        onCta: () => { },
      };
    }

    if (status === 'anonymous') {
      return {
        reason: 'anonymous',
        title: 'Únete a la comunidad',
        message: 'Crea una cuenta o inicia sesión para interactuar con otros usuarios.',
        ctaLabel: 'Iniciar sesión',
        onCta: () => navigation.navigate('Login'),
      };
    }

    // Social actions don't require email verification or KYC
    return null;
  }, [navigation, status]);

  const promptBlocked = useCallback(
    (block: GateBlock, extraButtons?: Array<{ text: string; onPress: () => void; style?: 'cancel' | 'default' | 'destructive' }>) => {
      const buttons = [
        ...(extraButtons ?? []),
        { text: block.ctaLabel, onPress: block.onCta },
      ];
      Alert.alert(block.title, block.message, buttons);
    },
    [],
  );

  /**
   * Gate checkout actions - blocks anonymous users
   * @returns true if allowed, false if blocked
   */
  const gateCheckout = useCallback(
    (options?: GateOptions) => {
      const block = getCheckoutBlock();
      if (block) {
        logGateEvent('checkout', block.reason, false);
        triggerBlockedHaptic();
        options?.onBlocked?.(block);

        if (!options?.silent) {
          show(block.message, block.reason === 'anonymous' ? 'info' : 'warning');
          if (block.reason === 'anonymous') {
            promptBlocked(block, [
              { text: 'Cancelar', onPress: () => { }, style: 'cancel' },
              { text: 'Registrarme', onPress: () => navigation.navigate('Register') },
            ]);
          } else {
            promptBlocked(block, [{ text: 'Ok', onPress: () => { }, style: 'cancel' }]);
          }
        }
        return false;
      }
      logGateEvent('checkout', 'anonymous', true);
      options?.onAllowed?.();
      return true;
    },
    [getCheckoutBlock, navigation, promptBlocked, show],
  );

  /**
   * Gate sell/publish/withdraw actions - blocks anonymous, unverified, and non-KYC users
   * @returns true if allowed, false if blocked
   */
  const gateSellPublishWithdraw = useCallback(
    (options?: GateOptions) => {
      const block = getSellPublishWithdrawBlock();
      if (block) {
        logGateEvent('sell_publish_withdraw', block.reason, false);
        triggerBlockedHaptic();
        options?.onBlocked?.(block);

        if (!options?.silent) {
          show(block.message, block.reason === 'pending_verification' ? 'warning' : 'info');
          if (block.reason === 'anonymous') {
            promptBlocked(block, [
              { text: 'Cancelar', onPress: () => { }, style: 'cancel' },
              { text: 'Registrarme', onPress: () => navigation.navigate('Register') },
            ]);
          } else {
            promptBlocked(block, [{ text: 'Cancelar', onPress: () => { }, style: 'cancel' }]);
          }
        }
        return false;
      }
      logGateEvent('sell_publish_withdraw', 'anonymous', true);
      options?.onAllowed?.();
      return true;
    },
    [getSellPublishWithdrawBlock, navigation, promptBlocked, show],
  );

  /**
   * Gate withdraw actions - alias for gateSellPublishWithdraw
   * @returns true if allowed, false if blocked
   */
  const gateWithdraw = useCallback(
    (options?: GateOptions) => {
      const block = getSellPublishWithdrawBlock();
      if (block) {
        logGateEvent('withdraw', block.reason, false);
        triggerBlockedHaptic();
        options?.onBlocked?.(block);

        if (!options?.silent) {
          show(block.message, block.reason === 'pending_verification' ? 'warning' : 'info');
          promptBlocked(block, [{ text: 'Cancelar', onPress: () => { }, style: 'cancel' }]);
        }
        return false;
      }
      logGateEvent('withdraw', 'anonymous', true);
      options?.onAllowed?.();
      return true;
    },
    [getSellPublishWithdrawBlock, promptBlocked, show],
  );

  /**
   * Gate social actions (comment, post, follow, like) - only blocks anonymous users
   * @returns true if allowed, false if blocked
   */
  const gateSocial = useCallback(
    (options?: GateOptions) => {
      const block = getSocialBlock();
      if (block) {
        logGateEvent('social', block.reason, false);
        triggerBlockedHaptic();
        options?.onBlocked?.(block);

        if (!options?.silent) {
          show(block.message, 'info');
          promptBlocked(block, [
            { text: 'Cancelar', onPress: () => { }, style: 'cancel' },
            { text: 'Registrarme', onPress: () => navigation.navigate('Register') },
          ]);
        }
        return false;
      }
      logGateEvent('social', 'anonymous', true);
      options?.onAllowed?.();
      return true;
    },
    [getSocialBlock, navigation, promptBlocked, show],
  );

  // Declarative state checks (for conditional rendering)
  const canCheckout = useMemo(() => getCheckoutBlock() === null, [getCheckoutBlock]);
  const canSellPublishWithdraw = useMemo(
    () => getSellPublishWithdrawBlock() === null,
    [getSellPublishWithdrawBlock],
  );
  const canWithdraw = canSellPublishWithdraw;
  const canSocial = useMemo(() => getSocialBlock() === null, [getSocialBlock]);

  // Current user state info (useful for UI decisions)
  const userState = useMemo(() => ({
    isLoading: status === 'loading',
    isAnonymous: status === 'anonymous',
    isPendingVerification: status === 'pending_verification',
    isAuthenticated: status === 'authenticated',
    isKycApproved,
    isEmailVerified,
    hasUser: !!user,
  }), [status, isKycApproved, isEmailVerified, user]);

  return {
    // Declarative checks (for UI rendering)
    canCheckout,
    canSellPublishWithdraw,
    canWithdraw,
    canSocial,

    // Block getters (for custom UI handling)
    getCheckoutBlock,
    getSellPublishWithdrawBlock,
    getSocialBlock,

    // Imperative gates (for action handlers)
    gateCheckout,
    gateSellPublishWithdraw,
    gateWithdraw,
    gateSocial,

    // User state info
    userState,
  };
}

