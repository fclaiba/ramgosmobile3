## Android Release (signed) — pasos reproducibles

### 1) Crear keystore de release

Ejemplo (Windows / PowerShell):

```powershell
mkdir android\keystores -Force
keytool -genkeypair -v `
  -keystore android\keystores\ramgos-release.jks `
  -alias ramgos-release `
  -keyalg RSA -keysize 2048 -validity 10000
```

### 2) Configurar `android/keystore.properties`

Crear el archivo **local** `android\keystore.properties` (no commitearlo) con:

```properties
storeFile=keystores/ramgos-release.jks
storePassword=CHANGE_ME
keyAlias=ramgos-release
keyPassword=CHANGE_ME
```

La build `release` usa esta config automáticamente. Si falta este archivo, el build hace fallback a firma debug.

### 3) Obtener SHA-1 (para Google Maps)

```powershell
keytool -list -v `
  -keystore android\keystores\ramgos-release.jks `
  -alias ramgos-release
```

Copiar el **SHA1**.

### 4) Google Maps (Maps SDK for Android)

En Google Cloud Console:

- Habilitar: **Maps SDK for Android**
- En la API key:
  - **Application restrictions**: Android apps
  - **Package name**: `com.fclaiba.ramgosmobile`
  - **SHA-1**: el del paso anterior (keystore de release)
- Reemplazar en `app.json`:
  - `android.config.googleMaps.apiKey = "__SET_GOOGLE_MAPS_ANDROID_API_KEY__"`
  - por la key Android restringida final antes de generar release candidate.

> Si el mapa funciona en debug pero queda gris en APK release, casi siempre es porque el SHA-1 configurado no coincide con la firma del release.

### 5) Build release (APK / AAB)

APK:

```powershell
.\build-release.ps1
```

AAB:

```powershell
.\build-release.ps1 -Output aab
```

Notas importantes:

- El script fuerza `NODE_ENV=production`.
- Para acelerar compilación local, usa ABIs de dispositivo real (`armeabi-v7a,arm64-v8a`) y evita `x86/x86_64`.
- Si necesitás emulador x86 para pruebas de release, compilá manualmente desde `android/` sin ese override.

Outputs:

- APK: `android/app/build/outputs/apk/release/`
- AAB: `android/app/build/outputs/bundle/release/`

### 6) Conexión a backend de producción (Convex)

- En `.env.local`, usar:
  - `EXPO_PUBLIC_CONVEX_URL=https://deafening-turtle-227.convex.cloud`
- Después de cambiar variables `EXPO_PUBLIC_*`, reiniciar Metro o rehacer build para que tome los valores embebidos.
- Estado actual del backend Convex:
  - Las funciones en `convex/` no leen `process.env.*`, por lo que no hay secretos obligatorios para operación base.
  - Verificación rápida: `npx convex env list --prod` (puede devolver vacío y seguir siendo válido para este proyecto).

### 7) Soporte (Zendesk) temporal

- El flujo Zendesk está desactivado temporalmente.
- Los tickets de soporte usan fallback por email (`support@ramgos.com`) hasta cargar credenciales reales.

### 8) Entornos EAS/CI (importante)

- `eas.json` define `EXPO_PUBLIC_CONVEX_URL` por perfil:
  - `development` / `preview`: deployment dev
  - `production`: deployment prod
- En cloud builds, priorizar estas variables por perfil o secretos de EAS.
- Usar `.env.example` como plantilla local para evitar drift de configuración.

### 9) Estrategia de carrito

- La fuente de verdad del carrito es el estado local persistido del cliente (`CartContext` + storage).
- No mezclar el flujo local con `convex/cart.ts` hasta planificar una migración completa.

