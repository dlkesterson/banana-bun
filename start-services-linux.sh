#!/bin/bash

# Atlas Linux Services Startup Script
# This script starts all required external services for Atlas

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_service() {
    echo -e "${BLUE}[SERVICE]${NC} $1"
}

# Function to check if a service is running
check_service() {
    local url=$1
    local name=$2
    
    if curl -s "$url" > /dev/null 2>&1; then
        print_status "$name is already running"
        return 0
    else
        return 1
    fi
}

# Function to wait for service to start
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    
    print_status "Waiting for $name to start..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            print_status "$name is ready!"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$name failed to start within 60 seconds"
    return 1
}

print_status "🚀 Starting Atlas external services..."

# Create necessary directories
mkdir -p ./chroma_db ./meilisearch_db

# Start Ollama service
print_service "Starting Ollama..."
if ! check_service "http://localhost:11434/api/tags" "Ollama"; then
    if command -v ollama &> /dev/null; then
        # Start Ollama in background
        nohup ollama serve > /dev/null 2>&1 &
        wait_for_service "http://localhost:11434/api/tags" "Ollama"
        
        # Pull required models if not already present
        print_status "Checking for required Ollama models..."
        if ! ollama list | grep -q "qwen3:8b"; then
            print_status "Pulling qwen3:8b model (this may take a while)..."
            ollama pull qwen3:8b
        fi
    else
        print_error "Ollama is not installed. Please install it first."
        exit 1
    fi
fi

# Start ChromaDB
print_service "Starting ChromaDB..."
if ! check_service "http://localhost:8000/api/v1/heartbeat" "ChromaDB"; then
    if command -v chroma &> /dev/null; then
        # Start ChromaDB in background
        nohup chroma run --path ./chroma_db --port 8000 > /dev/null 2>&1 &
        wait_for_service "http://localhost:8000/api/v1/heartbeat" "ChromaDB"
    else
        print_error "ChromaDB is not installed. Please install it: pip3 install chromadb"
        exit 1
    fi
fi

# Start MeiliSearch
print_service "Starting MeiliSearch..."
if ! check_service "http://localhost:7700/health" "MeiliSearch"; then
    if command -v meilisearch &> /dev/null; then
        # Start MeiliSearch in background
        nohup meilisearch --db-path ./meilisearch_db --http-addr 127.0.0.1:7700 > /dev/null 2>&1 &
        wait_for_service "http://localhost:7700/health" "MeiliSearch"
    else
        print_error "MeiliSearch is not installed. Please install it first."
        exit 1
    fi
fi

print_status "✅ All services are running!"
echo ""
echo "🔍 Service Status:"
echo "   Ollama:      http://localhost:11434"
echo "   ChromaDB:    http://localhost:8000"
echo "   MeiliSearch: http://localhost:7700"
echo ""
echo "🚀 You can now start Atlas with: bun run dev"
echo ""
echo "🛑 To stop services later, run: ./stop-services-linux.sh"
