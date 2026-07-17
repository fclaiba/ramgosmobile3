# Módulo de Pagos - Componentes a reescribir

Este documento contiene el listado de todos los componentes, pantallas y archivos de backend que conformaban el módulo de pagos original, antes de su eliminación para reescribirlo desde cero.

## 1. Pantallas (Screens)
* `src/screens/PaymentScreen.tsx`
* `src/screens/PaymentMethodsScreen.tsx`
* `src/screens/PaymentMethodsScreen.web.tsx`
* `src/screens/finance/WalletScreen.tsx`
* `src/screens/WithdrawalScreen.tsx`
* `src/screens/SubscriptionPlansScreen.tsx`

## 2. Componentes de la Interfaz (UI Components)
* `src/components/StripeWrapper.tsx`
* `src/components/StripeWrapper.web.tsx`
* `src/components/SecureCardInput.tsx`
* `src/components/SecureCardInput.web.tsx`
* `src/components/stripe/CardField.tsx`
* `src/components/stripe/CardField.web.tsx`

## 3. Backend (Convex)
* `convex/stripe.ts`
* `convex/finance.ts`
* `convex/connect.ts`
* `convex/connectV2.ts`
* `convex/iap.ts`
* `convex/iapActions.ts`
* `convex/economy.ts`
* `convex/reconciliation.ts`
