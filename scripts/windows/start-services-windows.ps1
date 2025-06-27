# Banana Bun Windows Service Startup Script
# This script starts all required external services for Banana Bun on Windows

param(
    [switch]$SkipOllama,
    [switch]$SkipChroma,
    [switch]$SkipMeiliSearch,
    [switch]$Verbose,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Banana Bun Windows Service Startup Script

Usage: .\start-services-windows.ps1 [options]

Options:
  -SkipOllama       Skip starting Ollama service
  -SkipChroma       Skip starting ChromaDB service
  -SkipMeiliSearch  Skip starting MeiliSearch service
  -Verbose          Enable verbose output
  -Help             Show this help message

This script will:
1. Check if services are already running
2. Start required services in the correct order
3. Wait for services to become healthy
4. Pull required Ollama models if needed

Services started:
- Ollama (http://localhost:11434)
- ChromaDB (http://localhost:8000)
- MeiliSearch (http://localhost:7700)
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

function Write-Service {
    param([string]$Message)
    Write-Host "[SERVICE] $Message" -ForegroundColor Cyan
}

function Write-Verbose {
    param([string]$Message)
    if ($Verbose) {
        Write-Host "[VERBOSE] $Message" -ForegroundColor Gray
    }
}

# Function to check if a service is running
function Test-ServiceHealth {
    param(
        [string]$Url,
        [string]$ServiceName,
        [int]$TimeoutSeconds = 5
    )
    
    try {
        Write-Verbose "Checking health of $ServiceName at $Url"
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Verbose "$ServiceName is healthy (HTTP 200)"
            return $true
        } else {
            Write-Verbose "$ServiceName returned HTTP $($response.StatusCode)"
            return $false
        }
    } catch {
        Write-Verbose "$ServiceName health check failed: $($_.Exception.Message)"
        return $false
    }
}

# Function to wait for a service to become healthy
function Wait-ForService {
    param(
        [string]$Url,
        [string]$ServiceName,
        [int]$MaxWaitSeconds = 60,
        [int]$CheckIntervalSeconds = 2
    )
    
    Write-Status "Waiting for $ServiceName to become healthy..."
    $elapsed = 0
    
    while ($elapsed -lt $MaxWaitSeconds) {
        if (Test-ServiceHealth -Url $Url -ServiceName $ServiceName) {
            Write-Status "$ServiceName is now healthy!"
            return $true
        }
        
        Start-Sleep -Seconds $CheckIntervalSeconds
        $elapsed += $CheckIntervalSeconds
        Write-Verbose "Waited $elapsed seconds for $ServiceName..."
    }
    
    Write-Error "$ServiceName did not become healthy within $MaxWaitSeconds seconds"
    return $false
}

# Function to check if a process is running
function Test-ProcessRunning {
    param([string]$ProcessName)
    
    $processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    return $processes.Count -gt 0
}

# Function to start a process and return the process object
function Start-ServiceProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory = $PWD,
        [string]$ServiceName
    )
    
    try {
        Write-Status "Starting $ServiceName..."
        Write-Verbose "Command: $FilePath $($ArgumentList -join ' ')"
        Write-Verbose "Working Directory: $WorkingDirectory"
        
        $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden
        Write-Status "$ServiceName started with PID $($process.Id)"
        return $process
    } catch {
        Write-Error "Failed to start $ServiceName: $($_.Exception.Message)"
        return $null
    }
}

Write-Status "🚀 Starting Banana Bun external services on Windows..."

# Create necessary directories
$chromaDbPath = Join-Path $PWD "chroma_db"
$meiliDbPath = Join-Path $PWD "meilisearch_db"

if (!(Test-Path $chromaDbPath)) {
    New-Item -ItemType Directory -Path $chromaDbPath -Force | Out-Null
    Write-Status "Created ChromaDB directory: $chromaDbPath"
}

if (!(Test-Path $meiliDbPath)) {
    New-Item -ItemType Directory -Path $meiliDbPath -Force | Out-Null
    Write-Status "Created MeiliSearch directory: $meiliDbPath"
}

$servicesStarted = @()
$serviceProcesses = @()

# Start Ollama service
if (!$SkipOllama) {
    Write-Service "Starting Ollama..."
    
    if (Test-ServiceHealth -Url "http://localhost:11434/api/tags" -ServiceName "Ollama") {
        Write-Status "Ollama is already running"
        $servicesStarted += "Ollama"
    } else {
        # Check if ollama command exists
        try {
            $ollamaPath = Get-Command "ollama" -ErrorAction Stop
            Write-Verbose "Found Ollama at: $($ollamaPath.Source)"
            
            # Start Ollama serve
            $ollamaProcess = Start-ServiceProcess -FilePath "ollama" -ArgumentList @("serve") -ServiceName "Ollama"
            if ($ollamaProcess) {
                $serviceProcesses += @{ Name = "Ollama"; Process = $ollamaProcess }
                
                # Wait for Ollama to become healthy
                if (Wait-ForService -Url "http://localhost:11434/api/tags" -ServiceName "Ollama" -MaxWaitSeconds 30) {
                    $servicesStarted += "Ollama"
                    
                    # Check and pull required models
                    Write-Status "Checking for required Ollama models..."
                    try {
                        $models = & ollama list 2>$null
                        if ($models -notmatch "qwen3:8b") {
                            Write-Status "Pulling qwen3:8b model (this may take a while)..."
                            & ollama pull qwen3:8b
                            Write-Status "qwen3:8b model pulled successfully"
                        } else {
                            Write-Status "qwen3:8b model already available"
                        }
                        
                        if ($models -notmatch "llama3.2:3b") {
                            Write-Status "Pulling llama3.2:3b model (this may take a while)..."
                            & ollama pull llama3.2:3b
                            Write-Status "llama3.2:3b model pulled successfully"
                        } else {
                            Write-Status "llama3.2:3b model already available"
                        }
                    } catch {
                        Write-Warning "Failed to check/pull Ollama models: $($_.Exception.Message)"
                    }
                } else {
                    Write-Error "Ollama failed to start properly"
                }
            }
        } catch {
            Write-Error "Ollama is not installed or not in PATH. Please install it first:"
            Write-Host "Visit: https://ollama.ai/download/windows"
            Write-Host "Or use winget: winget install Ollama.Ollama"
        }
    }
}

# Start ChromaDB service
if (!$SkipChroma) {
    Write-Service "Starting ChromaDB..."

    if (Test-ServiceHealth -Url "http://localhost:8000/api/v1/heartbeat" -ServiceName "ChromaDB") {
        Write-Status "ChromaDB is already running"
        $servicesStarted += "ChromaDB"
    } else {
        # Check if chroma command exists
        try {
            $chromaPath = Get-Command "chroma" -ErrorAction Stop
            Write-Verbose "Found ChromaDB at: $($chromaPath.Source)"

            # Start ChromaDB
            $chromaArgs = @("run", "--path", $chromaDbPath, "--port", "8000")
            $chromaProcess = Start-ServiceProcess -FilePath "chroma" -ArgumentList $chromaArgs -ServiceName "ChromaDB"
            if ($chromaProcess) {
                $serviceProcesses += @{ Name = "ChromaDB"; Process = $chromaProcess }

                # Wait for ChromaDB to become healthy
                if (Wait-ForService -Url "http://localhost:8000/api/v1/heartbeat" -ServiceName "ChromaDB" -MaxWaitSeconds 30) {
                    $servicesStarted += "ChromaDB"
                } else {
                    Write-Error "ChromaDB failed to start properly"
                }
            }
        } catch {
            Write-Error "ChromaDB is not installed or not in PATH. Please install it first:"
            Write-Host "pip install chromadb"
            Write-Host "Or use conda: conda install -c conda-forge chromadb"
        }
    }
}

# Start MeiliSearch service
if (!$SkipMeiliSearch) {
    Write-Service "Starting MeiliSearch..."

    if (Test-ServiceHealth -Url "http://localhost:7700/health" -ServiceName "MeiliSearch") {
        Write-Status "MeiliSearch is already running"
        $servicesStarted += "MeiliSearch"
    } else {
        # Check if meilisearch command exists
        try {
            $meiliPath = Get-Command "meilisearch" -ErrorAction Stop
            Write-Verbose "Found MeiliSearch at: $($meiliPath.Source)"

            # Get master key from environment or use default
            $masterKey = $env:MEILISEARCH_MASTER_KEY
            if (!$masterKey) {
                $masterKey = "lLt2H9fxI33JgEQvsYfdtBuFz0pW6jrdbbU9-pmTt6E"
                Write-Warning "Using default MeiliSearch master key. Set MEILISEARCH_MASTER_KEY environment variable for production."
            }

            # Start MeiliSearch
            $meiliArgs = @("--db-path", $meiliDbPath, "--http-addr", "127.0.0.1:7700", "--master-key", $masterKey)
            $meiliProcess = Start-ServiceProcess -FilePath "meilisearch" -ArgumentList $meiliArgs -ServiceName "MeiliSearch"
            if ($meiliProcess) {
                $serviceProcesses += @{ Name = "MeiliSearch"; Process = $meiliProcess }

                # Wait for MeiliSearch to become healthy
                if (Wait-ForService -Url "http://localhost:7700/health" -ServiceName "MeiliSearch" -MaxWaitSeconds 30) {
                    $servicesStarted += "MeiliSearch"
                } else {
                    Write-Error "MeiliSearch failed to start properly"
                }
            }
        } catch {
            Write-Error "MeiliSearch is not installed or not in PATH. Please install it first:"
            Write-Host "Download from: https://github.com/meilisearch/meilisearch/releases"
            Write-Host "Or use winget: winget install MeiliSearch.MeiliSearch"
        }
    }
}

# Summary
Write-Host ""
Write-Status "🎉 Service startup completed!"
Write-Host ""

if ($servicesStarted.Count -gt 0) {
    Write-Host "✅ Services started successfully:" -ForegroundColor Green
    foreach ($service in $servicesStarted) {
        Write-Host "   - $service" -ForegroundColor Green
    }
} else {
    Write-Warning "No services were started"
}

if ($serviceProcesses.Count -gt 0) {
    Write-Host ""
    Write-Host "📋 Running service processes:" -ForegroundColor Cyan
    foreach ($serviceInfo in $serviceProcesses) {
        Write-Host "   - $($serviceInfo.Name): PID $($serviceInfo.Process.Id)" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "🔧 Service health checks:" -ForegroundColor Yellow
Write-Host "   Ollama:      curl http://localhost:11434/api/tags" -ForegroundColor Gray
Write-Host "   ChromaDB:    curl http://localhost:8000/api/v1/heartbeat" -ForegroundColor Gray
Write-Host "   MeiliSearch: curl http://localhost:7700/health" -ForegroundColor Gray

Write-Host ""
Write-Host "🚀 You can now run: bun run dev" -ForegroundColor Green
Write-Host "🛑 To stop services: .\stop-services-windows.ps1" -ForegroundColor Yellow
