#!/bin/bash
# Banana Bun Setup - Cross-platform entry script
# This script detects the platform and runs the appropriate setup script

echo "🚀 Banana Bun Setup"
echo ""

# Detect platform
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    echo "[INFO] Detected Windows platform (Git Bash/Cygwin/MSYS2)"
    echo "[INFO] Running Windows setup script..."
    echo ""
    
    # Try PowerShell first, fall back to batch
    if command -v powershell.exe &> /dev/null; then
        echo "[INFO] Using PowerShell setup script for better functionality"
        powershell.exe -ExecutionPolicy Bypass -File "scripts/windows/setup-windows.ps1" "$@"
    elif command -v cmd.exe &> /dev/null; then
        echo "[INFO] Using batch setup script"
        cmd.exe /c "scripts\\windows\\setup-windows.bat" "$@"
    else
        echo "[ERROR] No suitable Windows shell found"
        exit 1
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "[INFO] Detected Linux platform"
    echo "[INFO] Running Linux setup script..."
    echo ""
    bash "scripts/linux/setup-linux.sh" "$@"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[INFO] Detected macOS platform"
    echo "[INFO] Running Linux/macOS setup script..."
    echo ""
    bash "scripts/linux/setup-linux.sh" "$@"
else
    echo "[INFO] Detected Unix-like platform: $OSTYPE"
    echo "[INFO] Running Linux/macOS setup script..."
    echo ""
    bash "scripts/linux/setup-linux.sh" "$@"
fi

echo ""
echo "Setup script completed."
