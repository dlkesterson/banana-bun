@echo off
REM Banana Bun Service Starter - Cross-platform entry script
REM This script detects the platform and runs the appropriate service startup script

echo 🚀 Starting Banana Bun Services
echo.

REM Check if we're on Windows
if "%OS%"=="Windows_NT" (
    echo [INFO] Detected Windows platform
    echo [INFO] Running Windows service startup script...
    echo.
    powershell -ExecutionPolicy Bypass -File "scripts\windows\start-services-windows.ps1" %*
) else (
    echo [INFO] Detected Unix-like platform
    echo [INFO] Running Linux/macOS service startup script...
    echo.
    bash "scripts/linux/start-services-linux.sh" "$@"
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Service startup failed
    pause
    exit /b %errorlevel%
)
