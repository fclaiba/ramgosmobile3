# Pendientes Front-Back para Desarrollo

## Contexto

Este documento consolida los pendientes detectados para terminar de alinear frontend y backend (Convex producción), con foco en:

- Operar solo con datos/permisos válidos de producción.
- Eliminar rutas mock/developer riesgosas.
- Dejar despliegue reproducible sin ambigüedad de backend.

---

## Plan incluido (diagnóstico y preparación front-back)

### Alcance acordado
- Solo diagnóstico y preparación; sin implementar cambios de código en esta etapa.
- Preparar qué corregir y qué revertir, con prioridad productiva (Convex prod).

### Hallazgos clave a consolidar
- **Bloqueantes funcionales front-back**
  - Checkout usa resultado async de forma incorrecta y rompe el flujo de confirmación en `src/screens/marketplace/CheckoutScreen.tsx`.
  - Contrato de órdenes/disputas parcial entre `src/contexts/MarketplaceContext.tsx`, `convex/orders.ts` y `convex/disputes.ts`.
- **Riesgos de seguridad/back-end**
  - Falta de identidad fuerte (IDs enviados por cliente) en rutas de `convex/users.ts`, `convex/orders.ts`, `convex/cart.ts`, `convex/files.ts`.
  - Exposición de payloads sensibles en `convex/developer.ts`.
- **Deriva operativa de entorno**
  - Diferencias de configuración local/EAS entre `eas.json`, `App.tsx`, `build-release.ps1` y `.env.example`.

### Entregables de preparación
- Matriz de brechas front-back por severidad, archivo e impacto.
- Mapa de contratos (frontend esperado vs backend real).
- Propuesta de reversión selectiva (sin ejecutar).
- Backlog ejecutable por fases con criterios de aceptación.

### Criterios de cierre de esta etapa
- Lista única y priorizada de todo lo que falta para conectar correctamente front-back.
- Propuesta explícita de qué revertir y por qué, lista para aprobación.
- Plan posterior listo para pasar a implementación.

---

## Inventario de pendientes (priorizado)

### Crítico

1. **Checkout async roto**
   - Archivo: `src/screens/marketplace/CheckoutScreen.tsx`
   - Problema: `placeOrder(...)` se usa sin `await`; `result` es Promise.
   - Impacto: falla cierre de compra, `result.success/orders`, post-procesos y UX.

2. **Auth/KYC/subscription incompletos (stubs/no-op)**
   - Archivo: `src/contexts/AuthContext.tsx`
   - Problema: `loginWithSocial`, `resendVerificationCode`, `markKycSubmitted`, `updateSubscription` sin implementación real.
   - Impacto: integración incompleta con backend en flujos clave.

3. **Seguridad backend basada en IDs del cliente**
   - Archivos: `convex/users.ts`, `convex/orders.ts`, `convex/disputes.ts`, `convex/cart.ts`, `convex/files.ts`
   - Problema: varias mutaciones/queries dependen de IDs enviados por frontend.
   - Impacto: riesgo de acceso/operación sobre recursos ajenos.

4. **Exposición de datos sensibles en funciones developer**
   - Archivo: `convex/developer.ts`
   - Problema: `impersonate` y `getTestUsers` devuelven documentos de usuario completos.
   - Impacto: filtración de datos sensibles en clientes no estrictamente controlados.

5. **KYC aún mockeado**
   - Archivos: `src/contexts/FintechContext.tsx`, `src/screens/KYCScreen.tsx`
   - Problema: dependencia de `mockConvexStore` y `mock_url_*`.
   - Impacto: KYC no persistente ni trazable en backend real.

### Alto

1. **Contrato roto en detalle de orden**
   - Archivo: `src/screens/marketplace/OrderDetailScreen.tsx`
   - Problema: usa `confirmDelivery` inexistente en `MarketplaceContext`.
   - Impacto: error de tipo y funcionalidad incompleta.

2. **Modelo de disputas/escrow parcialmente alineado**
   - Archivos: `src/contexts/MarketplaceContext.tsx`, `convex/orders.ts`, `convex/disputes.ts`
   - Problema: backend y frontend no comparten contrato completo de estado/lifecycle.
   - Impacto: inconsistencias de flujo en disputa/chat/escalado.

