---
sidebar_position: 3
---

# API & WebSocket Endpoints

Banana Bun exposes internal APIs primarily via JSON‑RPC and WebSocket events.

## WebSocket Ports

- **Enhanced Task Processor WebSocket** – `ws://localhost:8081`
- **Monitor WebSocket** – `ws://localhost:8080`

Both send a `current_status` payload on connection and broadcast `status_update` messages whenever tasks change.

## JSON-RPC Interface

Each MCP server accepts requests of the form:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "<tool_name>", "arguments": { ... } } }
```

The available tools for each server are documented in the source under `src/mcp/`.
