---
sidebar_position: 4
---

# Task Types

Banana Bun tasks are defined in YAML files and executed by the orchestrator. Each task has a `type` field that determines how it is processed.

- `shell` – execute a shell command
- `tool` – call a built‑in tool or MCP method
- `llm` – generate or analyze text with a language model
- `batch` – run multiple tasks in sequence
- `media_*` – specialized media processing tasks (e.g. extract audio, generate thumbnails)
- `planner` – tasks created by the LLM planning service
- `code` – generate or review code snippets
- `youtube` – download and process YouTube videos

See the examples directory for sample task files covering every type.
