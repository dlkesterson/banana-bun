#!/bin/bash
# Banana Bun Service Starter - Cross-platform entry script
# This script detects the platform and runs the appropriate service startup script

echo "🚀 Starting Banana Bun Services"
echo ""

# Detect platform
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    echo "[INFO] Detected Windows platform (Git Bash/Cygwin/MSYS2)"
    echo "[INFO] Running Windows service startup script..."
    echo ""
    
    if command -v powershell.exe &> /dev/null; then
        powershell.exe -ExecutionPolicy Bypass -File "scripts/windows/start-services-windows.ps1" "$@"
    else
        echo "[ERROR] PowerShell not found. Please run from Windows Command Prompt or PowerShell."
        exit 1
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[INFO] Detected Unix-like platform: $OSTYPE"
    echo "[INFO] Running Linux/macOS service startup script..."
    echo ""
    bash "scripts/linux/start-services-linux.sh" "$@"
else
    echo "[INFO] Detected platform: $OSTYPE"
    echo "[INFO] Running Linux/macOS service startup script..."
    echo ""
    bash "scripts/linux/start-services-linux.sh" "$@"
fi

exit_code=$?
if [ $exit_code -ne 0 ]; then
    echo ""
    echo "[ERROR] Service startup failed with exit code $exit_code"
    exit $exit_code
fi
