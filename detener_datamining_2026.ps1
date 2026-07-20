$ErrorActionPreference = "SilentlyContinue"

function Stop-ByPort {
    param(
        [int]$Port,
        [string]$Name
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen
    if (-not $connections) {
        Write-Host "$Name: no hay proceso escuchando en el puerto $Port."
        return
    }

    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        $proc = Get-Process -Id $pid
        if ($proc) {
            Stop-Process -Id $pid -Force
            Write-Host "$Name detenido: PID $pid ($($proc.ProcessName)) en puerto $Port."
        }
    }
}

Write-Host "Deteniendo servicios Datamining 2026..." -ForegroundColor Cyan

Stop-ByPort -Port 8000 -Name "Backend"
Stop-ByPort -Port 5173 -Name "Frontend"

Write-Host "Listo." -ForegroundColor Green
