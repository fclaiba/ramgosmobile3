# QA Smoke Test Guide (Ramgos Mobile)

Guía de prueba rápida para validar las funciones críticas antes del lanzamiento.

## Prerrequisitos
- **Emulador Android/iOS o Dispositivo Físico** (ideal: 1 físico Android para validar release).
- **Internet activo**.
- **Build dev**: `npx expo start` (para validar rápido UI).
- **Build release Android** (para validar mapa/tiles + firma):
  - `.\build-release.ps1` (APK) o `.\build-release.ps1 -Output aab` (AAB).
  - Instalar el APK generado en el dispositivo (o usar Android Studio / `adb install -r`).

## Validación Release (Android) — Obligatorio en Sprint 4
1. **Generar APK/AAB release**
   - [ ] Ejecutar `.\build-release.ps1` y confirmar que genera artefacto(s).
   - [ ] Si el build advierte `android\keystore.properties` faltante, configurar firma release (ver más abajo) y regenerar.
2. **Instalar y abrir release**
   - [ ] Instalar el APK release en un dispositivo Android real.
   - [ ] Abrir la app y navegar a la pantalla de Mapa (Marketplace/Explorer).
   - [ ] Confirmar que **renderiza tiles** (no pantalla gris) + markers + ubicación.
3. **Firma (sanity check)**
   - [ ] Confirmar que el APK/AAB está firmado con keystore de release (no debug) cuando se apunta a producción.

### Nota: Google Maps API Key + SHA-1
- Si el mapa queda gris en **release** pero funciona en debug, casi siempre es porque la API key está restringida por **SHA-1** y el release está firmado con otra keystore.
- Checklist de configuración recomendada en Google Cloud Console (Maps SDK for Android):
  - **Application restrictions**: Android apps
  - **Package name**: `com.fclaiba.ramgosmobile`
  - **SHA-1**: el de la keystore con la que firmás el release
  - APIs habilitadas: **Maps SDK for Android**

## Flujo Crítico 1: Ciclo de Vida del Usuario
1. **Instalación/Inicio**
   - [ ] Abrir la app.
   - [ ] Verificar pantalla de bienvenida.
2. **Registro/Login**
   - [ ] Crear cuenta nueva ("Usuario Test").
   - [ ] Verificar recepción de email (simulado) o ingreso directo.
   - [ ] Aceptar Términos y Condiciones (Flujo Bloqueante).
3. **Mascota (Gamificación)**
   - [ ] Ir a pestaña "Perfil" o "Inicio".
   - [ ] Verificar que aparezca la Mascota.
   - [ ] Interactuar (Alimentar/Jugar).
   - [ ] Validar incremento de puntos.
4. **Logout**
   - [ ] Ir a Configuración.
   - [ ] Cerrar Sesión.
   - [ ] Verificar vuelta a pantalla de Login/Bienvenida.

## Flujo Crítico 2: E-commerce y Wallet
1. **Exploración**
   - [ ] Navegar Marketplace.
   - [ ] Abrir detalle de producto.
   - [ ] "Añadir al Carrito".
2. **Checkout**
   - [ ] Ir al Carrito.
   - [ ] Proceder al pago.
   - [ ] Aplicar cupón (si hay disponible).
   - [ ] Confirmar compra (Simulada).
3. **Post-Venta**
   - [ ] Ir a "Pedidos" (HistoryScreen/OrderDetail).
   - [ ] Ir a "Billetera".
   - [ ] Verificar saldo pendiente (Escrow).

## Flujo Crítico 3: Compliance
1. **Eliminación de Cuenta**
   - [ ] Ir a Configuración -> Eliminar Cuenta.
   - [ ] Confirmar en el modal.
   - [ ] Verificar cierre de sesión y limpieza de datos (intentar loguear de nuevo debería fallar si fuera real, o crear nuevo user).

## Flujo Crítico 4: Legales + Menú
1. **Términos y Privacidad**
   - [ ] Abrir menú lateral.
   - [ ] Abrir `Terms`.
   - [ ] Abrir `Privacy`.
   - [ ] Confirmar que no hay crashes y el contenido es legible.

## Criterios de Aceptación
- Cero crashes (Pantalla Roja o cierre inesperado).
- UI responsiva (sin bloqueos > 2s).
- Textos legibles en Modo Oscuro y Claro.
- **Mapa OK en APK release** (sin pantalla gris).
