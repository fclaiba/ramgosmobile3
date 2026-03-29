# Uso:
#   .\build-release.ps1                # APK (default)
#   .\build-release.ps1 -Output aab    # AAB
#   .\build-release.ps1 -Output both   # APK + AAB
param(
    [ValidateSet("apk", "aab", "both")]
    [string]$Output = "apk"
)

# Release local: compilar solo ABIs de dispositivos reales para reducir tiempo.
$releaseArchitectures = "armeabi-v7a,arm64-v8a"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Generando Release Android (Ramgos)" -ForegroundColor Cyan
Write-Host "  Output: $Output" -ForegroundColor Cyan
Write-Host "  ABIs: $releaseArchitectures" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Aviso si no hay signing de release configurado (fallback a debug)
$keystoreProps = "android\keystore.properties"
if (-not (Test-Path $keystoreProps)) {
    Write-Host "ADVERTENCIA: No se encontro '$keystoreProps'." -ForegroundColor Yellow
    Write-Host "El build 'release' puede quedar firmado con debug (NO apto Play Store)." -ForegroundColor Yellow
    Write-Host ""
}

# Paso 1: Exportar bundle de Expo
Write-Host "[1/3] Exportando bundle de Expo..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
npx expo export --platform android

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Fallo la exportacion del bundle" -ForegroundColor Red
    exit 1
}

Write-Host "OK: Bundle exportado correctamente" -ForegroundColor Green
Write-Host ""

# Paso 2: Compilar APK Release
Write-Host '[2/3] Compilando Release - puede tardar varios minutos...' -ForegroundColor Yellow
Set-Location android
$archArg = "-PreactNativeArchitectures=$releaseArchitectures"
if ($Output -eq "apk") {
    ./gradlew assembleRelease $archArg
} elseif ($Output -eq "aab") {
    ./gradlew bundleRelease $archArg
} else {
    ./gradlew assembleRelease bundleRelease $archArg
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host 'ERROR: Fallo la compilacion del release apk/aab' -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..
Write-Host "OK: Release compilado correctamente" -ForegroundColor Green
Write-Host ""

# Paso 3: Mostrar resultado
Write-Host "[3/3] Abriendo carpeta de salida..." -ForegroundColor Yellow
$apkPath = "android\app\build\outputs\apk\release"
$aabPath = "android\app\build\outputs\bundle\release"
$apkFile = Get-ChildItem "$apkPath\*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1
$aabFile = Get-ChildItem "$aabPath\*.aab" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($apkFile -or $aabFile) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  RELEASE GENERADO EXITOSAMENTE!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    if ($apkFile) {
        $sizeMB = [math]::Round($apkFile.Length / 1MB, 2)
        Write-Host "APK: $($apkFile.Name) ($sizeMB MB)" -ForegroundColor White
        Write-Host "Ubicación APK: $apkPath" -ForegroundColor White
        Write-Host ""
    }
    if ($aabFile) {
        $sizeMB = [math]::Round($aabFile.Length / 1MB, 2)
        Write-Host "AAB: $($aabFile.Name) ($sizeMB MB)" -ForegroundColor White
        Write-Host "Ubicación AAB: $aabPath" -ForegroundColor White
        Write-Host ""
    }
    
    # Abrir carpeta principal de outputs
    explorer.exe "android\app\build\outputs"
} else {
    Write-Host "ADVERTENCIA: No se encontro el archivo APK/AAB" -ForegroundColor Yellow
}
