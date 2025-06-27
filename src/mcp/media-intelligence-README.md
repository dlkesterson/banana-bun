# Media Intelligence MCP Server

The Media Intelligence MCP Server is the crown jewel of your Banana Bun media processing system, combining the power of MeiliSearch and Whisper MCP servers with advanced AI-powered insights and cross-modal learning capabilities.

## 🧠 What is Media Intelligence?

Media Intelligence goes beyond simple search and transcription by creating a learning system that:

- **Understands User Behavior**: Learns from how users search, discover, and interact with content
- **Connects the Dots**: Finds correlations between search patterns, transcription quality, and tagging effectiveness
- **Optimizes Automatically**: Continuously improves content discoverability and user satisfaction
- **Predicts and Recommends**: Uses AI to suggest content optimizations and predict user preferences

## 🚀 Key Features

### 🔍 Content Discovery Intelligence
- **Pattern Recognition**: Analyzes how users find and interact with content
- **Search Behavior Learning**: Understands what makes searches successful
- **Discovery Path Optimization**: Improves content navigation and findability
- **Satisfaction Tracking**: Measures and improves user content satisfaction

### 🔗 Cross-Modal Correlation Analysis
- **Search-Transcript Alignment**: Ensures search queries match transcript content
- **Tag-Content Consistency**: Verifies tags accurately represent content
- **Quality Correlation**: Links transcription quality to search effectiveness
- **Performance Bottleneck Detection**: Identifies weak points in the content pipeline

### 🏷️ AI-Powered Tagging Optimization
- **Smart Tag Suggestions**: AI-generated tags based on content and user behavior
- **User Feedback Integration**: Learns from manual tag corrections
- **Search-Driven Tagging**: Optimizes tags for better search discoverability
- **A/B Testing**: Tests tag effectiveness with real user interactions

### 🧠 Semantic Search Enhancement
- **Query Expansion**: Automatically enhances search queries with related terms
- **Concept Mapping**: Understands relationships between different concepts
- **User Pattern Learning**: Adapts search enhancement based on user behavior
- **Context-Aware Results**: Provides more relevant search results

### 📊 Intelligence Dashboard
- **Comprehensive Analytics**: Deep insights into content performance and user behavior
- **Trend Analysis**: Identifies patterns and trends over time
- **Performance Metrics**: Tracks key indicators of content effectiveness
- **Optimization Opportunities**: AI-identified areas for improvement

## 🛠️ Setup and Configuration

### 1. Start the MCP Server

```bash
# Start the Media Intelligence MCP server
bun run mcp:intelligence
```

### 2. Verify Integration

The server integrates automatically when you run:

```bash
bun run dev
```

Look for the initialization message:
```
✅ Media Intelligence MCP server running on stdio
```

### 3. Test Intelligence Features

```bash
# Show comprehensive dashboard
bun run media-intelligence --dashboard

# Analyze content discovery patterns
bun run media-intelligence --discovery-analysis

# Get cross-modal insights for specific media
bun run media-intelligence --cross-modal --media-id 123
```

## 📊 Available Tools

### `analyze_content_discovery`
Analyze how users discover and interact with content.

**Parameters:**
- `time_range_hours`: Analysis time window (default: 24)
- `user_session_id`: Specific user session to analyze
- `include_recommendations`: Include AI recommendations (default: true)
- `discovery_threshold`: Minimum satisfaction threshold (default: 0.7)

### `generate_cross_modal_insights`
Generate insights from correlations between search, transcription, and tagging.

**Parameters:**
- `media_id`: Specific media to analyze
- `correlation_threshold`: Minimum correlation strength (default: 0.6)
- `include_optimization_suggestions`: Include optimization advice (default: true)
- `analysis_depth`: Level of analysis ('basic', 'detailed', 'comprehensive')

### `optimize_content_tagging`
Optimize content tags based on search effectiveness and user behavior.

**Parameters:**
- `media_id`: Media to optimize tags for
- `optimization_strategy`: Strategy type ('search_driven', 'user_behavior', 'ai_enhanced', 'hybrid')
- `test_mode`: Run in A/B test mode (default: false)
- `confidence_threshold`: Minimum confidence for changes (default: 0.8)

### `generate_content_recommendations`
Generate AI-powered content recommendations.

**Parameters:**
- `user_session_id`: User session for personalization
- `source_media_id`: Source media for similarity recommendations
- `recommendation_type`: Type of recommendations ('similar_content', 'trending', 'personalized', 'cross_modal')
- `max_recommendations`: Maximum number of recommendations (default: 10)
- `include_reasoning`: Include AI reasoning (default: true)

### `enhance_semantic_search`
Enhance search queries using semantic analysis and user patterns.

**Parameters:**
- `query`: Search query to enhance
- `content_text`: Content text to enhance
- `enhancement_type`: Enhancement method ('query_expansion', 'keyword_extraction', 'concept_mapping', 'semantic_enrichment')
- `use_user_patterns`: Use user behavior patterns (default: true)
- `cache_result`: Cache enhancement result (default: true)

### `track_user_behavior`
Track and analyze user behavior for learning and optimization.

**Parameters:**
- `behavior_type`: Type of behavior ('search', 'transcribe', 'tag', 'view', 'feedback')
- `user_session_id`: User session identifier
- `action_details`: Detailed action data
- `media_id`: Related media ID
- `interaction_quality`: Quality/satisfaction score (0-1)
- `context_data`: Additional context information

