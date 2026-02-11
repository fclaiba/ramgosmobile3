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

Outputs:

- APK: `android/app/build/outputs/apk/release/`
- AAB: `android/app/build/outputs/bundle/release/`

