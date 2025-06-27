# Whisper MCP Server

The Whisper MCP (Model Context Protocol) Server enhances your Banana Bun transcription capabilities with intelligent optimization, quality learning, and performance analytics.

## 🚀 Features

### Smart Transcription
- **Model Selection**: Automatic model recommendation based on content type, duration, and quality requirements
- **Quality Assessment**: Real-time quality scoring and confidence metrics
- **Learning Integration**: Learns from transcription patterns to improve future results
- **Performance Optimization**: Tracks processing times and optimizes model selection

### Transcription Analytics
- **Usage Patterns**: Analyze transcription behavior and model performance
- **Quality Metrics**: Track accuracy, confidence, and error rates over time
- **Language Detection**: Monitor language detection accuracy and patterns
- **Performance Trends**: Identify optimization opportunities and quality improvements

### Model Optimization
- **Intelligent Recommendations**: Suggest optimal models based on file characteristics
- **Batch Processing**: Optimize settings for multiple file transcription
- **Quality vs Speed**: Balance transcription quality with processing time
- **Resource Management**: Optimize memory and CPU usage for different scenarios

### Quality Learning
- **User Feedback**: Collect and learn from transcription quality ratings
- **Error Detection**: Automatically identify common transcription issues
- **Improvement Suggestions**: Provide actionable recommendations for better results
- **Continuous Learning**: Improve recommendations based on usage patterns

## 🔧 Setup

### 1. Start the MCP Server

```bash
# Start the Whisper MCP server
bun run mcp:whisper
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

### 3. Test Smart Transcription

```bash
# Use the enhanced CLI
bun run smart-transcribe "audio.mp3"

# Get model recommendation
bun run smart-transcribe --recommend "audio.mp3"

