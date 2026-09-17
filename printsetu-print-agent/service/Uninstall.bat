@echo off
setlocal

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo This needs permission to remove the background task.
    echo A Windows "Yes/No" prompt will appear next -- please click Yes.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo ==================================================
echo   Removing the PrintSetu Print Agent
echo ==================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-Task.ps1"

echo.
echo The PrintSetu Print Agent has been removed from this PC.
pause
