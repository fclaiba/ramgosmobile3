Write-Host "Iniciando Protocolo de Limpieza Profunda y Diagnostico..." -ForegroundColor Cyan

# 1. Matar procesos Java/Gradle que puedan bloquear archivos
Write-Host "1. Liberando archivos bloquedos (Matando procesos Java)..."
Get-Process -Name "java", "openjdk" -ErrorAction SilentlyContinue | Stop-Process -Force
./gradlew --stop 2>$null

# 2. Limpieza agresiva de directorios
Write-Host "2. Eliminando caches y carpetas de compilacion..."
$dirsToRemove = @(
    ".gradle",
    "app/build",
    "build",
    "$env:USERPROFILE/.gradle/caches/build-cache-1"
)

Set-Location "$PSScriptRoot/../android"

foreach ($dir in $dirsToRemove) {
    if (Test-Path $dir) {
        Write-Host "   Eliminando $dir..." -ForegroundColor Gray
        Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 3. Limpieza de Expo
Write-Host "3. Regenerando carpeta android (Expo Prebuild)..."
Set-Location "$PSScriptRoot/.."
npx expo prebuild --clean

# 4. Compilacion Forzada con Diagnostico
Write-Host "4. Ejecutando compilacion forzada (ignorando 'up-to-date')..." -ForegroundColor Yellow
Write-Host "   Esto generara un log detallado en 'android_error_log.txt'"
Set-Location "$PSScriptRoot/../android"

# Usamos --rerun-tasks para forzar que todo se ejecute de nuevo
# Usamos --stacktrace y --info para capturar el error real
$cmd = "./gradlew assembleDebug --rerun-tasks --stacktrace --info"
Invoke-Expression "$cmd > ../android_error_log.txt 2>&1"

if ($LASTEXITCODE -eq 0) {
    Write-Host "COMPILACION EXITOSA!" -ForegroundColor Green
    Write-Host "El APK deberia estar en android/app/build/outputs/apk/debug/"
}
else {
    Write-Host "LA COMPILACION FALLO" -ForegroundColor Red
    Write-Host "Revisa el archivo 'android_error_log.txt' para ver el error exacto."
    Write-Host "Puedes buscar 'FAILED' o 'Exception' en ese archivo."
}
