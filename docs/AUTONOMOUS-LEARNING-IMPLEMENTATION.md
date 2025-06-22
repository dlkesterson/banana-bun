# 🧠 Autonomous Learning and Optimization Implementation

This document describes the implementation of Atlas's autonomous learning and optimization features as specified in PRD Part 3.

## 📋 Overview

The autonomous learning system enables Atlas to gradually become smarter over time through:
- **Vector-based media similarity** using ChromaDB embeddings
- **Task performance analytics** and bottleneck detection
- **User feedback learning** from corrections and edits
- **Pattern recognition** and automated rule generation
- **Self-optimization** recommendations

## 🏗️ Architecture Components

### Core Services

#### 1. Media Embedding Service (`src/services/embedding-service.ts`)
- Generates vector embeddings for media content
- Stores embeddings in ChromaDB for similarity search
- Combines transcripts, tags, metadata for rich embeddings
- Supports semantic search and clustering

#### 2. Analytics Logger (`src/analytics/logger.ts`)
- Enhanced task execution metrics tracking
- Performance bottleneck detection
- Success rate and duration analytics
- Trend analysis over time

#### 3. Feedback Tracker (`src/feedback-tracker.ts`)
- Records user corrections and edits
- Analyzes patterns in user feedback
- Generates learning rules from patterns
- Applies rules to improve future predictions

#### 4. Autolearn Agent (`src/autolearn-agent.ts`)
- Autonomous learning insights generation
- Optimization recommendations
- Future: LLM-based planning and self-optimization

### Database Schema

#### New Tables Added (Migration 009)

```sql
-- Enhanced task execution logging
CREATE TABLE task_logs (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    retries INTEGER DEFAULT 0,
    error_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User feedback and corrections
CREATE TABLE user_feedback (
    id INTEGER PRIMARY KEY,
    media_id INTEGER NOT NULL,
    feedback_type TEXT NOT NULL, -- 'tag_correction', 'file_move', 'rating', 'metadata_edit'
    original_value TEXT,
    corrected_value TEXT,
    confidence_score REAL DEFAULT 1.0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'user'
);

-- Generated learning rules
CREATE TABLE learning_rules (
    id INTEGER PRIMARY KEY,
    rule_type TEXT NOT NULL, -- 'tag_mapping', 'genre_correction', 'metadata_enhancement'
    condition_text TEXT NOT NULL,
    action_text TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_from_feedback BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🛠️ CLI Tools

### Phase 1: Vector Embedding for Media

#### Generate Media Embeddings
```bash
# Generate embedding for specific media
bun run atlas-embed-media --media 123

# Generate embeddings for all unprocessed media
bun run atlas-embed-media --all

# Process in batches
bun run atlas-embed-media --all --batch 10

# Force regenerate all embeddings
bun run atlas-embed-media --all --force
```

#### Search Similar Media
```bash
# Find similar media by ID
bun run atlas-search-similar --media 456 --top 10

# Search by text query
bun run atlas-search-similar --query "action movie with robots"

# Find similar with clustering
bun run atlas-search-similar --media 123 --cluster

# Set similarity threshold
bun run atlas-search-similar --media 456 --threshold 0.3
```

### Phase 2: Analytics and Performance

#### Analyze Task Metrics
```bash
# Basic analytics for last 24 hours
bun run analyze-task-metrics

# Analyze last 48 hours
bun run analyze-task-metrics --hours 48

# Show trends for last 14 days
bun run analyze-task-metrics --trends --days 14

# Detect bottlenecks with 1-minute threshold
bun run analyze-task-metrics --bottlenecks --threshold 60000

# Clean up logs older than 30 days
bun run analyze-task-metrics --cleanup --keep-days 30
```

### Phase 3: Feedback Learning

#### Track User Corrections
```bash
# Correct tags for media
bun run track-tag-edits --media 123 --tags "Action, Sci-fi, Robot"

# Correct genre
bun run track-tag-edits --media 456 --genre "Science Fiction"

# Add rating
bun run track-tag-edits --media 789 --rating 4.5

