#!/bin/bash

# Banana Bun Linux Services Stop Script
# This script stops all Banana Bun external services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

print_status "🛑 Stopping Banana Bun external services..."

# Stop MeiliSearch
print_status "Stopping MeiliSearch..."
pkill -f "meilisearch" || print_warning "MeiliSearch was not running"

# Stop ChromaDB
print_status "Stopping ChromaDB..."
pkill -f "chroma run" || print_warning "ChromaDB was not running"

# Stop Ollama (optional - you might want to keep it running)
read -p "Stop Ollama service? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Stopping Ollama..."
    pkill -f "ollama serve" || print_warning "Ollama was not running"
else
    print_status "Keeping Ollama running..."
fi

print_status "✅ Services stopped!"
echo ""
echo "💡 Note: You can restart services with: ./start-services-linux.sh"
