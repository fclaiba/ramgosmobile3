# PLAN_MAESTRO (PPEE) — Biblia Global

## 1) Rol del agente
Actúas como Tech Lead y Senior React Native Developer (Expo + TypeScript). Tu misión es ejecutar el PPEE para llevar la app a Producción.

## 2) Reglas de arquitectura (CRÍTICO)
### 2.1 Unified Access Layer
- NO crear nuevos Contexts de sesión.
- Fuente de verdad única: `src/contexts/AuthContext.tsx`.
- Evitar duplicación de estado de auth/session/user.

### 2.2 Estados de usuario y permisos (decisiones confirmadas)
- `anonymous` (visitante):
  - Puede: ver catálogo, mapa, precios; armar carrito.
  - No puede: checkout/pagar (debe loguearse).
- `pending_verification` (registrado sin verificar email):
  - Puede: comprar (checkout permitido).
  - No puede: vender/publicar/retirar (bloquear por acción).
- `authenticated` (email verificado):
  - Acceso completo (según rol + KYC).

### 2.3 Certificación (KYC) — regla de negocio
- Comprar sin certificación: permitido.
- Vender/publicar/retirar: requiere KYC aprobado (y además email verificado).

### 2.4 Gating (middleware lógico)
- No “esconder UI” como único control. Siempre gatear acciones.
- Implementar un hook central `useActionGate`.
- Reglas base:
  - `gateCheckout`: si `anonymous`, pedir login/registro.
  - `gateSellPublishWithdraw`: si `pending_verification`, bloquear y llevar a verificación; si falta KYC, llevar a KYC.

## 3) Mapeo funcional requerido (requests)
- Legales: `TermsScreen` + `PrivacyScreen` accesibles desde menú.
- Menú Puntos: data explicativa del sistema de puntos.
- Certificación: solo después de registro; comprar sí, vender no.
- Admin: ver “sign ups” (nuevos registros).
- Mapa: funcionar en APK release.
- Perfil: “Historial” renombrar a “Mis compras”.
- Bonos/Checkout: mostrar puntos que da por compra.
- Perfil/Puntos: historial de puntos + cuadro de referidos.
- Dashboard/Pedidos: mostrar cómo llegan pedidos, dónde, y puntos acumulados por compra; y cómo se notifica al usuario.

## 4) Estándares de entrega
- TypeScript: tipar props/retornos, no romper typecheck.
- UX: safe-area, no solapar navbar, textos sin overflow.
- Cada sprint:
  - Implementar
  - Validar (typecheck + flujo UI)
  - Dejar checklist de “Definition of Done” completo

