# 🍌 Banana Bun

> *A bun-sized AI assistant for organizing your digital life.*

Banana Bun is a whimsical, developer-first project that uses **local AI models** to help users automatically **tag, organize, and search their media files** — audio, video, images, or docs — all while keeping privacy at the core. Built on Bun for speed and simplicity, it combines local LLMs, computer vision, and vector search into a single elegant pipeline.

## ✨ Features

| Capability | Description | Skills Demonstrated |
|------------|-------------|-------------------|
| 🖼 **Media Ingestion** | Folder watching with Bun for automation | File system APIs, event-driven architecture |
| 🔍 **Transcription** | Whisper-based audio transcription (local) | Python/FFmpeg integration, Whisper |
| 🧠 **AI Tagging** | CLIP / OpenL3 for visual/audio embedding + LLM for smart tags | Multimodal AI, embedding pipelines |
| 🗂 **Vector & Text Search** | ChromaDB + Meilisearch for hybrid search | Full-text and vector search engineering |
| 📚 **Semantic Archive** | Organizes by concept, date, or AI-extracted theme | Content enrichment + NLP workflows |
| 🔧 **CLI Tools** | Fully scriptable command line interface | Dev tool design and DX principles |
| 🛡 **Privacy-first** | No outbound data by default | Ethical dev and local-first focus |
| 🍞 **Bun-based Runtime** | Built on Bun for speed and simplicity | Early adoption of modern runtime tech |

## 🎯 Use Cases

### For Developers
- Keep a searchable archive of your coding livestreams or talks
- Auto-transcribe & tag tech podcasts and tutorials

### For Creatives
- Smart moodboard: auto-organize image & video inspiration
- Search your own video clips by "keywords that never existed"

### For Everyday Users
- Turn your digital hoard into a smart, searchable archive
- Keep private transcripts of family videos or interviews

## 🚀 Quick Start

### Prerequisites

- **Bun** runtime (latest version)
- **FFmpeg** for media processing
- **yt-dlp** for YouTube downloads (optional)
- **Local AI models** (Whisper, CLIP, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/banana-bun.git
cd banana-bun

# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Initialize the database
bun run migrate

# Start the system
bun run dev
```

### Basic Usage

```bash
# Ingest a media file
bun run media-ingest /path/to/your/video.mp4

# Search your media
bun run media-search "funny cat videos"
bun run media-search --semantic "emotional moments"

# Download and process YouTube content
bun run src/cli/download-media.ts --source youtube --url "https://youtube.com/watch?v=..."

# Organize your media library
bun run media-organize /path/to/media/folder
```

## 🛠 Architecture

Banana Bun follows a modular, task-based architecture:

- **Task Orchestrator**: Manages the processing pipeline
- **Media Processors**: Handle different file types (video, audio, images)
- **AI Services**: Local LLM and embedding generation
- **Search Engine**: Hybrid vector + text search
- **CLI Tools**: Developer-friendly command interface

## 📁 Project Structure

```
banana-bun/
├── src/
│   ├── cli/           # Command-line tools
│   ├── executors/     # Task processors
│   ├── services/      # Core services (AI, search, etc.)
│   ├── mcp/          # Model Context Protocol servers
│   └── utils/        # Utilities and helpers
├── docs/             # Documentation
├── test/             # Test suite
└── scripts/          # Setup and utility scripts
```

## 🔧 Configuration

Key configuration options in `.env`:

```bash
# Core paths
BASE_PATH=/path/to/banana-bun-data

# AI Services
OPENAI_API_KEY=your_key_here  # Optional, for enhanced features
OLLAMA_URL=http://localhost:11434

# Media processing
YTDLP_PATH=yt-dlp
FFPROBE_PATH=ffprobe

# Search engines
CHROMA_URL=http://localhost:8000
MEILISEARCH_URL=http://localhost:7700

# RSS feeds (optional)
RSS_ENABLED=true
RSS_FEEDS=https://example.com/podcast.xml
```

## 🧪 Development

```bash
# Run tests
bun test

# Watch mode for development
bun run dev

# Lint and validate
bun run lint-task
bun run check-consistency

# Generate documentation
bun run generate-docs
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Banana Bun is inspired by and builds upon the excellent work of:
- **Tagger** - Media tagging workflows
- **Transcription Stream** - Audio processing pipelines  
- **PhotoPrism** - Media organization concepts
- **Immich** - Self-hosted media management
- **OpenL3/CLIP** - Multimodal AI embeddings

## 🍌 Why "Banana Bun"?

Because organizing your digital life should be as delightful as a warm, sweet bun! 🥐✨

---

*Built with ❤️ using Bun, local AI, and a commitment to privacy-first development.*
