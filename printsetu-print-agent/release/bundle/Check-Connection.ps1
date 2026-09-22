# Tails the agent's log file for up to ~20 seconds looking for a
# successful backend connection, so Install.bat can print a plain-language
# confirmation instead of leaving the shopkeeper guessing.
$logFile = Join-Path $PSScriptRoot 'logs\agent.log'
$connected = $false

for ($i = 0; $i -lt 20; $i++) {
    if (Test-Path $logFile) {
        if (Select-String -Path $logFile -Pattern 'Connected to PrintSetu backend' -Quiet -ErrorAction SilentlyContinue) {
            $connected = $true
            break
        }
    }
    Start-Sleep -Seconds 1
}

Write-Host ""
if ($connected) {
    Write-Host "SUCCESS -- your shop is now connected to PrintSetu!" -ForegroundColor Green
    Write-Host "You can check your PrintSetu dashboard -- it should show this printer as Online."
} else {
    Write-Host "The Print Agent is installed and running, but hasn't confirmed the connection yet." -ForegroundColor Yellow
    Write-Host "This usually just takes a little longer on the first run. Check your PrintSetu"
    Write-Host "dashboard in a minute -- if it still doesn't show Online, check your internet"
    Write-Host "connection or contact PrintSetu support."
}
