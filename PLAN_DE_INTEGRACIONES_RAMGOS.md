# PLAN DE INTEGRACIONES RAMGOS

Este documento es la hoja de ruta ejecutable para el desarrollo del 20% restante del proyecto (Integraciones de terceros y deuda técnica visual). Todo el desarrollo mantendrá la arquitectura server-centric sobre Convex y se usará estrictamente TypeScript. La base monetaria es USD.

---

## FASE 1: Deuda Técnica Visual (Quick Win)

**Objetivo:** Refactorizar los 36 archivos identificados en la auditoría para reemplazar el uso de `Alert` de React Native por el sistema global y premium de Toasts.

### Archivos Exactos a Modificar
**Componentes y Contextos:**
- `src/components/DailyChallenges.tsx`
- `src/components/PointsManager.tsx`
- `src/components/SidebarMenu.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/NotificationsContext.tsx`
- `src/contexts/ReferralContext.tsx`

**Pantallas (Screens):**
- `src/screens/AboutScreen.tsx`
- `src/screens/AdminDashboardScreen.tsx`
- `src/screens/BasicProfileSetupScreen.tsx`
- `src/screens/business/BusinessKYCScreen.tsx`
- `src/screens/business/BusinessQRScannerScreen.tsx`
- `src/screens/BusinessCreateScreen.tsx`
- `src/screens/BusinessDashboardScreen.tsx`
- `src/screens/CreateListingScreen.tsx`
- `src/screens/GamesScreen.tsx`
- `src/screens/HelpCenterScreen.tsx`
- `src/screens/HistoryScreen.tsx`
- `src/screens/InfluencerDashboardScreen.tsx`
- `src/screens/KYCScreen.tsx`
- `src/screens/LoginScreen.tsx`
- `src/screens/MapExplorerScreen.tsx`
- `src/screens/marketplace/AddEditProductScreen.tsx`
- `src/screens/marketplace/CheckoutScreen.tsx`
- `src/screens/marketplace/DisputeChatScreen.tsx`
- `src/screens/marketplace/DisputeReasonScreen.tsx`
- `src/screens/marketplace/DisputeScreen.tsx`
- `src/screens/marketplace/OrderDetailScreen.tsx`
- `src/screens/PaymentScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/RegisterScreen.tsx`
- `src/screens/SavedScreen.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/screens/SupportScreen.tsx`
- `src/screens/VerificationScreen.tsx`
- `src/screens/WelcomeScreen.tsx`
- `src/screens/WithdrawalScreen.tsx`

### APIs Sugeridas
*No aplica para esta fase (Uso del sistema de Toast global de la app).*

### Tareas Atómicas
- [ ] Importar el hook de toast en cada uno de los 36 archivos.
- [ ] Reemplazar llamadas nativas tipo `Alert.alert('Título', 'Mensaje')` por las llamadas equivalentes al sistema de Toast premium.
- [ ] Verificar que no queden referencias destructuradas a `Alert` importadas desde `react-native` en estos archivos.
- [ ] Comprobar el correcto renderizado de los Toasts en casos particulares (ej. modales sobrepuestos).

---

## FASE 2: Comunicaciones Transaccionales

**Objetivo:** Habilitar notificaciones Push (Expo) y envíos de correos electrónicos OTP/Notificaciones para mejorar el engagement y autenticación.

### Archivos Exactos a Modificar y Crear
**Modificar:**
- `src/contexts/AuthContext.tsx`
- `src/contexts/NotificationsContext.tsx`
- `app.json` / `eas.json` (Agregar permisos y credenciales de push FCM/APNS)
- `convex/users.ts`

**Crear:**
- `convex/notifications.ts` (Actions/Mutations para gestionar envíos de correos y push)
- `src/utils/pushNotifications.ts` (Helper para solicitud de persistencia de tokens de dispositivo en front)

### APIs Sugeridas
- **Emails Transaccionales/OTP:** Resend (recomendado por Typescript-first y compatibilidad moderna) o SendGrid.
- **Push Notifications:** Expo Push Notifications Service.

### Tareas Atómicas
- [ ] Configurar cuenta de Resend (o SendGrid) en servidor y agregar su respectiva API key al entorno (`EXPO_PUBLIC_RESEND_API_KEY` u homólogo seguro en configuraciones Convex, vía `npx convex env set`).
- [ ] Crear action `sendOTP` (o similares para emails) en `convex/notifications.ts` integrando el SDK de correo limitando intentos.
- [ ] Modificar el flujo en `AuthContext.tsx` y dependencias de autenticación para activar el envío real de correos electrónicos en vez de mocks.
- [ ] Crear helper `src/utils/pushNotifications.ts` para obtener tokens de dispositivos, y enviar/almacenar en esquema el token Expo asociado al usuario.
- [ ] Actualizar el modelo de datos en Convex para guardar un array de tokens en el usuario activo (para envíos multi-dispositivo).
- [ ] Crear action `sendPushNotification` en `convex/notifications.ts` capaz de invocar HTTP a la API de Expo (`https://exp.host/--/api/v2/push/send`).
- [ ] Actualizar el context `NotificationsContext.tsx` para sincronizar correctamente notificaciones en tiempo real o en background mediante Expo.

