# A-Z Test Report — Ramgos App

Este reporte se ha generado a partir de una auditoría estructural (White-box testing), revisión de rutas, lógica de componentes y ejecución de tests unitarios/E2E sobre la base de código actual (Expo + Convex).

## Resumen de Ejecución
- **Fase 0 (Guest):** Funcional en general. **[Fallo Crítico]** La restricción de Checkout para invitados no está aplicada en la UI.
- **Fase 1 (Onboarding):** Funcional. Flujos de Registro, OTP (vía Resend) y KYC están interconectados y respaldados por el backend en `users.ts`.
- **Fase 2 (Consumer):** Funcional. Carrito, Órdenes y Wallet operan con persistencia en `orders.ts` y `finance.ts`.
- **Fase 3 (Business):** Funcional. Creación de negocios, listings, y dashboard están implementados y operativos.
- **Fase 4 (Influencer):** Funcional. Las vistas y la lógica de referidos operan bajo `social.ts`.
- **Fase 5 (Admin):** Parcial. Aprobación de KYC está implementada, pero existen carencias importantes en la moderación de disputas y baneos.
- **Fase 6 (Cross-Cutting):** Implementado el manejo de temas oscuros/claros vía `ThemeContext.tsx`. Errores de test unitarios detectados en Jest debido a falta de mocks de React Native (`AsyncStorage`, `useAuth`, `useAction`).

---

## Reporte de Bugs Detectados

### [CART-03] — Guest puede proceder al checkout sin autenticación
- **Severidad:** CRÍTICO
- **Fase:** Fase 0: Flujo de Usuario Invitado
- **Pantalla:** CartScreen → PaymentScreen
- **Pasos para reproducir:**
  1. Navegar a la app como usuario no autenticado (Guest).
  2. Agregar un ítem al carrito.
  3. Tocar el botón "Continuar al pago".
- **Resultado esperado:** La aplicación debe interceptar la acción y mostrar un modal/alerta (usando `gateCheckout`) solicitando iniciar sesión, o redirigir directamente a `LoginScreen`.
- **Resultado actual:** La función `handleCheckout` en `CartScreen.tsx` navega directamente a `Payment` enviando los parámetros de monto, ignorando el estado de autenticación del usuario.
- **Fix propuesto:** Importar `useActionGate` en `CartScreen.tsx` y llamar a `if (!gateCheckout()) return;` dentro de `handleCheckout`.

### [ADSP-02] — El Admin no puede resolver disputas desde el Dashboard
- **Severidad:** ALTO
- **Fase:** Fase 5: Admin
- **Pantalla:** AdminDashboardScreen / Backend (Convex)
- **Pasos para reproducir:**
  1. Ingresar como Admin y navegar al Admin Dashboard.
  2. Intentar buscar una disputa abierta para emitir un fallo a favor del comprador o vendedor.
- **Resultado esperado:** Debe existir una función en el UI y en el backend (ej. `resolveDispute`) que libere los fondos del Escrow hacia la parte ganadora.
- **Resultado actual:** Si bien existe `openDispute` en `orders.ts` y pantallas como `DisputeChatScreen`, el backend (`disputes.ts` / `finance.ts`) carece de un endpoint `resolveDispute` y el `AdminDashboardScreen` actualmente solo expone lógica para aprobar/rechazar KYC.
- **Fix propuesto:** Implementar la mutación `resolveDispute` en `convex/disputes.ts` que se comunique con `convex/finance.ts` para destrabar el Escrow (`internalMovePendingToAvailable` o refund), y agregar la interfaz correspondiente en `AdminDashboardScreen`.

### [AUSR-03] — Funcionalidad de Baneo de usuarios no expuesta en Admin Dashboard
- **Severidad:** ALTO
- **Fase:** Fase 5: Admin
- **Pantalla:** AdminDashboardScreen
- **Pasos para reproducir:**
  1. Ingresar como Admin.
  2. Visualizar la lista de usuarios.
  3. Intentar banear un usuario.
- **Resultado esperado:** Debería existir un botón de "Banear" que cambie el status del usuario a `banned` e impida su login.
- **Resultado actual:** No existe mutación explícita `banUser` en `convex/users.ts` ni botón en el frontend (`AdminDashboardScreen.tsx`) para ejecutar esta acción.
- **Fix propuesto:** Crear un endpoint `banUser` en Convex que actualice el flag de estado, e invocarlo desde el UI del administrador.

### [IMP-01] — Funcionalidad de Impersonación sin interfaz de usuario
- **Severidad:** MEDIO
- **Fase:** Fase 5: Admin / Developer
- **Pantalla:** Global / Developer Tooling
- **Pasos para reproducir:**
  1. Intentar iniciar una sesión impersonando a otro usuario como developer/admin.
- **Resultado esperado:** Existencia de un menú o comando de desarrollador para asumir la identidad del usuario y generar los audit_logs `IMPERSONATE_START`.
- **Resultado actual:** La lógica backend existe (`impersonate` en `convex/developer.ts`), pero no hay forma de gatillarla desde el frontend actualmente, limitando su uso solo a invocaciones directas desde el dashboard de Convex.
- **Fix propuesto:** Agregar un botón de "Impersonate" en la vista de detalle de usuario del `AdminDashboardScreen` (solo visible para super-admins o developers).

### [JEST-01] — Fallo masivo en la suite de pruebas unitarias por falta de Mocks
- **Severidad:** MEDIO
- **Fase:** Fase 6: Cross-Cutting (Transversal)
- **Pantalla:** N/A (Consola / CI)
- **Pasos para reproducir:**
  1. Ejecutar `npm run test` en la terminal.
- **Resultado esperado:** Todas las pruebas relacionadas a la lógica de negocio (`RewardsContext`, `VerifyUserContext`, etc.) deben pasar correctamente.
- **Resultado actual:** 6 de las 7 suites de pruebas fallan debido a que dependencias de React Native (como `AsyncStorage`, `@stripe/stripe-react-native`) y contextos de Convex (`useAction` sin `ConvexProvider`) no están mockeados.
- **Fix propuesto:** Configurar `jest.setup.js` para proveer mocks globales de `@react-native-async-storage/async-storage` y envolver los tests de los Contextos en un wrapper que provea un `AuthContext` y `ConvexProvider` falsos.