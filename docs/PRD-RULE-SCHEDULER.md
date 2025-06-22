# ⏱️ Product Requirements: Rule Scheduler System

## 📋 Overview

This PRD outlines the development of an intelligent Rule Scheduler System for Banana Bun that automatically detects temporal patterns in content and system behavior, creating and managing rules for task scheduling based on these patterns. This system will reduce manual scheduling, optimize resource usage, and improve system responsiveness through predictive scheduling.

## 🎯 Goals

1. **Automate Scheduling**: Reduce manual scheduling tasks by 60%
2. **Optimize Resource Usage**: Balance task load to prevent resource contention
3. **Improve System Responsiveness**: Implement predictive scheduling for anticipated needs
4. **Enhance User Experience**: Reduce wait times for common operations by 50%

## 🏗️ Feature Requirements

### Phase 1: Pattern Detection Engine (Sprint 1-2)

#### 1. Temporal Pattern Analysis
- **Priority**: High
- **Description**: Analyze content and system activity to identify temporal patterns
- **Requirements**:
  - Develop algorithms to detect daily, weekly, and monthly patterns
  - Create correlation analysis between content types and time periods
  - Implement statistical significance testing for detected patterns
  - Generate pattern confidence scores
  - Leverage ChromaDB for semantic pattern clustering
  - Store pattern embeddings for similarity search
- **Success Metrics**: 
  - 90% accuracy in identifying recurring patterns
  - Detection of patterns with as few as 3 occurrences
- **Integration Points**:
  - Connect with existing analytics in `src/analytics/logger.ts`
  - Extend task history tracking in database
  - Utilize ChromaDB for pattern similarity analysis
  - Index pattern metadata in MeiliSearch for fast retrieval

#### 2. User Behavior Analysis
- **Priority**: Medium
- **Description**: Analyze user interaction patterns to predict future needs
- **Requirements**:
  - Track user activity timing and frequency
  - Identify correlations between user actions and system tasks
  - Develop user-specific pattern profiles
  - Generate predictive models for user behavior
  - Use Ollama for local pattern analysis
  - Leverage OpenAI for complex pattern recognition
- **Success Metrics**:
  - 80% accuracy in predicting user-triggered tasks
  - User-specific pattern identification within 2 weeks of usage
- **Integration Points**:
  - Connect with user activity tracking
  - Leverage existing analytics pipeline
  - Use ChromaDB for semantic clustering of user behaviors
  - Utilize OpenAI API for advanced pattern recognition

### Phase 2: Rule Generation System (Sprint 3-4)

#### 3. Cron Expression Generator
- **Priority**: High
- **Description**: Automatically generate optimal cron expressions from detected patterns
- **Requirements**:
  - Develop algorithms to convert patterns to cron expressions
  - Create optimization for expression efficiency
  - Implement validation against system constraints
  - Generate human-readable descriptions of expressions
  - Use Ollama for local validation of generated expressions
  - Leverage OpenAI for complex expression optimization
- **Success Metrics**:
  - 95% accuracy in generating correct cron expressions
  - 100% validation rate against system constraints
- **Integration Points**:
  - Enhance existing `CronParser` in `src/scheduler/cron-parser.ts`
  - Connect with task scheduler validation
  - Use OpenAI API for natural language descriptions of cron expressions
  - Store expression templates in MeiliSearch for fast retrieval

#### 4. Rule Creation & Management
- **Priority**: High
- **Description**: Create and manage scheduling rules based on detected patterns
- **Requirements**:
  - Develop rule generation algorithms
  - Create rule conflict resolution system
  - Implement rule prioritization framework
  - Generate rule metadata and documentation
  - Use Ollama for local rule validation
  - Leverage OpenAI for complex rule optimization
- **Success Metrics**:
  - 90% reduction in rule conflicts
  - 80% of generated rules requiring no manual adjustment
- **Integration Points**:
  - Extend `TaskScheduler` in `src/scheduler/task-scheduler.ts`
  - Connect with database for rule persistence
  - Index rules in MeiliSearch for fast search and retrieval
  - Store rule embeddings in ChromaDB for similarity analysis

