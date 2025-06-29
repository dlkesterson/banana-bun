---
sidebar_position: 1
---

# Getting Started with Banana Bun

Welcome to **Banana Bun** - a privacy-first, local AI-powered media organization system that helps you automatically tag, organize, and search your media files using cutting-edge AI models.

## What is Banana Bun?

Banana Bun combines local LLMs, computer vision, and vector search into a single elegant pipeline that:

- **Automatically organizes** your audio, video, images, and documents
- **Preserves privacy** by running entirely on your local machine
- **Learns from usage** to improve organization and recommendations over time
- **Provides intelligent search** across all your content using semantic understanding

## Key Features

### 🤖 AI-Powered Intelligence
- **11 specialized MCP servers** with 25+ AI tools
- **Local LLM integration** via Ollama for text processing
- **Computer vision** for object and scene detection
- **Audio analysis** and transcription with Whisper

### 🔍 Advanced Search Capabilities
- **Vector search** with ChromaDB for semantic similarity
- **Full-text search** with MeiliSearch for fast text queries
- **Cross-modal search** that understands relationships between different media types

### 🛡️ Privacy-First Design
- **100% local processing** - no data leaves your machine
- **No cloud dependencies** for core functionality
- **Open source** and transparent

### 📁 Intelligent Organization
- **Automatic tagging** based on content analysis
- **Smart categorization** using AI understanding
- **Metadata optimization** for better discoverability
- **Pattern recognition** to learn your preferences

## Quick Start

### Prerequisites

- **Bun** runtime (latest version)
- **Python** 3.8+ (for AI services)
- **Git** (for cloning)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/dlkesterson/banana-bun.git
   cd banana-bun
   ```

2. **Run the setup script:**
   ```bash
   # Automatic platform detection
   npm run setup
   ```

3. **Start the development server:**
   ```bash
   npm run dev:with-services
   ```

This will automatically start all required services (Ollama, ChromaDB, MeiliSearch) and begin watching for task files.

## What's Next?

- Learn about [CLI Commands](./cli-commands) for direct control
- Explore [MCP Servers](./mcp-servers) for AI-powered automation
- Check out [Example Task Files](./example-task-files) to see what's possible
- Understand the [Project Structure](./project-structure) to customize your setup
