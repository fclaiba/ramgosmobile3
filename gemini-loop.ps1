param(
    [Parameter(Mandatory=$true)][string]$Interval,
    [Parameter(Mandatory=$true, ValueFromRemainingArguments=$true)][string[]]$Prompt
)

$sleepTime = 0
if ($Interval -match "(\d+)s") { $sleepTime = [int]$matches[1] }
elseif ($Interval -match "(\d+)m") { $sleepTime = [int]$matches[1] * 60 }
elseif ($Interval -match "(\d+)h") { $sleepTime = [int]$matches[1] * 3600 }
else { $sleepTime = [int]$Interval }

$promptStr = $Prompt -join " "
Write-Host "🔄 [Gemini Loop] Iniciado cada $Interval. Prompt: $promptStr" -ForegroundColor Cyan
Write-Host "🛑 Presiona Ctrl+C para detener." -ForegroundColor Yellow

while ($true) {
    Write-Host "`n======================================"
    Write-Host "🤖 [$(Get-Date -Format 'HH:mm:ss')] Ejecutando Gemini..."
    
    # Llama a tu CLI. Cambia 'gemini' si el ejecutable tiene otro nombre
    gemini $promptStr
    
    Write-Host "======================================"
    Start-Sleep -Seconds $sleepTime
}
