# Banana Bun Scripts Directory

This directory contains all platform-specific setup and service management scripts for Banana Bun, organized by platform for better maintainability.

## Directory Structure

```
scripts/
├── README.md           # This file
├── windows/            # Windows-specific scripts
│   ├── setup-windows.bat
│   ├── setup-windows.ps1
│   ├── start-services-windows.ps1
│   └── stop-services-windows.ps1
├── linux/              # Linux/macOS scripts
│   ├── setup-linux.sh
│   ├── start-services-linux.sh
│   ├── stop-services-linux.sh
│   └── start-banana-bun.sh
└── common/             # Cross-platform utilities (future use)
```

## Root Entry Scripts

The root directory contains cross-platform entry scripts that automatically detect your platform and run the appropriate script:

- **`setup.bat`** / **`setup.sh`** - Platform-agnostic setup scripts
- **`start-services.bat`** / **`start-services.sh`** - Platform-agnostic service startup
- **`stop-services.bat`** / **`stop-services.sh`** - Platform-agnostic service shutdown

## Usage

### Recommended: Use NPM Scripts (Cross-platform)

```bash
# Setup (detects platform automatically)
npm run setup

# Start services (detects platform automatically)
npm run services:start

# Stop services (detects platform automatically)  
npm run services:stop

# Development with automatic service management
npm run dev:with-services
```

### Direct Script Usage

#### Windows
```cmd
# Setup
setup.bat
# or
scripts\windows\setup-windows.ps1

# Services
start-services.bat
# or  
scripts\windows\start-services-windows.ps1

stop-services.bat
# or
scripts\windows\stop-services-windows.ps1
```

#### Linux/macOS
```bash
# Setup
./setup.sh
# or
./scripts/linux/setup-linux.sh

# Services
./start-services.sh
# or
./scripts/linux/start-services-linux.sh

./stop-services.sh
# or
./scripts/linux/stop-services-linux.sh
```

## Platform-Specific Features

### Windows Scripts
- **PowerShell (.ps1)**: Full-featured with colored output, error handling, and advanced service management
- **Batch (.bat)**: Basic functionality for systems without PowerShell
- **Automatic dependency installation** via winget
- **Service health monitoring** with retry logic
- **Ollama model management** (automatic pulling of required models)

### Linux Scripts
- **Bash scripts** with comprehensive error handling
- **Package manager detection** (apt, yum, pacman, brew)
- **Background service management** with proper process handling
- **Service health monitoring** with curl-based checks

## Service Management

All scripts manage these external services:

- **Ollama** (http://localhost:11434) - Local LLM service
- **ChromaDB** (http://localhost:8000) - Vector database
- **MeiliSearch** (http://localhost:7700) - Search engine

### Health Check URLs
- Ollama: `http://localhost:11434/api/tags`
- ChromaDB: `http://localhost:8000/api/v1/heartbeat`
- MeiliSearch: `http://localhost:7700/health`

## Development Integration

The application automatically performs health checks on startup and provides guidance if services are missing. The service management is integrated into the development workflow through:

- **Automatic service detection** in `src/utils/service-health.ts`
- **Smart service startup** in `src/utils/check-and-start-services.ts`
- **NPM script integration** for seamless development experience

## Adding New Scripts

When adding new platform-specific scripts:

1. Place them in the appropriate platform directory (`windows/` or `linux/`)
2. Update the root entry scripts if needed
3. Add corresponding NPM scripts in `package.json`
4. Update this README with documentation

## Troubleshooting

If scripts fail to run:

1. **Windows**: Ensure PowerShell execution policy allows scripts:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Linux/macOS**: Ensure scripts are executable:
   ```bash
   chmod +x scripts/linux/*.sh
   chmod +x *.sh
   ```

3. **Cross-platform**: Use the NPM scripts which handle platform detection automatically:
   ```bash
   npm run setup
   npm run services:start
   ```
