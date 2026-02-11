# fix_project.ps1
Write-Host "🚀 Starting Ramgos Mobile Project Fix..." -ForegroundColor Cyan

# 1. Kill any running node/bundled processes to unlock files
Write-Host "1️⃣  Stopping existing Node processes..." -ForegroundColor Yellow
Stop-Process -Name "node" -ErrorAction SilentlyContinue
Stop-Process -Name "adb" -ErrorAction SilentlyContinue

# 2. Clean Environment
Write-Host "2️⃣  Cleaning environment..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   Removing node_modules (this may take a while)..."
    Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path "package-lock.json") {
    Write-Host "   Removing package-lock.json..."
    Remove-Item -Path "package-lock.json" -Force
}
if (Test-Path ".expo") {
    Write-Host "   Removing .expo cache..."
    Remove-Item -Path ".expo" -Recurse -Force -ErrorAction SilentlyContinue
}

# 3. Enforce Correct Versions in package.json
# We need to make sure we are not asking for v4
Write-Host "3️⃣  Verifying package.json versions..." -ForegroundColor Yellow
$packageJsonPath = "package.json"
$json = Get-Content $packageJsonPath -Raw | ConvertFrom-Json

# Check NativeWind version
if ($json.dependencies.nativewind -ne "^2.0.11") {
    Write-Host "   ⚠️  Found incorrect NativeWind version ($($json.dependencies.nativewind)). Forcing ^2.0.11" -ForegroundColor Magenta
    $json.dependencies.nativewind = "^2.0.11"
    $json | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath
}
else {
    Write-Host "   ✅ NativeWind version is correct." -ForegroundColor Green
}

# 4. Reinstall Dependencies
Write-Host "4️⃣  Installing dependencies (Legacy Peer Deps)..." -ForegroundColor Yellow
try {
    npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}
catch {
    Write-Host "❌ Dependency installation failed. Please check your internet connection or npm logs." -ForegroundColor Red
    exit 1
}

# 5. Clear Gradle Cache (Optional but good for 'integral' fix)
# Write-Host "5️⃣  Cleaning Android Build (Gradle)..." -ForegroundColor Yellow
# cd android
# ./gradlew clean
# cd ..

Write-Host "✅ FIX COMPLETE!" -ForegroundColor Green
Write-Host "👉 You can now run: npx expo start --clear" -ForegroundColor Cyan
