c$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"
$venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"

if (-not (Test-Path $backendPath)) {
    Write-Error "No se encontro la carpeta backend en: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    Write-Error "No se encontro la carpeta frontend en: $frontendPath"
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python no esta disponible en PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm no esta disponible en PATH."
}

Write-Host "Preparando backend..." -ForegroundColor Cyan
if (-not (Test-Path $venvPython)) {
    Write-Host "Creando entorno virtual en backend/.venv" -ForegroundColor Yellow
    Push-Location $backendPath
    python -m venv .venv
    Pop-Location
}

Write-Host "Instalando dependencias backend..." -ForegroundColor Cyan
Push-Location $backendPath
& $venvPython -m pip install -r requirements.txt
Pop-Location

Write-Host "Instalando dependencias frontend..." -ForegroundColor Cyan
Push-Location $frontendPath
npm install
Pop-Location

$backendCommand = @"
Set-Location '$backendPath'
& '$venvPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"@

$frontendCommand = @"
Set-Location '$frontendPath'
npx vite --port 5173
"@

Write-Host "Levantando backend en nueva ventana..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand | Out-Null

Start-Sleep -Seconds 2

Write-Host "Levantando frontend en nueva ventana..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand | Out-Null

Write-Host ""
Write-Host "Aplicacion iniciada." -ForegroundColor Green
Write-Host "Backend:  http://127.0.0.1:8000"
Write-Host "Frontend: http://localhost:5173"
Write-Host ""
Write-Host "Para detener, cierra las dos ventanas nuevas de PowerShell."