### Phase 3: Predictive Scheduling & Optimization (Sprint 5-6)

#### 5. Predictive Pre-scheduling
- **Priority**: Medium
- **Description**: Schedule tasks before they're explicitly requested based on patterns
- **Requirements**:
  - Develop predictive scheduling algorithms
  - Create confidence threshold system for automatic scheduling
  - Implement resource reservation for predicted tasks
  - Generate audit trail for predictive actions
  - Use Ollama for local prediction validation
  - Leverage OpenAI for complex prediction scenarios
- **Success Metrics**:
  - 70% accuracy in pre-scheduling needed tasks
  - 50% reduction in wait times for common operations
- **Integration Points**:
  - Enhance task queue management
  - Connect with resource allocation system
  - Use ChromaDB for finding similar historical patterns
  - Leverage OpenAI API for advanced prediction validation

#### 6. Resource Optimization
- **Priority**: High
- **Description**: Balance task load across time periods to optimize resource usage
- **Requirements**:
  - Develop load balancing algorithms
  - Create peak detection and mitigation strategies
  - Implement resource usage forecasting
  - Generate optimization recommendations
  - Use Ollama for local optimization validation
  - Leverage OpenAI for complex optimization scenarios
- **Success Metrics**:
  - 40% reduction in peak resource usage
  - 30% improvement in overall resource utilization
- **Integration Points**:
  - Connect with system monitoring
  - Enhance task prioritization system
  - Use MeiliSearch for fast retrieval of resource usage patterns
  - Leverage OpenAI API for advanced optimization strategies

## 🛠️ Technical Implementation

### Enhanced Scheduler Architecture

```
┌─────────────────────┐      ┌─────────────────────┐
│                     │      │                     │
│   Pattern Detection │◄────►│   Activity History  │
│   Engine            │      │   Repository        │
│                     │      │                     │
└─────────┬───────────┘      └─────────────────────┘
          │
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│                     │      │                     │
│   Pattern           │◄────►│   Pattern Library   │
│   Classifier        │      │   (ChromaDB)        │
│                     │      │                     │
└─────────┬───────────┘      └─────────────────────┘
          │
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│                     │      │                     │
│   Rule Generator    │◄────►│   Cron Expression   │
│   (Ollama/OpenAI)   │      │   Optimizer         │
│                     │      │                     │
└─────────┬───────────┘      └─────────────────────┘
          │
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│                     │      │                     │
│   Rule Validator    │◄────►│   Conflict          │
│   & Manager         │      │   Resolver          │
│                     │      │                     │
└─────────┬───────────┘      └─────────────────────┘
          │
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│                     │      │                     │
│   Predictive        │◄────►│   Resource          │
│   Scheduler         │      │   Optimizer         │
│                     │      │   (OpenAI)          │
└─────────┬───────────┘      └─────────────────────┘
          │
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│                     │      │                     │
│   Task Scheduler    │◄────►│   MeiliSearch       │
│   Integration       │      │   Index             │
│                     │      │                     │
└─────────────────────┘      └─────────────────────┘
```

### Database Enhancements

```sql
-- Create activity_patterns table
CREATE TABLE activity_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type TEXT NOT NULL,
    pattern_data TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    detection_count INTEGER DEFAULT 1,
    first_detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    embedding_id TEXT,  -- Reference to ChromaDB embedding
    search_index_id TEXT  -- Reference to MeiliSearch document
);

-- Create scheduling_rules table
CREATE TABLE scheduling_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id INTEGER,
    rule_name TEXT NOT NULL,
    description TEXT,
    cron_expression TEXT NOT NULL,
    priority INTEGER DEFAULT 100,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_auto_generated BOOLEAN DEFAULT TRUE,
    confidence_score REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at DATETIME,
    trigger_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    llm_model_used TEXT,  -- Which LLM generated this rule
    embedding_id TEXT,  -- Reference to ChromaDB embedding
    search_index_id TEXT,  -- Reference to MeiliSearch document
    FOREIGN KEY (pattern_id) REFERENCES activity_patterns(id)
);

-- Create rule_actions table
CREATE TABLE rule_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    action_data TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES scheduling_rules(id) ON DELETE CASCADE
);

-- Add to task_schedules table
ALTER TABLE task_schedules ADD COLUMN rule_id INTEGER;
ALTER TABLE task_schedules ADD COLUMN is_predictive BOOLEAN DEFAULT FALSE;
ALTER TABLE task_schedules ADD COLUMN prediction_confidence REAL;
ALTER TABLE task_schedules ADD COLUMN llm_model_used TEXT;
```

