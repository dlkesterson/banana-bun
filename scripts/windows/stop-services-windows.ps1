# Banana Bun Windows Service Stop Script
# This script gracefully stops all external services for Banana Bun on Windows

param(
    [switch]$SkipOllama,
    [switch]$SkipChroma,
    [switch]$SkipMeiliSearch,
    [switch]$Force,
    [switch]$Verbose,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Banana Bun Windows Service Stop Script

Usage: .\stop-services-windows.ps1 [options]

Options:
  -SkipOllama       Skip stopping Ollama service
  -SkipChroma       Skip stopping ChromaDB service
  -SkipMeiliSearch  Skip stopping MeiliSearch service
  -Force            Force kill processes if graceful shutdown fails
  -Verbose          Enable verbose output
  -Help             Show this help message

This script will:
1. Gracefully stop running services
2. Wait for processes to terminate
3. Force kill if necessary (with -Force flag)

Services stopped:
- MeiliSearch (http://localhost:7700)
- ChromaDB (http://localhost:8000)
- Ollama (http://localhost:11434) - Optional
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
        [int]$TimeoutSeconds = 3
    )
    
    try {
        Write-Verbose "Checking if $ServiceName is still running at $Url"
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        Write-Verbose "$ServiceName appears to be stopped"
        return $false
    }
}

# Function to stop processes by name
function Stop-ServiceByName {
    param(
        [string]$ProcessName,
        [string]$ServiceName,
        [string]$HealthCheckUrl = $null,
        [int]$GracefulWaitSeconds = 10
    )
    
    Write-Service "Stopping $ServiceName..."
    
    # First check if service is actually running
    if ($HealthCheckUrl -and !(Test-ServiceHealth -Url $HealthCheckUrl -ServiceName $ServiceName)) {
        Write-Status "$ServiceName is not running"
        return $true
    }
    
    # Get processes
    $processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    
    if ($processes.Count -eq 0) {
        Write-Status "$ServiceName process not found"
        return $true
    }
    
    Write-Verbose "Found $($processes.Count) $ServiceName process(es)"
    
    # Try graceful shutdown first
    foreach ($process in $processes) {
        try {
            Write-Verbose "Attempting graceful shutdown of $ServiceName (PID: $($process.Id))"
            $process.CloseMainWindow() | Out-Null
        } catch {
            Write-Verbose "CloseMainWindow failed for $ServiceName (PID: $($process.Id))"
        }
    }
    
    # Wait for graceful shutdown
    Write-Status "Waiting for $ServiceName to shut down gracefully..."
    $waited = 0
    while ($waited -lt $GracefulWaitSeconds) {
        $remainingProcesses = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
        if ($remainingProcesses.Count -eq 0) {
            Write-Status "$ServiceName stopped gracefully"
            return $true
        }
        
        Start-Sleep -Seconds 1
        $waited++
        Write-Verbose "Waited $waited seconds for $ServiceName to stop..."
    }
    
    # If Force flag is set, kill remaining processes
    if ($Force) {
        $remainingProcesses = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
        if ($remainingProcesses.Count -gt 0) {
            Write-Warning "Force killing $ServiceName processes..."
            foreach ($process in $remainingProcesses) {
                try {
                    Write-Verbose "Force killing $ServiceName (PID: $($process.Id))"
                    $process.Kill()
                } catch {
                    Write-Error "Failed to kill $ServiceName process (PID: $($process.Id)): $($_.Exception.Message)"
                }
            }
            
            # Final check
            Start-Sleep -Seconds 2
            $finalCheck = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
            if ($finalCheck.Count -eq 0) {
                Write-Status "$ServiceName force stopped successfully"
                return $true
            } else {
                Write-Error "Failed to stop $ServiceName completely"
                return $false
            }
        }
    } else {
        Write-Warning "$ServiceName did not stop gracefully. Use -Force to kill remaining processes."
        return $false
    }
    
    return $true
}

Write-Status "🛑 Stopping Banana Bun external services on Windows..."

$servicesStopped = @()
$servicesFailed = @()

# Stop MeiliSearch first (reverse order of startup)
if (!$SkipMeiliSearch) {
    if (Stop-ServiceByName -ProcessName "meilisearch" -ServiceName "MeiliSearch" -HealthCheckUrl "http://localhost:7700/health") {
        $servicesStopped += "MeiliSearch"
    } else {
        $servicesFailed += "MeiliSearch"
    }
}

# Stop ChromaDB
if (!$SkipChroma) {
    # ChromaDB might run as python process, so we need to be more specific
    $chromaProcesses = Get-Process | Where-Object { $_.ProcessName -eq "python" -and $_.CommandLine -like "*chroma*" } -ErrorAction SilentlyContinue
    
    if ($chromaProcesses.Count -eq 0) {
        # Try generic chroma process name
        if (Stop-ServiceByName -ProcessName "chroma" -ServiceName "ChromaDB" -HealthCheckUrl "http://localhost:8000/api/v1/heartbeat") {
            $servicesStopped += "ChromaDB"
        } else {
            $servicesFailed += "ChromaDB"
        }
    } else {
        Write-Service "Stopping ChromaDB (Python process)..."
        $stopped = $true
        foreach ($process in $chromaProcesses) {
            try {
                Write-Verbose "Stopping ChromaDB Python process (PID: $($process.Id))"
                if ($Force) {
                    $process.Kill()
                } else {
                    $process.CloseMainWindow() | Out-Null
                    Start-Sleep -Seconds 2
                    if (!$process.HasExited) {
                        if ($Force) {
                            $process.Kill()
                        } else {
                            Write-Warning "ChromaDB process did not stop gracefully. Use -Force to kill."
                            $stopped = $false
                        }
                    }
                }
            } catch {
                Write-Error "Failed to stop ChromaDB process: $($_.Exception.Message)"
                $stopped = $false
            }
        }
        
        if ($stopped) {
            $servicesStopped += "ChromaDB"
        } else {
            $servicesFailed += "ChromaDB"
        }
    }
}

# Stop Ollama (optional, as users might want to keep it running)
if (!$SkipOllama) {
    $response = Read-Host "Stop Ollama service? (y/N)"
    if ($response -match "^[Yy]") {
        if (Stop-ServiceByName -ProcessName "ollama" -ServiceName "Ollama" -HealthCheckUrl "http://localhost:11434/api/tags") {
            $servicesStopped += "Ollama"
        } else {
            $servicesFailed += "Ollama"
        }
    } else {
        Write-Status "Keeping Ollama running..."
    }
}

# Summary
Write-Host ""
Write-Status "🎉 Service shutdown completed!"
Write-Host ""

if ($servicesStopped.Count -gt 0) {
    Write-Host "✅ Services stopped successfully:" -ForegroundColor Green
    foreach ($service in $servicesStopped) {
        Write-Host "   - $service" -ForegroundColor Green
    }
}

if ($servicesFailed.Count -gt 0) {
    Write-Host "❌ Services that failed to stop:" -ForegroundColor Red
    foreach ($service in $servicesFailed) {
        Write-Host "   - $service" -ForegroundColor Red
    }
    Write-Host ""
    Write-Warning "Try running with -Force flag to forcefully stop remaining services"
}

Write-Host ""
Write-Host "💡 Note: You can restart services with: .\start-services-windows.ps1" -ForegroundColor Cyan
