# Cross-Platform Setup Guide

This guide covers setting up Banana Bun on different operating systems with platform-appropriate configurations.

## Overview

Banana Bun is designed to work seamlessly across Windows, Linux, and macOS. The configuration system automatically detects your platform and uses appropriate default paths, but you can customize everything to fit your needs.

## Platform-Specific Defaults

### Linux
- **Data Directory**: `~/.local/share/banana-bun`
- **Media Directory**: `~/Media`
- **Package Manager**: apt, yum, pacman (depending on distribution)
- **Setup Script**: `setup-linux.sh`

### Windows
- **Data Directory**: `%USERPROFILE%\Documents\BananaBun`
- **Media Directory**: `%USERPROFILE%\Documents\Media`
- **Package Manager**: winget, chocolatey, or scoop
- **Setup Scripts**: `setup-windows.ps1` (PowerShell) or `setup-windows.bat` (Command Prompt)

### macOS
- **Data Directory**: `~/Library/Application Support/BananaBun`
- **Media Directory**: `~/Movies`
- **Package Manager**: brew
- **Setup Script**: `setup-linux.sh` (works on macOS too)

## Quick Setup

### Linux/macOS

```bash
# Clone and enter the repository
git clone https://github.com/yourusername/banana-bun.git
cd banana-bun

# Run the setup script
chmod +x setup-linux.sh
./setup-linux.sh

# The script will:
# 1. Create necessary directories
# 2. Copy .env.linux to .env
# 3. Install system dependencies
# 4. Install Node.js and Python dependencies
# 5. Set up external services
```

### Windows (PowerShell)

```powershell
# Clone and enter the repository
git clone https://github.com/yourusername/banana-bun.git
cd banana-bun

# Run the PowerShell setup script
.\setup-windows.ps1

# For advanced options:
.\setup-windows.ps1 -SkipDependencies  # Skip automatic dependency installation
.\setup-windows.ps1 -Help              # Show help
```

### Windows (Command Prompt)

```cmd
# Clone and enter the repository
git clone https://github.com/yourusername/banana-bun.git
cd banana-bun

# Run the batch setup script
.\setup-windows.bat
```

## Manual Configuration

If you prefer to set up manually or need custom paths:

### 1. Choose Environment Template

```bash
# For Linux
cp .env.linux .env

# For Windows
cp .env.windows .env

# For custom setup
cp .env.example .env
```

### 2. Customize Paths

Edit the `.env` file to customize paths for your system:

```bash
# Example Linux customization
BASE_PATH=/home/myuser/banana-data
MEDIA_COLLECTION_PATH=/mnt/media-drive

# Example Windows customization
BASE_PATH=D:/BananaBun
MEDIA_COLLECTION_PATH=E:/Media
```

### 3. Install Dependencies

#### Linux (Ubuntu/Debian)
```bash
# System dependencies
sudo apt update
sudo apt install -y ffmpeg mediainfo python3 python3-pip

# Bun runtime
curl -fsSL https://bun.sh/install.sh | bash

# Python packages
pip3 install --user openai-whisper chromadb yt-dlp

# Node.js dependencies
bun install
```

#### Windows
```powershell
# Using winget
winget install Gyan.FFmpeg
winget install MediaArea.MediaInfo
winget install Python.Python.3.11

# Install Bun
irm bun.sh/install.ps1 | iex

# Python packages
pip install openai-whisper chromadb yt-dlp

# Node.js dependencies
bun install
```

#### macOS
```bash
# Using Homebrew
brew install ffmpeg mediainfo python3

# Bun runtime
curl -fsSL https://bun.sh/install.sh | bash

# Python packages
pip3 install openai-whisper chromadb yt-dlp

# Node.js dependencies
bun install
```

## External Services

Banana Bun requires several external services. The setup scripts can help install these:

### Ollama (AI Models)
- **Linux/macOS**: `curl -fsSL https://ollama.ai/install.sh | sh`
- **Windows**: Download from https://ollama.ai/download/windows

### ChromaDB (Vector Database)
```bash
pip install chromadb
chroma run --path ./chroma_db --port 8000
```

### MeiliSearch (Text Search)
- **Linux**: Download from GitHub releases
- **Windows**: Download from GitHub releases or use winget
- **macOS**: `brew install meilisearch`

## Troubleshooting

### Common Issues

1. **Permission Errors (Linux/macOS)**
   ```bash
   # Make sure scripts are executable
   chmod +x setup-linux.sh
   chmod +x start-services-linux.sh
   ```

2. **Path Issues (Windows)**
   - Use forward slashes in .env files: `C:/Users/Name/Documents`
   - Or use environment variables: `%USERPROFILE%/Documents`

3. **Missing Dependencies**
   - Run the setup script again: it will check and install missing dependencies
   - Or install manually using your platform's package manager

4. **Service Connection Issues**
   - Check if services are running: `curl http://localhost:11434/api/tags`
   - Restart services using the provided scripts

### Getting Help

- Check the logs in your configured logs directory
- Run health checks: `curl http://localhost:8000/api/v1/heartbeat`
- Review the setup script output for any error messages

## Advanced Configuration

### Custom Media Organization

You can customize how media is organized by editing the `.env` file:

```bash
# Custom media paths
MEDIA_COLLECTION_TV=/path/to/tv/shows
MEDIA_COLLECTION_MOVIES=/path/to/movies
MEDIA_COLLECTION_YOUTUBE=/path/to/youtube/downloads
MEDIA_COLLECTION_CATCHALL=/path/to/other/media

# Custom tool paths
FFPROBE_PATH=/custom/path/to/ffprobe
MEDIAINFO_PATH=/custom/path/to/mediainfo
YTDLP_PATH=/custom/path/to/yt-dlp
```

### Environment Variable Resolution

Banana Bun supports both Unix and Windows style environment variables:

```bash
# Unix style
BASE_PATH=$HOME/banana-data
MEDIA_PATH=${HOME}/Media

# Windows style
BASE_PATH=%USERPROFILE%/Documents/BananaBun
MEDIA_PATH=%USERPROFILE%/Documents/Media
```

The configuration system will automatically resolve these based on your platform.