---

## FASE 3: Motor de Pagos (Crítico)

**Objetivo:** Procesar cobros en Dólares (USD), validar balances desde backend, salvaguardar fondos de manera segura usando escrow real, y ejecutar pagos o Payouts a negocios/vendedores.

### Archivos Exactos a Modificar y Crear
**Modificar:**
- `App.tsx` (Envoltorio global del proveedor del SDK de pagos)
- `convex/schema.ts` (Agregar tablas y datos atados a transacciones reales de Stripe)
- `convex/orders.ts` (Actualizar flujo de estado de la orden atada el pago exitoso en webhook)
- `src/screens/marketplace/CheckoutScreen.tsx`
- `src/contexts/MarketplaceContext.tsx`

**Crear:**
- `convex/stripe.ts` (Actions y validaciones directas contra API de pagos/Stripe SDK usando TS)
- `convex/http.ts` (Endpoints expuestos por Convex para que los Webhooks reporten el éxito de cargos)
- `src/components/stripe/StripePaymentModal.tsx` (o un Sheet persistente)

### APIs Sugeridas
- **Pasarela Base y Enrutamiento Fiduciario:** Stripe y Stripe Connect. Se maneja todo en USD, facilitando el split fiduciario entre sellers y marketplace.

### Tareas Atómicas
- [ ] Modificar `convex/schema.ts` para contener `stripeCustomerId` y `stripeConnectAccountId` (para split payouts) a los perfiles de usuario.
- [ ] Instalar e importar las dependencias del frontend: `@stripe/stripe-react-native` y backend (Node/action): `stripe`.
- [ ] Añadir `StripeProvider` al root (`App.tsx`), inyectando llave publicable.
- [ ] Crear Action segura `createPaymentIntent` en `convex/stripe.ts` generada desde el cliente, confirmando en backend que el total del cart o la order a cobrar sea la estricta, en USD.
- [ ] En `CheckoutScreen.tsx`, consumir el PaymentIntent y utilizar la "Payment Sheet" nativa de Stripe para obtener la tarjeta y confirmar en frontend.
- [ ] Habilitar y direccionar Webhooks configurando `convex/http.ts` (escuchando async evento tipo `payment_intent.succeeded`).
- [ ] Cuando el Webhook reporta el éxito de un intent, lanzar mutación privada en Convex que confirme la order y dispare el flujo del seller.
- [ ] Crear rutina action segura en `convex/stripe.ts` de `executeTransferPayout` que, bajo confirmación de delivery (`confirmReceipt`/escrow local), transfiere balance a cuentas connect de la API Stripe.

---

## FASE 4: Verificación KYC

**Objetivo:** Conectar las interfaces existentes de verificación a servicios verdaderos de identidad/biometría garantizando legitimidad operativa.

### Archivos Exactos a Modificar y Crear
**Modificar:**
- `src/screens/KYCScreen.tsx`
- `src/screens/business/BusinessKYCScreen.tsx`
- `convex/users.ts` (Mutations para actualización final de level y status legal)
- `src/contexts/FintechContext.tsx` u homólogo que controle el status visual

**Crear:**
- `convex/identity.ts` (Action proxy encargada de generar tokens o sesiones seguras para los SDKs a inyectar).

### APIs Sugeridas
- **Verificación de Identidad KYC/KYB:** Truora o Jumio. Soportan flujos modulares y callbacks a backend.

### Tareas Atómicas
- [ ] Generar un Action proxy interno `initiateKYCSession` en `convex/identity.ts` requiriendo parámetros mínimos de usuario al servidor del proveedor (Truora/Jumio/etc).
- [ ] Ajustar `KYCScreen` y `BusinessKYCScreen` para abrir o encrustar de WebView (o deep link) la url/sesión proveída por la acción backend.
- [ ] Configurar un HTTP handler adicional (`convex/http.ts`) para escuchar en Webhook los eventos de fin de KYC (exitoso o erróneo).
- [ ] Al recibir éxito, el webhook debe ejecutar mutación para ascender el `kycLevel` en el backend (Convex) del usuario.
- [ ] Limpiar permanentemente los antiguos simuladores o variables `mock_url_*` evitando derivaciones a lógicas obsoletas de prueba.
