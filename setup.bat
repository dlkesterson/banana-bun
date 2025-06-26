@echo off
REM Banana Bun Setup - Cross-platform entry script
REM This script detects the platform and runs the appropriate setup script

echo 🚀 Banana Bun Setup
echo.

REM Check if we're on Windows
if "%OS%"=="Windows_NT" (
    echo [INFO] Detected Windows platform
    echo [INFO] Running Windows setup script...
    echo.
    
    REM Check if PowerShell is available and prefer it
    powershell -Command "Get-Host" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [INFO] Using PowerShell setup script for better functionality
        powershell -ExecutionPolicy Bypass -File "scripts\windows\setup-windows.ps1" %*
    ) else (
        echo [INFO] PowerShell not available, using batch setup script
        call "scripts\windows\setup-windows.bat" %*
    )
) else (
    echo [INFO] Detected Unix-like platform
    echo [INFO] Running Linux/macOS setup script...
    echo.
    bash "scripts/linux/setup-linux.sh" "$@"
)

echo.
echo Setup script completed.
pause
