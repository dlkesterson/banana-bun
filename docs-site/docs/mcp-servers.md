---
sidebar_position: 2
---

# MCP Servers

The Model Context Protocol (MCP) servers provide advanced AI capabilities via JSON‑RPC over `stdin/stdout`. They are launched automatically by the MCP manager when the main application starts.

## Available Servers

- **Whisper MCP** – transcription and audio quality tools
- **ChromaDB MCP** – vector search services
- **MeiliSearch MCP** – intelligent text search
- **Media Intelligence MCP** – cross‑modal analytics and recommendations
- **LLM Planning MCP** – generates optimized task plans
- **Monitor MCP** – exposes system metrics and live status
- **Metadata Optimization MCP** – improves metadata quality
- **Pattern Analysis MCP** – discovers usage patterns
- **Resource Optimization MCP** – predicts bottlenecks and load
- **Content Quality MCP** – assesses media quality
- **User Behavior MCP** – analyzes user interactions

Each server lives in `src/mcp/` and exposes a suite of JSON‑RPC tools under the `/tools/call` method.