# Multiple corrections with confidence
bun run track-tag-edits --media 123 --tags "Sci-fi, Drama" --genre "Science Fiction" --confidence 0.9
```

#### Run Feedback Loop Learning
```bash
# Full feedback loop analysis and rule generation
bun run run-feedback-loop

# Only analyze patterns with higher frequency threshold
bun run run-feedback-loop --analyze-only --min-frequency 5

# Apply existing rules to media
bun run run-feedback-loop --apply-rules

# Dry run to see what would happen
bun run run-feedback-loop --dry-run
```

## 📊 Usage Examples

### 1. Setting Up Media Embeddings

```bash
# First, ensure media has been ingested and processed
bun run media-ingest --file /path/to/media.mp4

# Generate transcripts and tags
bun run smart-transcribe --media 123
bun run media-tags --media 123

# Generate embeddings
bun run atlas-embed-media --media 123

# Search for similar content
bun run atlas-search-similar --media 123 --top 5
```

### 2. Monitoring System Performance

```bash
# Check current performance
bun run analyze-task-metrics

# Look for trends over the past week
bun run analyze-task-metrics --trends --days 7

# Identify bottlenecks
bun run analyze-task-metrics --bottlenecks
```

### 3. Learning from User Feedback

```bash
# User corrects some tags
bun run track-tag-edits --media 123 --tags "Sci-fi, Action, Robot"

# After collecting feedback, analyze patterns
bun run run-feedback-loop --analyze-only

# Generate and apply learning rules
bun run run-feedback-loop
```

## 🔄 Integration with Main System

### Automatic Analytics Logging

The task dispatcher (`src/executors/dispatcher.ts`) now automatically logs:
- Task start/completion times
- Duration metrics
- Error reasons and retry counts
- Success/failure rates

### Embedding Integration

Media embeddings are automatically generated during the indexing process:
- ChromaDB indexing tasks create embeddings
- Embeddings combine transcripts, tags, and metadata
- Similar media recommendations use embeddings

### Feedback Collection

User corrections can be tracked through:
- CLI tools for manual tracking
- Future: UI integration for automatic tracking
- API endpoints for programmatic feedback

## 🚀 Future Enhancements (Phase 4)

### LLM-Based Planning
- Analyze logs and metadata to suggest optimizations
- Generate recommendations for missing metadata
- Predict optimal task scheduling

### Rule Scheduler
- Detect periodic patterns in content
- Pre-schedule tasks based on patterns
- Optimize resource allocation

### Advanced Clustering
- Semantic clustering of media content
- Mood-based grouping
- Genre refinement based on content analysis

## 📈 Success Metrics

The implementation provides:

✅ **Media Clustering**: Semantic search and similarity detection  
✅ **Performance Analytics**: Task failure analysis and bottleneck detection  
✅ **User Feedback Learning**: Pattern recognition and rule generation  
✅ **Optimization Insights**: Automated recommendations for improvements  
✅ **Queryable Patterns**: CLI tools for analyzing system behavior  

## 🔧 Configuration

### ChromaDB Settings
```typescript
// config.ts
export const config = {
  paths: {
    chroma: {
      host: 'localhost',
      port: 8000,
      ssl: false
    }
  }
};
```

### Embedding Model
The system uses `qwen3:8b` by default for embeddings. This can be configured in:
- `src/services/embedding-service.ts`
- `src/memory/embeddings.ts`

### Analytics Retention
- Task logs: Configurable cleanup (default 30 days)
- User feedback: Permanent retention for learning
- Performance metrics: Aggregated daily summaries

## 🧪 Testing

Run the autonomous learning features:

```bash
# Run migrations to set up tables
bun run migrate

# Test embedding generation
bun run atlas-embed-media --media 1

# Test analytics
bun run analyze-task-metrics

# Test feedback tracking
bun run track-tag-edits --media 1 --tags "Test, Example"

# Test feedback loop
bun run run-feedback-loop --dry-run
```

## 📚 Related Documentation

- [PRD Part 3: Autonomous Learning](./prd-part3-2025-06-14.md)
- [Media Intelligence Implementation](./MEDIA-INTELLIGENCE-IMPLEMENTATION.md)
- [Phase 2 Implementation](./PHASE2-IMPLEMENTATION.md)
- [System Architecture](./system-diagram.mmd)
