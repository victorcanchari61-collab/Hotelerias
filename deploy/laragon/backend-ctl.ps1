<#
.SYNOPSIS
  Controla el backend de Hotelerias (Go) como un proceso en segundo plano.

.DESCRIPTION
  Apache (Laragon) solo hace de proxy hacia el puerto 5220: no puede lanzar el
  backend. Este script lo deja corriendo solo, sin terminal abierta, y lo
  arranca al iniciar sesion en Windows (Programador de tareas, usuario actual:
  no pide administrador).

  Uso (desde cualquier carpeta):
    .\backend-ctl.ps1 install     compila, registra el arranque automatico y lo inicia
    .\backend-ctl.ps1 status      estado, salud y ultimas lineas del log
    .\backend-ctl.ps1 restart     compila de nuevo y reinicia  (tras cambiar codigo Go)
    .\backend-ctl.ps1 stop
    .\backend-ctl.ps1 start
    .\backend-ctl.ps1 build       solo compila
    .\backend-ctl.ps1 logs        sigue el log en vivo (Ctrl+C para salir)
    .\backend-ctl.ps1 uninstall   quita el arranque automatico y lo detiene
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet('install', 'uninstall', 'build', 'start', 'stop', 'restart', 'status', 'logs', 'run')]
    [string]$Accion = 'status'
)

$ErrorActionPreference = 'Stop'

$Raiz    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Backend = Join-Path $Raiz 'backend'
# BACKEND_EXE y BACKEND_LOG existen solo para probar el vigilante con un ejecutable
# de mentira, sin tocar el backend ni el log reales.
$Exe     = if ($env:BACKEND_EXE) { $env:BACKEND_EXE } else { Join-Path $Backend 'backend.exe' }
$Log     = if ($env:BACKEND_LOG) { $env:BACKEND_LOG } else { Join-Path (Join-Path $Backend 'logs') 'backend.log' }
$LogDir  = Split-Path $Log -Parent
$Puerto  = 5220          # Server.Port de config.yaml (y el del proxy de Apache y de Vite)
$Tarea   = 'Hotelerias-Backend'

function Get-PidEscuchando {
    $c = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { $c.OwningProcess } else { $null }
}

function Get-Tarea { Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue }

function Invoke-Build {
    Write-Host "Compilando backend.exe ..."
    Push-Location $Backend
    try {
        & go build -o $Exe .
        if ($LASTEXITCODE -ne 0) { throw "go build fallo (codigo $LASTEXITCODE)" }
    } finally { Pop-Location }
    Write-Host "  ok: $Exe"
}

function Stop-Backend {
    # 1) la tarea (si existe), para que no lo reviva; 2) el proceso que escucha en el puerto.
    if (Get-Tarea) { Stop-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue }
    $procId = Get-PidEscuchando
    if ($procId) { & taskkill /F /T /PID $procId | Out-Null }
    for ($i = 0; $i -lt 20 -and (Get-PidEscuchando); $i++) { Start-Sleep -Milliseconds 250 }
}

function Start-Backend {
    if (Get-PidEscuchando) { Write-Host "Ya esta corriendo (PID $(Get-PidEscuchando))."; return }
    if (-not (Test-Path $Exe)) { Invoke-Build }

    if (Get-Tarea) {
        Start-ScheduledTask -TaskName $Tarea
    } else {
        # Sin tarea registrada: se lanza oculto, igual que lo haria la tarea.
        Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', "`"$PSCommandPath`"", 'run')
    }

    # Esperar a que escuche y a que responda.
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        if (Get-PidEscuchando) { break }
    }
    if (Get-PidEscuchando) { Write-Host "Backend arriba en :$Puerto (PID $(Get-PidEscuchando))." }
    else { Write-Warning "No quedo escuchando en :$Puerto. Revisa el log: $Log" }
}

