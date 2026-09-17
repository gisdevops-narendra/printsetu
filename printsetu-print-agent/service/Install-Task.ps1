# Registers the PrintSetu Print Agent as a background Windows Task —
# starts automatically at boot, runs even when nobody is logged in, has no
# 72-hour execution limit (Task Scheduler's default, which would otherwise
# kill a long-running agent), and restarts itself if it ever exits/crashes.
#
# Deliberately NOT a classic Windows Service: that requires a service-control
# wrapper binary (e.g. WinSW, which node-windows also uses under the hood),
# and the common wrapper builds target the legacy .NET Framework 3.5, which
# many Windows 10/11 PCs no longer have installed and may not be able to
# download on demand. Task Scheduler is a core OS component with no such
# dependency, and gives us the same "auto-start + auto-restart" guarantees.
$ErrorActionPreference = 'Stop'
$taskName = 'PrintSetuAgent'
$exePath = Join-Path $PSScriptRoot 'PrintSetuAgent.exe'

# Re-running the installer (e.g. after a fresh download) must not leave a
# previous instance running alongside the new one -- unregistering a task
# does not by itself stop an already-running process, and neither does this
# catch a copy someone ran by double-clicking the exe directly.
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Get-Process -Name 'PrintSetuAgent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "PrintSetu Print Agent task installed and started."