# View analytics
bun run smart-transcribe --analytics
```

## 📊 Available Tools

### `smart_transcribe`
Perform intelligent transcription with model optimization and quality learning.

**Parameters:**
- `file_path` (required): Path to audio/video file to transcribe
- `model`: Whisper model to use (auto-selected if not specified)
- `language`: Language code or "auto" for detection
- `chunk_duration`: Chunk duration in seconds (default: 30)
- `quality_target`: Quality vs speed preference ('fast', 'balanced', 'high')
- `learn_from_result`: Store transcription for learning (default: true)
- `session_id`: Session ID for analytics

**Example:**
```typescript
const result = await mcpClient.smartTranscribe("audio.mp3", {
    qualityTarget: "high",
    language: "en",
    sessionId: "user_session_123"
});
```

### `get_model_recommendation`
Get optimal Whisper model recommendation for a file.

**Parameters:**
- `file_path` (required): Path to audio/video file
- `quality_target`: Quality vs speed preference ('fast', 'balanced', 'high')
- `content_type`: Type of audio content ('speech', 'music', 'mixed', 'noisy')
- `duration_seconds`: File duration in seconds

### `assess_transcription_quality`
Assess the quality of a transcription and provide improvement suggestions.

**Parameters:**
- `transcript_text` (required): Transcript text to assess
- `transcription_id`: ID of the transcription to assess
- `original_file_path`: Path to original audio/video file
- `include_suggestions`: Include improvement suggestions (default: true)

### `analyze_transcription_patterns`
Analyze transcription patterns and performance metrics.

**Parameters:**
- `time_range_hours`: Time range for analysis in hours (default: 24)
- `group_by`: Grouping method ('model', 'language', 'content_type', 'quality')
- `include_performance`: Include performance metrics (default: true)
- `include_quality_trends`: Include quality trend analysis (default: true)

### `optimize_batch_transcription`
Optimize settings for batch transcription of multiple files.

**Parameters:**
- `file_paths` (required): Array of file paths to transcribe
- `quality_target`: Quality vs speed preference ('fast', 'balanced', 'high')
- `max_parallel`: Maximum parallel transcriptions (default: 2)
- `analyze_only`: Only analyze, do not start transcription (default: false)

### `record_transcription_feedback`
Record user feedback on transcription quality for learning.

**Parameters:**
- `transcription_id` (required): ID of the transcription
- `user_rating` (required): Overall quality rating (1-5)
- `accuracy_rating`: Accuracy rating (1-5)
- `completeness_rating`: Completeness rating (1-5)
- `corrections_made`: List of corrections made
- `feedback_notes`: Additional feedback notes
- `improvement_suggestions`: Suggestions for improvement

### `get_transcription_analytics`
Get detailed transcription analytics and performance metrics.

**Parameters:**
- `time_range_hours`: Time range for analytics in hours (default: 24)
- `include_model_performance`: Include model performance comparison (default: true)
- `include_language_detection`: Include language detection analytics (default: true)
- `include_quality_metrics`: Include quality metrics (default: true)

## 🎯 Usage Examples

### Basic Smart Transcription
```bash
bun run smart-transcribe "interview.mp3"
```

### High Quality Transcription
```bash
bun run smart-transcribe --quality high "lecture.mp3"
```

### Get Model Recommendation
```bash
bun run smart-transcribe --recommend "podcast.mp3"
```

### Assess Transcript Quality
```bash
bun run smart-transcribe --assess "This is my transcript text to assess"
```

### View Analytics Dashboard
```bash
bun run smart-transcribe --analytics
```

### Analyze Transcription Patterns
```bash
bun run smart-transcribe --patterns
```

### Batch Transcription Optimization
```bash
bun run smart-transcribe --batch "media/"
```

### Provide Quality Feedback
```bash
bun run smart-transcribe --feedback "trans_123" --rating 4
```

## 📈 Learning & Optimization

### Model Selection
The server automatically selects optimal models by:
- **Content Analysis**: Analyzing file characteristics (duration, size, type)
- **Quality Requirements**: Balancing quality vs speed based on user preferences
- **Historical Performance**: Learning from past transcription results
- **Resource Constraints**: Considering available processing power and time

### Quality Assessment
The system evaluates transcription quality using:
- **Confidence Scoring**: Whisper's internal confidence metrics
- **Pattern Detection**: Identifying repeated phrases, gibberish, and other issues
- **Length Analysis**: Ensuring appropriate transcript length for content
- **Language Consistency**: Verifying language detection accuracy

### Performance Learning
The server learns from:
- **Processing Times**: Optimizing model selection for speed requirements
- **Quality Ratings**: User feedback on transcription accuracy and completeness
- **Error Patterns**: Common transcription mistakes and how to avoid them
- **Usage Patterns**: Most effective models for different content types

### Continuous Improvement
Based on analytics, the server can:
- **Recommend Better Models**: Suggest upgrades when quality is consistently low
- **Optimize Settings**: Adjust chunk duration and other parameters
- **Predict Performance**: Estimate processing time and quality before transcription
- **Identify Trends**: Track quality improvements over time

## 🔍 Analytics & Insights

### Transcription Metrics
- Total transcriptions and processing time
- Average quality scores and confidence levels
- Model usage patterns and effectiveness
- Language detection accuracy and trends

### Performance Analysis
- Processing time trends and bottlenecks
- Quality vs speed trade-offs by model
- Resource utilization and optimization opportunities
- Error rate analysis and improvement suggestions

### Usage Patterns
- Most transcribed content types and languages
- Peak usage times and batch processing patterns
- User feedback trends and satisfaction scores
- Model preference evolution over time

## 🛠️ Configuration

The MCP server is configured via `src/mcp/mcp-config.json`:

```json
{
  "settings": {
    "whisper": {
      "transcription_analytics_collection": "transcription_analytics",
      "quality_threshold": 0.8,
      "max_transcription_history": 500,
      "learning_enabled": true,
      "auto_optimize_models": true,
      "quality_assessment_enabled": true,
      "language_detection_learning": true,
      "performance_optimization": true
    }
  }
}
```

## 🔧 Troubleshooting

### Server Not Starting
```bash
# Check if Whisper is installed
whisper --help

# Check MCP server logs
bun run mcp:whisper
```

### Poor Transcription Quality
```bash
# Get model recommendation
bun run smart-transcribe --recommend "your-file.mp3"

# Assess current quality
bun run smart-transcribe --assess "your transcript text"
```

### Performance Issues
```bash
# View analytics for optimization opportunities
bun run smart-transcribe --analytics

# Analyze patterns for bottlenecks
bun run smart-transcribe --patterns
```

## 🚀 Integration with Existing Tools

The Whisper MCP server seamlessly integrates with your existing Banana Bun tools:

- **Media Ingestion**: Automatically transcribes new media with optimized settings
- **Task Processing**: Learns from transcription task patterns for better scheduling
- **Search Integration**: Provides high-quality transcripts for MeiliSearch indexing
- **ChromaDB Integration**: Stores transcription embeddings for semantic search

This creates a comprehensive, learning-enabled transcription system that gets smarter and more efficient with every use!
