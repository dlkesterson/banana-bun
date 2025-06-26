@echo off
REM Banana Bun Windows Setup Script (Batch)
REM This script sets up Banana Bun for Windows environments

setlocal enabledelayedexpansion

echo 🚀 Setting up Banana Bun for Windows...

REM Create necessary directories
echo [INFO] Creating Banana directories...
set "BANANA_PATH=%USERPROFILE%\Documents\BananaBun"
set "MEDIA_PATH=%USERPROFILE%\Documents\Media"

mkdir "%BANANA_PATH%\incoming" 2>nul
mkdir "%BANANA_PATH%\processing" 2>nul
mkdir "%BANANA_PATH%\archive" 2>nul
mkdir "%BANANA_PATH%\error" 2>nul
mkdir "%BANANA_PATH%\tasks" 2>nul
mkdir "%BANANA_PATH%\outputs" 2>nul
mkdir "%BANANA_PATH%\logs" 2>nul
mkdir "%BANANA_PATH%\dashboard" 2>nul
mkdir "%BANANA_PATH%\media" 2>nul
mkdir "%MEDIA_PATH%\TV Shows" 2>nul
mkdir "%MEDIA_PATH%\Movies" 2>nul
mkdir "%MEDIA_PATH%\YouTube" 2>nul
mkdir "%MEDIA_PATH%\Downloads" 2>nul

REM Copy environment configuration
if not exist ".env" (
    echo [INFO] Creating .env file from Windows template...
    copy ".env.windows" ".env" >nul
    echo [WARNING] Please edit .env file to customize paths and add API keys
) else (
    echo [WARNING] .env file already exists, skipping...
)

REM Check for Bun
echo [INFO] Checking for Bun...
bun --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Bun is not installed. Please install it first:
    echo Visit: https://bun.sh/docs/installation#windows
    echo Or use PowerShell: irm bun.sh/install.ps1 ^| iex
    pause
    exit /b 1
) else (
    echo [INFO] Bun is installed
)

REM Check for Python
echo [INFO] Checking for Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Python is not installed. Please install from python.org
    echo Or use winget: winget install Python.Python.3.11
) else (
    echo [INFO] Python is installed
)

REM Install Node.js dependencies
echo [INFO] Installing Node.js dependencies...
bun install
if errorlevel 1 (
    echo [ERROR] Failed to install Node.js dependencies
    pause
    exit /b 1
)

REM Install Python dependencies
echo [INFO] Installing Python dependencies...
pip install openai-whisper chromadb
if errorlevel 1 (
    echo [WARNING] Failed to install some Python dependencies
)

REM Install yt-dlp
echo [INFO] Installing yt-dlp...
pip install yt-dlp
if errorlevel 1 (
    echo [WARNING] Failed to install yt-dlp
)

echo.
echo ✅ Banana Bun Windows setup completed!
echo.
echo 📋 Next steps:
echo 1. Edit .env file to customize paths and add API keys
echo 2. Install external services (if not already installed):
echo    - Ollama: winget install Ollama.Ollama
echo    - ChromaDB: pip install chromadb
echo    - MeiliSearch: winget install MeiliSearch.MeiliSearch
echo.
echo 3. Start Banana Bun with services:
echo.
echo    🚀 Recommended - Automatic service management:
echo    bun run dev:with-services
echo.
echo    🔧 Manual service management:
echo    start-services-windows.ps1 ^&^& bun run dev
echo.
echo    ⚙️ Individual service commands:
echo    bun run dev:services         (start services only)
echo    bun run dev:services:stop    (stop services only)
echo.
echo 🔧 Service health checks:
echo    curl http://localhost:11434/api/tags         (Ollama)
echo    curl http://localhost:8000/api/v1/heartbeat  (ChromaDB)
echo    curl http://localhost:7700/health            (MeiliSearch)
echo.
echo 💡 The application will automatically check service health on startup
echo.
echo For more advanced setup options, use setup-windows.ps1
pause