### New API Endpoints

```
GET /api/v1/rules/patterns
POST /api/v1/rules/analyze-patterns
GET /api/v1/rules/scheduling-rules
POST /api/v1/rules/create-rule
PUT /api/v1/rules/update-rule/:id
DELETE /api/v1/rules/delete-rule/:id
GET /api/v1/rules/predictions
POST /api/v1/rules/optimize-schedule
```

### CLI Commands

```bash
# Analyze activity patterns
bun run analyze-activity-patterns --days 30 --min-confidence 0.7 --use-model "ollama"

# Generate scheduling rules
bun run generate-scheduling-rules --from-patterns --auto-enable --use-model "openai"

# Test rule generation
bun run test-rule-generation --pattern-id 123 --simulate --use-model "qwen3:8b"

# Optimize resource usage
bun run optimize-resource-schedule --balance-load --target-date "2023-12-01" --use-model "gpt-4"

# Manage scheduling rules
bun run manage-rules --list --enabled-only --search "daily backup"

# View detected patterns
bun run view-detected-patterns --with-confidence --sort-by confidence

# Export/import rules
bun run export-rules --format json --output rules-backup.json
bun run import-rules --file rules-backup.json --conflict-strategy merge

# Search similar patterns
bun run search-similar-patterns --pattern-id 123 --similarity 0.8 --use-chromadb
```

## 📊 Success Metrics

| Metric | Current | Target | Measurement Method |
|--------|---------|--------|-------------------|
| Manual Scheduling Tasks | 100% baseline | 40% of baseline | Task creation source tracking |
| Peak Resource Usage | 100% baseline | 60% of baseline | System monitoring metrics |
| Task Wait Times | 100% baseline | 50% of baseline | Task queue time tracking |
| Rule Generation Accuracy | N/A | 80% | Manual validation sampling |
| Predictive Scheduling Accuracy | N/A | 70% | Prediction vs. actual need tracking |
| User Satisfaction | Baseline | 30% improvement | User feedback surveys |
| ChromaDB Query Performance | N/A | <100ms avg | Performance monitoring |
| MeiliSearch Index Performance | N/A | <50ms avg | Performance monitoring |
| LLM Response Time | N/A | <2s for Ollama, <5s for OpenAI | API response timing |

## 🗓️ Implementation Timeline

### Sprint 1 (Weeks 1-2)
- Implement temporal pattern analysis algorithms
- Develop pattern confidence scoring
- Create pattern detection pipeline
- Set up ChromaDB collections for pattern storage

### Sprint 2 (Weeks 3-4)
- Build user behavior analysis system
- Implement user-specific pattern profiles
- Develop predictive models
- Configure MeiliSearch indices for pattern search

### Sprint 3 (Weeks 5-6)
- Create cron expression generator
- Implement expression optimization
- Develop validation system
- Integrate Ollama for local expression generation

### Sprint 4 (Weeks 7-8)
- Build rule generation system
- Implement conflict resolution
- Develop rule prioritization framework
- Integrate OpenAI for complex rule generation

### Sprint 5 (Weeks 9-10)
- Create predictive scheduling system
- Implement confidence thresholds
- Develop resource reservation
- Enhance ChromaDB integration for pattern matching

### Sprint 6 (Weeks 11-12)
- Build resource optimization system
- Implement load balancing
- Develop peak detection and mitigation
- Finalize MeiliSearch integration for rule search

## 🔄 Integration Points

