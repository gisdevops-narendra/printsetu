@echo off
setlocal

:: Re-launch this script with administrator rights if it isn't already
:: elevated -- registering a background task that runs at startup always
:: requires this.
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo This needs permission to set up a background task.
    echo A Windows "Yes/No" prompt will appear next -- please click Yes.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo ==================================================
echo   Installing the PrintSetu Print Agent
echo ==================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Task.ps1"
if %errorLevel% neq 0 (
    echo.
    echo Something went wrong while installing. Please contact PrintSetu support.
    pause
    exit /b 1
)

echo.
echo Checking your connection to PrintSetu (this can take up to 20 seconds)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Check-Connection.ps1"

echo.
pause
