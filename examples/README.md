# 🍌 Banana Bun Example Task Library

This directory contains a comprehensive collection of example task files that demonstrate all the capabilities of Banana Bun. These examples showcase different task types, tools, MCP server integrations, and real-world use cases.

## 📁 Directory Structure

### `/basic-tasks/`
Simple, single-purpose tasks that demonstrate core functionality:
- **File Operations**: Reading, writing, and managing files
- **Shell Commands**: System operations and script execution
- **AI Text Processing**: LLM-powered content generation and analysis

### `/media-processing/`
Complete media processing workflows:
- **Ingestion**: Adding media files to the library
- **Transcription**: Audio/video to text conversion
- **Tagging**: AI-powered content categorization
- **Organization**: Automated file organization
- **Quality Analysis**: Content quality assessment

### `/automation/`
Scheduled and automated tasks:
- **Backup Operations**: S3 sync and file backups
- **Content Downloads**: YouTube and media downloading
- **System Maintenance**: Cleanup and optimization tasks
- **Monitoring**: Health checks and alerts

### `/ai-powered/`
Advanced AI-driven workflows:
- **Content Analysis**: Cross-modal intelligence and insights
- **Planning**: Multi-step task generation
- **Recommendations**: Personalized content suggestions
- **Pattern Detection**: Usage pattern analysis

### `/batch-operations/`
Complex multi-task workflows:
- **Parallel Processing**: Concurrent task execution
- **Sequential Workflows**: Dependent task chains
- **Conditional Logic**: Dynamic task generation
- **Resource Management**: Load balancing and optimization

### `/monitoring/`
System monitoring and analytics:
- **Performance Tracking**: Task metrics and bottlenecks
- **Quality Monitoring**: Content and metadata quality
- **User Behavior**: Privacy-aware usage analytics
- **Resource Optimization**: System performance tuning

### `/advanced-workflows/`
Complex real-world scenarios:
- **Content Pipeline**: End-to-end media processing
- **Learning Systems**: Feedback-driven improvements
- **Integration Examples**: External service connections
- **Custom Executors**: Specialized task types

## 🚀 Getting Started

### Running Examples

1. **Single Task**: Copy any `.json` or `.md` file to your watched directory
2. **Batch Tasks**: Use the batch task examples for multiple operations
3. **Scheduled Tasks**: Examples include cron schedules for automation

### Task File Formats

#### JSON Format
```json
{
  "id": "example-task",
  "type": "shell",
  "description": "Example shell command",
  "shell_command": "echo 'Hello World'",
  "metadata": {
    "tags": ["example", "basic"],
    "priority": "normal"
  }
}
```

#### Markdown Format
```markdown
---
id: example-task
type: llm
description: "Generate a summary"
context: "Summarize the following content..."
metadata:
  tags: ['ai', 'summary']
  priority: 'high'
---

Additional context and documentation can go here.
```

## 🛠 Task Types Reference

### Core Task Types
- **`shell`**: Execute system commands
- **`llm`**: AI text generation and analysis
- **`planner`**: Multi-step planning with AI
- **`code`**: Code generation and analysis
- **`review`**: Quality assurance and validation
- **`run_code`**: Execute generated or provided code
- **`batch`**: Orchestrate multiple tasks
- **`tool`**: Use built-in tools and utilities

### Media Task Types
- **`youtube`**: Download and process YouTube content
- **`media_ingest`**: Add media files to library
- **`media_organize`**: Organize and categorize media
- **`media_transcribe`**: Audio/video transcription
- **`media_tag`**: AI-powered content tagging
- **`media_summarize`**: Generate content summaries
- **`media_recommend`**: Content recommendations
- **`video_scene_detect`**: Scene detection in videos
- **`video_object_detect`**: Object detection in video frames
- **`audio_analyze`**: Audio feature analysis
- **`media_download`**: Download media from various sources
- **`index_meili`**: Index content in MeiliSearch
- **`index_chroma`**: Index embeddings in ChromaDB

## 🔧 Available Tools

### File Operations
- **`read_file`**: Read file contents
- **`write_file`**: Write content to file
- **`rename_item`**: Rename files and directories

### Media & Content
- **`yt_watch`**: Monitor YouTube channels
- **`yt_download`**: Download YouTube videos
- **`s3_sync`**: Sync files with S3 storage

### AI & Analysis
- **`ollama_chat`**: Chat with local LLM
- **`generate_code`**: AI code generation
- **`summarize_file`**: Summarize file contents
- **`review_output`**: Review task outputs
- **`review_code`**: Code quality review
- **`review_text`**: Text content review

### System Operations
- **`run_script`**: Execute custom scripts
- **`create_task`**: Generate new tasks

## 🤖 MCP Server Tools

### Whisper MCP (Audio/Transcription)
- `smart_transcribe`: Optimized transcription
- `get_model_recommendation`: Model selection
- `assess_transcription_quality`: Quality evaluation
- `analyze_transcription_patterns`: Usage analytics

### ChromaDB MCP (Vector Search)
- `find_similar_tasks`: Semantic task search
- Vector similarity operations

### MeiliSearch MCP (Text Search)
- `smart_search`: Intelligent text search
- Search optimization and learning

### Media Intelligence MCP
- `analyze_content_discovery`: User behavior analysis
- `generate_cross_modal_insights`: Multi-modal correlations
- `optimize_content_tagging`: Tag optimization
- `generate_content_recommendations`: AI recommendations
- `enhance_semantic_search`: Query enhancement
- `track_user_behavior`: Interaction logging

### LLM Planning MCP
- `generate_optimized_plan`: Multi-step task planning

### Monitor MCP
- `get_task_status`: Task monitoring
- `get_system_metrics`: Performance metrics
- `setup_notification`: Alert configuration
- `broadcast_status_update`: Real-time updates

### Advanced MCP Servers
- **Metadata Optimization**: Quality analysis and enhancement
- **Pattern Analysis**: Usage pattern detection
- **Resource Optimization**: Performance tuning
- **Content Quality**: Media quality assessment
- **User Behavior**: Privacy-aware analytics

## 📊 Example Categories

### By Complexity
- **Beginner**: Single-task operations
- **Intermediate**: Multi-step workflows
- **Advanced**: Complex orchestration with dependencies

### By Use Case
- **Content Creation**: AI-powered content generation
- **Media Management**: Complete media processing pipelines
- **System Administration**: Automation and maintenance
- **Analytics**: Data analysis and insights
- **Integration**: External service connections

### By Schedule
- **One-time**: Manual execution
- **Scheduled**: Cron-based automation
- **Event-driven**: Triggered by file changes or conditions

## 🔍 Finding Examples

Use the following tags to find specific types of examples:
- `#basic` - Simple, single-purpose tasks
- `#media` - Media processing workflows
- `#ai` - AI-powered operations
- `#automation` - Scheduled and automated tasks
- `#batch` - Multi-task operations
- `#monitoring` - System monitoring and analytics
- `#advanced` - Complex workflows and integrations

## 💡 Tips for Using Examples

1. **Start Simple**: Begin with basic tasks to understand the system
2. **Customize**: Modify examples to fit your specific needs
3. **Combine**: Use batch tasks to combine multiple operations
4. **Schedule**: Add cron schedules for automation
5. **Monitor**: Use monitoring examples to track performance
6. **Learn**: Study advanced examples for complex workflows

## 🤝 Contributing

To add new examples:
1. Follow the existing directory structure
2. Include comprehensive metadata and tags
3. Add clear descriptions and documentation
4. Test examples before submitting
5. Update this README with new categories or tools

---

*For more information about Banana Bun, see the main [README.md](../README.md) in the project root.*