### `get_intelligence_dashboard`
Get comprehensive media intelligence dashboard with insights and metrics.

**Parameters:**
- `time_range_hours`: Time range for dashboard data (default: 168)
- `include_trends`: Include trend analysis (default: true)
- `include_predictions`: Include AI predictions (default: true)
- `include_optimization_opportunities`: Include optimization suggestions (default: true)
- `detail_level`: Dashboard detail level ('summary', 'detailed', 'comprehensive')

### `correlate_search_transcription`
Analyze correlations between search patterns and transcription quality.

**Parameters:**
- `search_query`: Search query to analyze
- `transcription_id`: Transcription ID to correlate
- `media_id`: Media ID for correlation analysis
- `update_correlations`: Update correlation database (default: true)
- `generate_insights`: Generate AI insights (default: true)

## 🎯 Usage Examples

### Intelligence Dashboard
```bash
# Show comprehensive dashboard
bun run media-intelligence --dashboard

# Dashboard for specific time range
bun run media-intelligence --dashboard --time-range 72
```

### Content Discovery Analysis
```bash
# Analyze discovery patterns
bun run media-intelligence --discovery-analysis

# Analyze specific user session
bun run media-intelligence --discovery-analysis --session-id "user_123"

# Analyze last 24 hours
bun run media-intelligence --discovery-analysis --time-range 24
```

### Cross-Modal Insights
```bash
# Get insights for specific media
bun run media-intelligence --cross-modal --media-id 123

# Comprehensive analysis
bun run media-intelligence --cross-modal --media-id 123 --analysis-depth comprehensive
```

### Tagging Optimization
```bash
# Optimize tags with hybrid strategy
bun run media-intelligence --optimize-tags --media-id 123 --strategy hybrid

# Search-driven optimization
bun run media-intelligence --optimize-tags --media-id 123 --strategy search_driven
```

### Semantic Search Enhancement
```bash
# Enhance search query
bun run media-intelligence --enhance-search "cooking tutorial"

# Enhance with specific content
bun run media-intelligence --enhance-search "music performance"
```

## 🔬 How It Works

### Learning Pipeline

1. **Data Collection**: Continuously collects user interaction data
2. **Pattern Recognition**: AI identifies patterns in user behavior
3. **Correlation Analysis**: Finds relationships between different data modalities
4. **Optimization**: Automatically improves content discoverability
5. **Feedback Loop**: Learns from optimization results to improve further

### Cross-Modal Intelligence

The system creates connections between:
- **Search Queries** ↔ **Transcript Content** ↔ **Content Tags**
- **User Behavior** ↔ **Content Quality** ↔ **Satisfaction Scores**
- **Discovery Patterns** ↔ **Content Types** ↔ **Engagement Metrics**

### AI-Powered Insights

- **Content Analysis**: Understands what makes content discoverable and engaging
- **User Pattern Recognition**: Learns individual and collective user preferences
- **Trend Detection**: Identifies emerging patterns and content trends
- **Predictive Modeling**: Forecasts content performance and user satisfaction

## 📈 Benefits

### For Content Creators
- **Better Discoverability**: Optimized tags and descriptions for better search results
- **Content Insights**: Understanding of what content performs best
- **Trend Awareness**: Knowledge of emerging content trends and user preferences

### For Users
- **Improved Search**: More relevant and accurate search results
- **Better Recommendations**: Personalized content suggestions
- **Faster Discovery**: Optimized content navigation and findability

### For System Administrators
- **Performance Monitoring**: Comprehensive analytics on system effectiveness
- **Optimization Opportunities**: Clear guidance on where to improve
- **Automated Learning**: Self-improving system that gets better over time

## 🔧 Configuration

The Media Intelligence server is configured via `src/mcp/mcp-config.json`:

```json
{
  "settings": {
    "media_intelligence": {
      "cross_modal_learning_enabled": true,
      "content_discovery_threshold": 0.7,
      "tagging_optimization_enabled": true,
      "semantic_enhancement_enabled": true,
      "pattern_analysis_window_hours": 168,
      "recommendation_cache_size": 1000,
      "ai_insights_enabled": true,
      "user_behavior_tracking": true,
      "content_correlation_threshold": 0.6,
      "learning_rate": 0.1
    }
  }
}
```

## 🚀 Integration with Banana Bun Ecosystem

The Media Intelligence MCP server seamlessly integrates with:

- **MeiliSearch MCP**: Enhanced search analytics and optimization
- **Whisper MCP**: Transcription quality correlation and optimization
- **ChromaDB**: Semantic embeddings and similarity analysis
- **Task Processing**: Intelligent task scheduling and optimization
- **Media Ingestion**: Automatic content optimization during ingestion

This creates a comprehensive, self-improving media intelligence system that continuously learns and optimizes your entire media collection for maximum discoverability and user satisfaction.

## 🎉 The Future of Media Intelligence

With the Media Intelligence MCP server, your Banana Bun system becomes more than just a media processor—it becomes an intelligent content curator that:

- **Learns** from every user interaction
- **Adapts** to changing content and user preferences
- **Optimizes** automatically for better performance
- **Predicts** future content needs and trends
- **Recommends** improvements and optimizations

This is the next evolution of media management: intelligent, adaptive, and continuously improving!