function Show-Estado {
    $procId = Get-PidEscuchando
    $t = Get-Tarea
    Write-Host ("Proceso   : " + $(if ($procId) { "corriendo (PID $procId, puerto $Puerto)" } else { "APAGADO" }))
    Write-Host ("Autoarranque: " + $(if ($t) { "tarea '$Tarea' ($($t.State))" } else { "no instalado (usa: install)" }))
    if ($procId) {
        try {
            $r = Invoke-WebRequest "http://127.0.0.1:$Puerto/api/health" -UseBasicParsing -TimeoutSec 3
            Write-Host "Salud     : $($r.StatusCode) $($r.Content)"
        } catch { Write-Host "Salud     : sin respuesta ($($_.Exception.Message))" }
    }
    if (Test-Path $Log) {
        Write-Host "`n--- ultimas lineas de $Log ---"
        Get-Content $Log -Tail 8
    }
}

switch ($Accion) {

    # Interno: lo que ejecuta la tarea. Es el VIGILANTE: corre el backend y, si
    # muere con error, lo vuelve a lanzar. No se delega en la opcion "reiniciar si
    # falla" del Programador de tareas: no se dispara con un proceso que termina
    # con codigo distinto de cero (se comprobo: no lo revivia).
    'run' {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        $env:GIN_MODE = 'release'
        Set-Location $Backend                # config.yaml se lee de la carpeta actual
        $ErrorActionPreference = 'Continue'
        function Write-Log($m) { "[$(Get-Date -Format 's')] $m" | Out-File $Log -Append -Encoding utf8 }

        $intentos = 0
        while ($true) {
            if ((Test-Path $Log) -and ((Get-Item $Log).Length -gt 5MB)) {
                Move-Item $Log "$Log.1" -Force   # rotacion simple: nunca crece sin limite
            }
            $inicio = Get-Date
            Write-Log 'iniciando backend.exe'

            # La redireccion la hace cmd, no PowerShell: Go escribe su log en stderr y
            # Windows PowerShell 5.1 convertiria cada linea en una excepcion, matando
            # el backend en el primer mensaje.
            & cmd.exe /c "`"$Exe`" >> `"$Log`" 2>&1"
            $codigo = $LASTEXITCODE
            Write-Log "backend.exe termino (codigo $codigo)"

            if ($codigo -eq 0) { exit 0 }        # apagado ordenado: no se reinicia

            # Si aguanto mas de un minuto se considera sano y el contador vuelve a 0;
            # si cae al instante (p. ej. PostgreSQL apagado) la pausa crece hasta 60 s
            # para no girar en vacio.
            if (((Get-Date) - $inicio).TotalSeconds -gt 60) { $intentos = 0 }
            $intentos++
            $pausa = [Math]::Min(60, 2 * $intentos)
            Write-Log "reiniciando en $pausa s (intento $intentos)"
            Start-Sleep -Seconds $pausa
        }
    }

    'build'   { Invoke-Build }
    'start'   { Start-Backend }
    'stop'    { Stop-Backend; Write-Host "Detenido." }
    'restart' { Stop-Backend; Invoke-Build; Start-Backend }
    'status'  { Show-Estado }
    'logs'    { if (-not (Test-Path $Log)) { throw "Aun no hay log: $Log" }; Get-Content $Log -Tail 30 -Wait }

    'install' {
        Stop-Backend
        Invoke-Build

        $yo = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $tareaAccion = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $Backend -Argument (
            "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" run")
        $disparador = New-ScheduledTaskTrigger -AtLogOn -User $yo
        # RestartCount cubre solo fallos al LANZAR la tarea; la caida del backend la
        # resuelve el vigilante de la accion 'run'.
        $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -MultipleInstances IgnoreNew -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
        $principal = New-ScheduledTaskPrincipal -UserId $yo -LogonType Interactive -RunLevel Limited

        Register-ScheduledTask -TaskName $Tarea -Action $tareaAccion -Trigger $disparador `
            -Settings $ajustes -Principal $principal -Force `
            -Description 'Backend de Hotelerias (Go) en :5220. Ver deploy/laragon/backend-ctl.ps1' | Out-Null
        Write-Host "Tarea '$Tarea' registrada (arranca al iniciar sesion y se reinicia si cae)."
        Start-Backend
    }

    'uninstall' {
        Stop-Backend
        if (Get-Tarea) { Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false }
        Write-Host "Autoarranque quitado y backend detenido."
    }
}
