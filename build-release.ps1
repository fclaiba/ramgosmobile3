Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Generando APK Release de Ramgos" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Exportar bundle de Expo
Write-Host "[1/3] Exportando bundle de Expo..." -ForegroundColor Yellow
npx expo export --platform android

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Fallo la exportacion del bundle" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Bundle exportado correctamente" -ForegroundColor Green
Write-Host ""

# Paso 2: Compilar APK Release
Write-Host "[2/3] Compilando APK Release (esto puede tardar varios minutos)..." -ForegroundColor Yellow
Set-Location android
./gradlew assembleRelease

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Fallo la compilacion del APK" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..
Write-Host "✓ APK compilado correctamente" -ForegroundColor Green
Write-Host ""

# Paso 3: Mostrar resultado
Write-Host "[3/3] Abriendo carpeta de salida..." -ForegroundColor Yellow
$apkPath = "android\app\build\outputs\apk\release"
$apkFile = Get-ChildItem "$apkPath\*.apk" | Select-Object -First 1

if ($apkFile) {
    $sizeMB = [math]::Round($apkFile.Length / 1MB, 2)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  APK GENERADO EXITOSAMENTE!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Archivo: $($apkFile.Name)" -ForegroundColor White
    Write-Host "Tamaño: $sizeMB MB" -ForegroundColor White
    Write-Host "Ubicación: $apkPath" -ForegroundColor White
    Write-Host ""
    
    # Abrir carpeta
    explorer.exe $apkPath
} else {
    Write-Host "ADVERTENCIA: No se encontro el archivo APK" -ForegroundColor Yellow
}
