# Banana Bun Windows Setup Script (PowerShell)
# This script sets up Banana Bun for Windows environments

param(
    [switch]$SkipDependencies,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Banana Bun Windows Setup Script

Usage: .\setup-windows.ps1 [options]

Options:
  -SkipDependencies    Skip automatic dependency installation
  -Help               Show this help message

This script will:
1. Create necessary directories
2. Copy environment configuration
3. Check for required dependencies
4. Install missing dependencies (if not skipped)
5. Install dependencies and Python packages

Prerequisites:
- PowerShell 5.1 or later
- Internet connection for downloading dependencies
"@
    exit 0
}

# Colors for output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if running on Windows
if ($PSVersionTable.Platform -and $PSVersionTable.Platform -ne "Win32NT") {
    Write-Error "This script is designed for Windows systems only."
    exit 1
}

Write-Status "🚀 Setting up Banana Bun for Windows..."

# Create necessary directories
Write-Status "Creating Banana directories..."
$bananaBunPath = "$env:USERPROFILE\Documents\BananaBun"
$mediaPath = "$env:USERPROFILE\Documents\Media"

$directories = @(
    "$bananaBunPath\incoming",
    "$bananaBunPath\processing", 
    "$bananaBunPath\archive",
    "$bananaBunPath\error",
    "$bananaBunPath\tasks",
    "$bananaBunPath\outputs",
    "$bananaBunPath\logs",
    "$bananaBunPath\dashboard",
    "$bananaBunPath\media",
    "$mediaPath\TV Shows",
    "$mediaPath\Movies",
    "$mediaPath\YouTube",
    "$mediaPath\Downloads"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Status "Created directory: $dir"
    }
}

# Copy environment configuration
if (!(Test-Path ".env")) {
    Write-Status "Creating .env file from Windows template..."
    Copy-Item ".env.windows" ".env"
    Write-Warning "Please edit .env file to customize paths and add API keys"
} else {
    Write-Warning ".env file already exists, skipping..."
}

if (!$SkipDependencies) {
    Write-Status "Checking system dependencies..."

    # Check for Bun
    try {
        $bunVersion = & bun --version 2>$null
        Write-Status "Bun is installed: $bunVersion"
    } catch {
        Write-Error "Bun is not installed. Please install it first:"
        Write-Host "Visit: https://bun.sh/docs/installation#windows"
        Write-Host "Or use PowerShell: irm bun.sh/install.ps1 | iex"
        exit 1
    }

    # Check for Python
    try {
        $pythonVersion = & python --version 2>$null
        Write-Status "Python is installed: $pythonVersion"
    } catch {
        Write-Warning "Python is not installed. Installing via winget..."
        try {
            & winget install Python.Python.3.11
        } catch {
            Write-Error "Failed to install Python. Please install manually from python.org"
            exit 1
        }
    }

    # Check for FFmpeg
    try {
        $ffmpegVersion = & ffmpeg -version 2>$null | Select-Object -First 1
        Write-Status "FFmpeg is installed"
    } catch {
        Write-Warning "FFmpeg is not installed. Installing via winget..."
        try {
            & winget install Gyan.FFmpeg
        } catch {
            Write-Warning "Failed to install FFmpeg via winget. Try chocolatey: choco install ffmpeg"
        }
    }

    # Check for MediaInfo
    try {
        $mediainfoVersion = & mediainfo --version 2>$null
        Write-Status "MediaInfo is installed"
    } catch {
        Write-Warning "MediaInfo is not installed. Installing via winget..."
        try {
            & winget install MediaArea.MediaInfo
        } catch {
            Write-Warning "Failed to install MediaInfo via winget. Please install manually from mediaarea.net"
        }
    }
}

# Install dependencies
Write-Status "Installing dependencies..."
try {
    & bun install
    Write-Status "Dependencies installed successfully"
} catch {
    Write-Error "Failed to install dependencies"
    exit 1
}

# Install Python dependencies
Write-Status "Installing Python dependencies..."
try {
    & pip install openai-whisper chromadb
    Write-Status "Python dependencies installed successfully"
} catch {
    Write-Warning "Failed to install some Python dependencies. You may need to install them manually."
}

# Check for optional tools
Write-Status "Checking optional tools..."

# Check for yt-dlp
try {
    $ytdlpVersion = & yt-dlp --version 2>$null
    Write-Status "yt-dlp is installed: $ytdlpVersion"
} catch {
    Write-Warning "yt-dlp is not installed. Installing..."
    try {
        & pip install yt-dlp
    } catch {
        Write-Warning "Failed to install yt-dlp. Install manually if needed."
    }
}

Write-Status "✅ Banana Bun Windows setup completed!"
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit .env file to customize paths and add API keys"
Write-Host "2. Install external services (if not already installed):"
Write-Host "   - Ollama: winget install Ollama.Ollama"
Write-Host "   - ChromaDB: pip install chromadb"
Write-Host "   - MeiliSearch: winget install MeiliSearch.MeiliSearch"
Write-Host ""
Write-Host "3. Start Banana Bun with services:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   🚀 Recommended - Automatic service management:" -ForegroundColor Green
Write-Host "   bun run dev:with-services    # Checks and starts services, then runs dev server"
Write-Host ""
Write-Host "   🔧 Manual service management:" -ForegroundColor Cyan
Write-Host "   .\\start-services-windows.ps1  # Start all services"
Write-Host "   bun run dev                    # Run dev server"
Write-Host "   .\\stop-services-windows.ps1   # Stop services when done"
Write-Host ""
Write-Host "   ⚙️ Individual service commands:" -ForegroundColor Gray
Write-Host "   bun run dev:services          # Start services only"
Write-Host "   bun run dev:services:stop     # Stop services only"
Write-Host ""
Write-Host "🔧 Service health checks:" -ForegroundColor Yellow
Write-Host "   curl http://localhost:11434/api/tags         # Ollama"
Write-Host "   curl http://localhost:8000/api/v1/heartbeat  # ChromaDB"
Write-Host "   curl http://localhost:7700/health            # MeiliSearch"
Write-Host ""
Write-Host "💡 The application will automatically check service health on startup" -ForegroundColor Cyan
Write-Host "   and provide guidance if services are not running."
