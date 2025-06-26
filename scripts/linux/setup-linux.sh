#!/bin/bash

# Banana Bun Linux Setup Script
# This script sets up Banana Bun for Linux environments

set -e

echo "🚀 Setting up Banana Bun for Linux..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    print_error "This script is designed for Linux systems only."
    exit 1
fi

# Create necessary directories
print_status "Creating Banana directories..."
mkdir -p ~/.local/share/banana-bun/{incoming,processing,archive,error,tasks,outputs,logs,dashboard,media}
mkdir -p ~/Media/{TV\ Shows,Movies,YouTube,Downloads}

# Copy environment configuration
if [ ! -f .env ]; then
    print_status "Creating .env file from Linux template..."
    cp .env.linux .env
    print_warning "Please edit .env file to customize paths and add API keys"
else
    print_warning ".env file already exists, skipping..."
fi

# Check for required system dependencies
print_status "Checking system dependencies..."

# Check for Bun
if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed. Please install it first:"
    echo "curl -fsSL https://bun.sh/install.sh | bash"
    exit 1
fi

# Check for Python3
if ! command -v python3 &> /dev/null; then
    print_error "Python3 is not installed. Please install it:"
    echo "sudo apt install python3 python3-pip"
    exit 1
fi

# Check for FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    print_warning "FFmpeg is not installed. Installing..."
    sudo apt update && sudo apt install -y ffmpeg
fi

# Check for MediaInfo
if ! command -v mediainfo &> /dev/null; then
    print_warning "MediaInfo is not installed. Installing..."
    sudo apt install -y mediainfo
fi

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
bun install

# Install Python dependencies
print_status "Installing Python dependencies..."
pip3 install --user openai-whisper chromadb

# Check for Ollama
if ! command -v ollama &> /dev/null; then
    print_warning "Ollama is not installed. Installing..."
    curl -fsSL https://ollama.ai/install.sh | sh
fi

# Check for MeiliSearch
if ! command -v meilisearch &> /dev/null; then
    print_warning "MeiliSearch is not installed. Installing..."
    wget -q https://github.com/meilisearch/meilisearch/releases/latest/download/meilisearch-linux-amd64
    chmod +x meilisearch-linux-amd64
    sudo mv meilisearch-linux-amd64 /usr/local/bin/meilisearch
fi

# Check for yt-dlp (optional)
if ! command -v yt-dlp &> /dev/null; then
    print_warning "yt-dlp is not installed. Installing..."
    pip3 install --user yt-dlp
fi

print_status "✅ Banana Bun Linux setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file to customize paths and add API keys"
echo "2. Start external services:"
echo "   - Ollama: ollama serve"
echo "   - ChromaDB: chroma run --path ./chroma_db"
echo "   - MeiliSearch: meilisearch --db-path ./meilisearch_db --http-addr 127.0.0.1:7700"
echo "3. Pull Ollama models: ollama pull qwen3:8b"
echo "4. Start Banana Bun: bun run dev"
echo ""
echo "🔧 Service health checks:"
echo "   curl http://localhost:11434/api/tags    # Ollama"
echo "   curl http://localhost:8000/api/v1/heartbeat  # ChromaDB"
echo "   curl http://localhost:7700/health       # MeiliSearch"
