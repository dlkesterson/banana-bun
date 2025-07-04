---
sidebar_position: 6
---

# Project Structure

```
root
├─ src/            # application source code
├─ examples/       # example task definitions
├─ docs/           # additional markdown docs and images
├─ docs-site/      # Docusaurus documentation site
├─ scripts/        # helper scripts for setup and services
├─ test/           # unit and integration tests
```

The `src/` folder contains the main orchestrator, MCP servers and CLI implementations. Example tasks and documentation live outside of `src` so they can be browsed independently.
