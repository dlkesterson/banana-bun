# MCP Servers for Folder Watcher

This directory contains Model Context Protocol (MCP) servers that enhance your AI task orchestration system with advanced ChromaDB operations and real-time monitoring capabilities.

## 🚀 Overview

### ChromaDB MCP Server
Provides enhanced vector database operations for learning from past tasks and improving future task execution.

### Monitor MCP Server  
Offers real-time task monitoring, notifications, and system metrics with WebSocket-based live dashboard.

## 📦 Installation

Dependencies are already added to your `package.json`. Install them with:

```bash
bun install
```

## 🔧 Configuration

The MCP servers are configured via `mcp-config.json`. Key settings:

- **ChromaDB**: Collection name, embedding model, similarity thresholds
- **Monitor**: WebSocket port, notification types, metrics intervals

## 🚀 Quick Start

### 1. Start MCP Servers Manually

```bash
# Start ChromaDB MCP Server
bun run mcp:chromadb

# Start Monitor MCP Server (in another terminal)
bun run mcp:monitor
```

### 2. Integrate with Your Main Application

```typescript
import { mcpManager } from './src/mcp/mcp-manager.js';

// Initialize MCP servers
await mcpManager.initialize();

// Use enhanced task processing
const processedTask = await mcpManager.processTaskWithMCP(task);

// Complete task with MCP integration
await mcpManager.completeTaskWithMCP(task, result);
```

### 3. Access Live Dashboard

Open `src/mcp/live-dashboard.html` in your browser to see real-time task monitoring.

## 🛠 Available Tools

### ChromaDB MCP Server Tools

#### `find_similar_tasks`
Find tasks similar to a query using vector similarity search.

```json
{
  "query": "process video file",
  "limit": 5,
  "status_filter": "completed",
  "type_filter": "tool"
}
```

#### `analyze_task_patterns`
Analyze patterns in completed tasks for insights.

```json
{
  "task_type": "llm",
  "time_range_days": 30
}
```

#### `get_task_recommendations`
Get recommendations for improving task execution.

```json
{
  "current_task_description": "Generate summary of document",
  "task_type": "llm"
}
```

#### `batch_add_embeddings`
Add multiple task embeddings efficiently.

```json
{
  "tasks": [
    {
      "id": "task-123",
      "taskId": 123,
      "description": "Task description",
      "type": "tool",
      "status": "completed",
      "result": {...},
      "metadata": {...}
    }
  ]
}
```

#### `search_by_metadata`
Search tasks by metadata with optional similarity scoring.

```json
{
  "metadata_filters": {
    "type": "llm",
    "status": "completed"
  },
  "similarity_query": "text processing",
  "limit": 10
}
```

### Monitor MCP Server Tools

#### `get_task_status`
Get current status of tasks.

```json
{
  "task_id": 123,
  "status_filter": "running",
  "limit": 50
}
```

#### `get_task_progress`
Get detailed progress for running tasks.

```json
{
  "include_logs": true,
  "log_lines": 20
}
```

#### `setup_notification`
Configure notifications for task status changes.

```json
{
  "type": "webhook",
  "endpoint": "https://your-webhook-url.com/notify",
  "enabled": true
}
```

#### `send_notification`
Send notification about task status change.

```json
{
  "task_id": 123,
  "status": "completed",
  "message": "Task completed successfully",
  "details": {...}
}
```

#### `get_system_metrics`
Get system performance metrics.

```json
{
  "time_range_hours": 24
}
```

#### `broadcast_status_update`
Broadcast status update to WebSocket clients.

```json
{
  "task_id": 123,
  "status": "running",
  "details": {...}
}
```

## 🔗 Integration Examples

### Enhanced Task Processing

```typescript
// Before processing a task
const recommendations = await mcpManager.getTaskRecommendations(task);
console.log('Recommendations:', recommendations);

// Find similar successful tasks
const similarTasks = await mcpManager.findSimilarTasks(
  task.description,
  { statusFilter: 'completed', limit: 3 }
);

// Process task with MCP integration
await mcpManager.processTaskWithMCP(task);
```

### Real-time Monitoring

```typescript
// Setup webhook notifications
await mcpManager.setupWebhookNotification('https://your-app.com/webhook');

// Get live dashboard info
const dashboardInfo = await mcpManager.getLiveDashboardInfo();
console.log('WebSocket URL:', dashboardInfo.websocketUrl);

// Get system metrics
const metrics = await mcpManager.getSystemMetrics(24);
console.log('System health:', metrics.system_health);
```

### Pattern Analysis

```typescript
// Analyze patterns for specific task type
const patterns = await mcpManager.analyzeTaskPatterns('llm', 30);
console.log('Success rate:', patterns.success_rate);
console.log('Common errors:', patterns.common_errors);

// Find tasks with specific metadata
const results = await mcpClient.searchByMetadata({
  metadata_filters: { priority: 'high' },
  similarity_query: 'urgent processing',
  limit: 10
});
```

## 🌐 Live Dashboard

The live dashboard (`live-dashboard.html`) provides:

- **Real-time task status updates** via WebSocket
- **System metrics** (total, completed, running, failed tasks)
- **Live activity feed** with timestamps
- **Task table** with status, duration, and details
- **Connection status** with auto-reconnect

### WebSocket Message Types

#### `current_status`
Initial status when connecting:
```json
{
  "type": "current_status",
  "data": {
    "tasks": [...],
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

#### `status_update`
Real-time status updates:
```json
{
  "type": "status_update",
  "data": {
    "taskId": 123,
    "status": "completed",
    "timestamp": "2024-01-01T12:00:00Z",
    "details": {...}
  }
}
```

## 🔧 Troubleshooting

### Common Issues

1. **MCP Server won't start**
   - Check if ports are available (8080 for WebSocket)
   - Verify ChromaDB is running
   - Check logs for specific error messages

2. **WebSocket connection fails**
   - Ensure Monitor MCP Server is running
   - Check firewall settings for port 8080
   - Verify WebSocket URL in dashboard

3. **Embeddings not working**
   - Verify ChromaDB server is accessible
   - Check Ollama is running for embedding generation
   - Review ChromaDB collection configuration

### Logs

MCP servers log to stderr, which is captured by the MCP client. Check your application logs for MCP-related messages.

## 🚀 Next Steps

1. **Integrate with main application**: Update your task processor to use `mcpManager`
2. **Configure notifications**: Set up webhooks for external integrations
3. **Customize dashboard**: Modify `live-dashboard.html` for your needs
4. **Add more tools**: Extend MCP servers with additional functionality

## 📚 Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
