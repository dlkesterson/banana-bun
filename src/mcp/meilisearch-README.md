# MeiliSearch MCP Server

The MeiliSearch MCP (Model Context Protocol) Server enhances your Atlas media search capabilities with intelligent optimization, learning, and analytics.

## 🚀 Features

### Smart Search
- **Query Optimization**: Automatic spell correction, synonym expansion, and query enhancement
- **Learning Integration**: Learns from search patterns to improve future results
- **Performance Tracking**: Real-time monitoring of search performance and results

### Search Analytics
- **Usage Patterns**: Analyze search behavior and identify trends
- **Performance Metrics**: Track processing times, success rates, and user satisfaction
- **Query Analysis**: Understand what users search for most frequently

### Index Optimization
- **Automatic Tuning**: Optimize searchable attributes based on usage patterns
- **Ranking Rules**: Adjust ranking rules for better relevance
- **Performance Improvements**: Identify and resolve performance bottlenecks

### User Experience
- **Search Suggestions**: Intelligent autocomplete based on search history
- **Filter Recommendations**: Suggest relevant filters based on query content
- **Feedback Loop**: Collect and learn from user feedback on search results

## 🔧 Setup

### 1. Start the MCP Server

```bash
# Start the MeiliSearch MCP server
bun run mcp:meilisearch
```

### 2. Verify Integration

The server is automatically integrated when you run:

```bash
bun run dev
```

Check the logs for:
```
✅ MCP Enhanced Task Processor initialized
```

### 3. Test the Smart Search

```bash
# Use the enhanced CLI
bun run src/cli/smart-media-search.ts "funny cat videos"

# Get search suggestions
bun run src/cli/smart-media-search.ts --suggestions "funny"

# View analytics
bun run src/cli/smart-media-search.ts --analytics
```

## 📊 Available Tools

### `smart_search`
Perform intelligent search with optimization and learning.

**Parameters:**
- `query` (required): Search query
- `filters`: MeiliSearch filter expression
- `limit`: Maximum results (default: 20)
- `optimize_query`: Apply query optimization (default: true)
- `learn_from_search`: Store search for learning (default: true)
- `session_id`: Session ID for analytics

**Example:**
```typescript
const result = await mcpClient.smartSearch("funny cats", {
    filters: "guessed_type = 'video'",
    limit: 10,
    sessionId: "user_session_123"
});
```

### `get_search_suggestions`
Get query suggestions based on search history.

**Parameters:**
- `partial_query` (required): Partial query for suggestions
- `limit`: Maximum suggestions (default: 5)
- `include_filters`: Include filter suggestions (default: true)

### `analyze_search_patterns`
Analyze search patterns and provide insights.

**Parameters:**
- `time_range_hours`: Time range for analysis (default: 24)
- `include_performance`: Include performance metrics (default: true)
- `group_by`: Grouping method ('query_type', 'time_period', 'user_session')

### `optimize_index`
Optimize MeiliSearch index based on usage patterns.

**Parameters:**
- `analyze_only`: Only analyze, don't apply changes (default: false)
- `focus_area`: Specific area to optimize ('searchable_attributes', 'ranking_rules')

### `get_search_analytics`
Get detailed search analytics and metrics.

**Parameters:**
- `time_range_hours`: Time range for analytics (default: 24)
- `include_failed_searches`: Include searches with no results (default: true)
- `group_by_time`: Time grouping ('hour', 'day', 'week')

### `record_search_feedback`
Record user feedback on search results.

**Parameters:**
- `search_id` (required): ID of the search to provide feedback for
- `clicked_results`: Array of clicked result IDs
- `satisfaction_rating`: User satisfaction rating (1-5)
- `feedback_notes`: Additional feedback notes

## 🎯 Usage Examples

### Basic Smart Search
```bash
bun run src/cli/smart-media-search.ts "cooking videos"
```

### Search with Filters
```bash
bun run src/cli/smart-media-search.ts "music" --filter "duration > 180"
```

### Get Search Suggestions
```bash
bun run src/cli/smart-media-search.ts --suggestions "cook"
```

### View Analytics Dashboard
```bash
bun run src/cli/smart-media-search.ts --analytics
```

### Analyze Search Patterns
```bash
bun run src/cli/smart-media-search.ts --patterns
```

### Optimize Search Index
```bash
bun run src/cli/smart-media-search.ts --optimize-index
```

### Provide Search Feedback
```bash
bun run src/cli/smart-media-search.ts --feedback "search_123" --rating 4
```

## 📈 Learning & Optimization

### Query Optimization
The server automatically optimizes queries by:
- **Spell Correction**: Fixes common typos (e.g., "vidoe" → "video")
- **Synonym Expansion**: Adds related terms (e.g., "funny" → "funny OR comedy OR humorous")
- **Filter Suggestions**: Recommends relevant filters based on query content

### Performance Learning
The system learns from:
- **Search Frequency**: Popular queries get priority optimization
- **Result Relevance**: User clicks and feedback improve ranking
- **Performance Issues**: Slow queries trigger optimization recommendations

### Index Optimization
Based on usage patterns, the server can:
- **Reorder Searchable Attributes**: Put frequently searched fields first
- **Adjust Ranking Rules**: Optimize for your specific content and usage
- **Suggest Configuration Changes**: Recommend MeiliSearch settings improvements

## 🔍 Analytics & Insights

### Search Metrics
- Total searches and success rates
- Average processing times and performance percentiles
- Most popular queries and search patterns
- Zero-result queries for content gap analysis

### Usage Patterns
- Search types (media, content, metadata searches)
- Time-based patterns (hourly, daily usage)
- User session analysis and behavior tracking

### Performance Monitoring
- Processing time trends and bottlenecks
- Index size and optimization opportunities
- Query complexity analysis and recommendations

## 🛠️ Configuration

The MCP server is configured via `src/mcp/mcp-config.json`:

```json
{
  "settings": {
    "meilisearch": {
      "index_name": "media_index",
      "search_analytics_collection": "search_analytics",
      "query_optimization_threshold": 0.8,
      "max_search_history": 1000,
      "learning_enabled": true,
      "auto_optimize_queries": true
    }
  }
}
```

## 🔧 Troubleshooting

### Server Not Starting
```bash
# Check if MeiliSearch is running
curl http://127.0.0.1:7700/health

# Check MCP server logs
bun run mcp:meilisearch
```

### No Search Results
```bash
# Verify index exists and has documents
bun run src/cli/smart-media-search.ts --analytics
```

### Performance Issues
```bash
# Run index optimization
bun run src/cli/smart-media-search.ts --optimize-index
```

## 🚀 Integration with Existing Tools

The MeiliSearch MCP server seamlessly integrates with your existing Atlas tools:

- **Media Ingestion**: Automatically indexes new media with optimized settings
- **Search CLI**: Enhanced with smart features and learning capabilities  
- **Task Processing**: Learns from media processing patterns for better recommendations
- **ChromaDB Integration**: Combines semantic and keyword search for best results

This creates a comprehensive, learning-enabled search system that gets smarter with every use!
