@echo off
REM Banana Bun Service Stopper - Cross-platform entry script
REM This script detects the platform and runs the appropriate service stop script

echo 🛑 Stopping Banana Bun Services
echo.

REM Check if we're on Windows
if "%OS%"=="Windows_NT" (
    echo [INFO] Detected Windows platform
    echo [INFO] Running Windows service stop script...
    echo.
    powershell -ExecutionPolicy Bypass -File "scripts\windows\stop-services-windows.ps1" %*
) else (
    echo [INFO] Detected Unix-like platform
    echo [INFO] Running Linux/macOS service stop script...
    echo.
    bash "scripts/linux/stop-services-linux.sh" "$@"
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Service stop failed
    pause
    exit /b %errorlevel%
)