### ChromaDB Integration
- **Pattern Storage**: Store pattern embeddings for similarity search
- **Rule Similarity**: Find similar rules to prevent duplication
- **Semantic Search**: Find patterns based on semantic similarity
- **Collection Structure**:
  ```json
  {
    "collection_name": "scheduling_patterns",
    "embedding_model": "qwen3:8b",
    "metadata_schema": {
      "pattern_type": "string",
      "confidence": "float",
      "detection_count": "int",
      "is_active": "boolean"
    }
  }
  ```

### MeiliSearch Integration
- **Pattern Indexing**: Fast retrieval of patterns by attributes
- **Rule Search**: Quick search and filtering of scheduling rules
- **Resource Usage Patterns**: Index resource usage for optimization
- **Index Configuration**:
  ```json
  {
    "index_name": "scheduling_rules",
    "searchable_attributes": [
      "rule_name", 
      "description", 
      "cron_expression",
      "pattern_type"
    ],
    "filterable_attributes": [
      "is_enabled",
      "is_auto_generated",
      "confidence_score",
      "priority"
    ],
    "sortable_attributes": [
      "created_at",
      "updated_at",
      "priority",
      "confidence_score"
    ]
  }
  ```

### Ollama Integration
- **Local Pattern Analysis**: Use local models for basic pattern recognition
- **Expression Generation**: Generate cron expressions from pattern descriptions
- **Rule Validation**: Validate generated rules locally
- **Prompt Template**:
  ```
  Analyze the following system activity pattern and generate an optimal cron expression:
  
  Pattern description: {pattern_description}
  Pattern frequency: {pattern_frequency}
  Pattern confidence: {pattern_confidence}
  
  Generate a cron expression that accurately captures this pattern.
  ```

### OpenAI Integration
- **Complex Pattern Recognition**: Use GPT-4 for advanced pattern detection
- **Optimization Strategies**: Generate sophisticated optimization plans
- **Natural Language Rule Generation**: Convert descriptions to rules
- **Prompt Template**:
  ```
  You are an expert system scheduler. Analyze the following activity pattern and generate:
  1. An optimal cron expression
  2. A human-readable description
  3. Potential optimization strategies
  4. Confidence assessment
  
  Pattern data:
  {pattern_json_data}
  
  Previous similar patterns:
  {similar_patterns_data}
  
  System constraints:
  {system_constraints}
  ```

## 🧪 Testing Strategy

### Unit Testing
- Test individual pattern detection algorithms
- Validate cron expression generation
- Verify rule conflict resolution
- Test ChromaDB and MeiliSearch integration components

### Integration Testing
- Test end-to-end rule generation and application
- Validate integration with existing scheduler
- Verify predictive scheduling effectiveness
- Test LLM integration with both Ollama and OpenAI

### Performance Testing
- Benchmark pattern detection performance
- Validate resource optimization effectiveness
- Test system under various load conditions
- Measure ChromaDB and MeiliSearch query performance

### A/B Testing
- Compare performance with and without rule-based scheduling
- Test different pattern detection thresholds
- Validate impact on system responsiveness
- Compare Ollama vs OpenAI for rule generation quality

## 📚 Documentation Requirements

- **Developer Guide**: Extending the rule scheduler system
- **System Administrator Guide**: Configuring and monitoring rules
- **CLI Reference**: Comprehensive documentation of all CLI commands
- **API Documentation**: For new rule scheduler endpoints
- **Integration Guide**: Connecting with ChromaDB, MeiliSearch, and LLMs

## 🚀 Future Expansion

- **Machine Learning Enhancement**: Apply ML to improve pattern detection accuracy
- **Cross-System Pattern Detection**: Identify patterns across multiple Banana Bun instances
- **Anomaly Detection**: Identify and alert on pattern deviations
- **Calendar Integration**: Sync with external calendars for enhanced scheduling
- **Natural Language Rule Creation**: Generate rules from natural language descriptions
- **Multi-Model Ensemble**: Combine predictions from multiple LLMs for higher accuracy
- **Fine-Tuned Models**: Train specialized models on your scheduling patterns