3. **Lógica financiera/rewards local**
   - Archivos: `src/contexts/WalletContext.tsx`, `src/contexts/PointsContext.tsx`, `src/contexts/RewardsContext.tsx`
   - Problema: fuente de verdad no unificada en backend.
   - Impacto: divergencia de saldos, recompensas y trazabilidad.

### Medio

1. **Riesgo operativo de entorno local/build**
   - Archivos: `eas.json`, `.env.example`, `build-release.ps1`, `App.tsx`
   - Problema: mejora parcial, pero se puede fallar localmente si falta `EXPO_PUBLIC_CONVEX_URL`.
   - Impacto: builds no reproducibles entre local/CI.

2. **Carrito con doble conceptualización**
   - Archivos: `src/contexts/CartContext.tsx`, `convex/cart.ts`
   - Problema: backend de carrito existe, pero estrategia actual es local.
   - Impacto: deuda técnica de sincronización futura.

---

## Propuesta de reversión selectiva (sin ejecutar)

### Revertir (si se quiere volver a baseline previo)
- `src/components/AddReviewModal.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/contexts/MarketplaceContext.tsx`
- `src/screens/marketplace/DisputeChatScreen.tsx`
- `src/contexts/CartContext.tsx`
- `src/contexts/AuthContext.tsx`
- `src/screens/AdminDashboardScreen.tsx`
- `src/screens/CreateListingScreen.tsx`
- `convex/users.ts`
- `convex/developer.ts`
- `convex/files.ts`
- `convex/orders.ts`

### Mantener (cambios operativos útiles)
- `App.tsx` (validación de `EXPO_PUBLIC_CONVEX_URL`)
- `eas.json` (env por perfil)
- `RELEASE_ANDROID.md` (guía operativa)
- `.env.example` y `.gitignore` (higiene de entorno)
- `build-release.ps1` (optimización build)

---

## Backlog ejecutable por fases

### Fase 1 - Bloqueantes de contrato front-back
- Corregir async checkout en `CheckoutScreen`.
- Definir/implementar `confirmDelivery` o alinear `OrderDetailScreen` al contrato real.
- Criterio de aceptación:
  - Compra completa sin errores TS/runtime.
  - Flujo de orden consistente de checkout a historial/detalle.

### Fase 2 - Auth/KYC real
- Reemplazar stubs/no-op en `AuthContext` con mutaciones reales.
- Remover dependencia de `mockConvexStore` para KYC.
- Criterio de aceptación:
  - KYC y suscripción persistidos en backend.
  - Login/social/verificación con contratos reales.

### Fase 3 - Hardening de seguridad backend
- Endurecer autorización en `users/orders/disputes/cart/files/developer`.
- Evitar depender de IDs suministrados por cliente para permisos.
- Criterio de aceptación:
  - No es posible operar sobre recursos de terceros manipulando payloads.

### Fase 4 - Operativa y verificación final
- Validar entorno dev/preview/prod en local + EAS.
- Ejecutar smoke E2E: login, listado, compra, disputa/chat, reseña, perfil.
- Criterio de aceptación:
  - Build reproducible apuntando al backend correcto.

---

## Evidencia técnica actual

`npm run typecheck` falla actualmente por:

- Módulo faltante `NativeMap` en:
  - `src/components/LocationPickerModal.tsx`
  - `src/screens/MapExplorerScreen.tsx`
- Uso async incorrecto en:
  - `src/screens/marketplace/CheckoutScreen.tsx`
- Contrato faltante:
  - `src/screens/marketplace/OrderDetailScreen.tsx` (`confirmDelivery` no existe en contexto)

---

## Checklist rápida para empezar desarrollo

- [ ] Definir si se revierte a baseline o se continúa sobre estado actual.
- [ ] Cerrar Fase 1 (checkout + contrato order detail).
- [ ] Cerrar Fase 2 (auth/kyc/subscription reales).
- [ ] Cerrar Fase 3 (seguridad backend y permisos).
- [ ] Cerrar Fase 4 (env/build/qa end-to-end).
- [ ] Re-ejecutar typecheck y smoke final.

