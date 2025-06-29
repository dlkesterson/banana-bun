# Test Coverage PRD: Analyze Cross-Modal Intelligence CLI

**File**: `src/cli/analyze-cross-modal-intelligence.ts`  
**Current Coverage**: 0% (No tests)  
**Target Coverage**: 80%  
**Priority**: Medium  

## Overview

The Analyze Cross-Modal Intelligence CLI is a command-line tool that provides access to Phase 2 cross-modal intelligence features, including correlation analysis, quality assessment, embedding generation, and search pattern analysis.

## File Purpose

The CLI implements:
- Command-line interface for cross-modal intelligence analysis
- Multiple analysis actions (correlations, quality, embeddings, search patterns)
- Dashboard generation and reporting
- Search behavior tracking
- Integration with cross-modal intelligence service

## Key Components to Test

### 1. CLI Argument Parsing
- Action parameter validation
- Optional parameter handling (media ID, query, session ID)
- Report generation flags

### 2. Analysis Actions
- Correlation analysis execution
- Quality assessment workflows
- Embedding generation processes
- Search pattern analysis

### 3. Dashboard and Reporting
- Intelligence dashboard generation
- Report formatting and output
- Data visualization preparation

### 4. Search Tracking
- Search behavior recording
- Session management
- Analytics integration

## Test Assertions

### Unit Tests

#### CLI Argument Parsing
```typescript
describe('Cross-Modal Intelligence CLI Parsing', () => {
  it('should parse correlation analysis action', () => {
    const args = ['correlations', '--media-id', '123'];
    const options = parseCliArgs(args);
    
    expect(options.action).toBe('correlations');
    expect(options.mediaId).toBe(123);
  });

  it('should parse quality assessment action', () => {
    const args = ['quality', '--media-id', '456'];
    const options = parseCliArgs(args);
    
    expect(options.action).toBe('quality');
    expect(options.mediaId).toBe(456);
  });

  it('should parse search pattern analysis with time range', () => {
    const args = ['search-patterns', '--days', '30', '--limit', '100'];
    const options = parseCliArgs(args);
    
    expect(options.action).toBe('search-patterns');
    expect(options.days).toBe(30);
    expect(options.limit).toBe(100);
  });

  it('should parse search tracking parameters', () => {
    const args = ['track-search', '--query', 'machine learning', '--session-id', 'session123'];
    const options = parseCliArgs(args);
    
    expect(options.action).toBe('track-search');
    expect(options.query).toBe('machine learning');
    expect(options.sessionId).toBe('session123');
  });

  it('should validate required parameters for each action', () => {
    // Correlations requires media-id
    expect(() => parseCliArgs(['correlations']))
      .toThrow('Media ID is required for correlations analysis');
    
    // Track-search requires query
    expect(() => parseCliArgs(['track-search', '--session-id', 'session123']))
      .toThrow('Query is required for search tracking');
  });

  it('should validate action parameter', () => {
    expect(() => parseCliArgs(['invalid-action']))
      .toThrow('Invalid action. Must be one of: correlations, quality, embeddings, search-patterns, track-search, dashboard');
  });

  it('should display help when requested', () => {
    const consoleSpy = jest.spyOn(console, 'log');
    parseCliArgs(['--help']);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cross-Modal Intelligence Analysis CLI'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('correlations'));
  });
});
```

#### Correlation Analysis
```typescript
describe('Correlation Analysis Action', () => {
  it('should execute correlation analysis for specific media', async () => {
    const options = { action: 'correlations', mediaId: 123 };
    
    mockCrossModalService({
      correlation_score: 0.85,
      suggested_tags: ['machine-learning', 'tutorial'],
      confidence: 0.9,
      improvement_potential: 0.3
    });
    
    const result = await executeCorrelationAnalysis(options);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('Correlation Score: 0.85');
    expect(result.output).toContain('Suggested Tags: machine-learning, tutorial');
    expect(result.output).toContain('Confidence: 90%');
  });

  it('should handle media not found error', async () => {
    const options = { action: 'correlations', mediaId: 999 };
    mockMediaNotFound(999);
    
    const result = await executeCorrelationAnalysis(options);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Media with ID 999 not found');
  });

  it('should format correlation results for display', async () => {
    const correlationData = {
      media_id: 123,
      correlation_score: 0.75,
      suggested_tags: ['python', 'programming', 'tutorial'],
      current_tags: ['coding'],
      confidence: 0.85,
      improvement_potential: 0.6
    };
    
    const formatted = formatCorrelationResults(correlationData);
    
    expect(formatted).toContain('Media ID: 123');
    expect(formatted).toContain('Current Tags: coding');
    expect(formatted).toContain('Suggested Additional Tags: python, programming, tutorial');
    expect(formatted).toContain('Improvement Potential: 60%');
  });
});
```

#### Quality Assessment
```typescript
describe('Quality Assessment Action', () => {
  it('should execute quality assessment for media', async () => {
    const options = { action: 'quality', mediaId: 456 };
    
    mockQualityAssessment({
      overall_quality_score: 0.82,
      transcript_quality_score: 0.9,
      metadata_quality_score: 0.7,
      user_engagement_score: 0.85,
      quality_issues: ['Low audio bitrate'],
      improvement_suggestions: ['Improve audio quality', 'Add more descriptive tags']
    });
    
    const result = await executeQualityAssessment(options);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('Overall Quality: 82%');
    expect(result.output).toContain('Transcript Quality: 90%');
    expect(result.output).toContain('Quality Issues:');
    expect(result.output).toContain('Low audio bitrate');
  });

  it('should highlight quality issues prominently', async () => {
    const qualityData = {
      overall_quality_score: 0.45,
      quality_issues: [
        'Poor audio quality (64kbps)',
        'Incomplete metadata (30% complete)',
        'Low transcript clarity'
      ],
      improvement_suggestions: [
        'Re-encode audio at higher bitrate',
        'Add missing tags and descriptions',
        'Consider re-transcription with better model'
      ]
    };
    
    const formatted = formatQualityResults(qualityData);
    
    expect(formatted).toContain('⚠️  Quality Issues Found:');
    expect(formatted).toContain('💡 Improvement Suggestions:');
    expect(formatted).toContain('Re-encode audio at higher bitrate');
  });
});
```

#### Embedding Generation
```typescript
describe('Embedding Generation Action', () => {
  it('should generate cross-modal embeddings for media', async () => {
    const options = { action: 'embeddings', mediaId: 789 };
    
    mockEmbeddingGeneration({
      text_embedding: new Array(384).fill(0.1),
      visual_embedding: new Array(512).fill(0.2),
      audio_embedding: new Array(256).fill(0.3),
      combined_embedding: new Array(1152).fill(0.15),
      embedding_quality_score: 0.88,
      modalities_available: ['text', 'visual', 'audio']
    });
    
    const result = await executeEmbeddingGeneration(options);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('Embedding Quality: 88%');
    expect(result.output).toContain('Modalities: text, visual, audio');
    expect(result.output).toContain('Text Embedding: 384 dimensions');
  });

  it('should handle missing modalities gracefully', async () => {
    const options = { action: 'embeddings', mediaId: 790 };
    
    mockEmbeddingGeneration({
      text_embedding: new Array(384).fill(0.1),
      visual_embedding: null,
      audio_embedding: new Array(256).fill(0.3),
      modalities_available: ['text', 'audio'],
      missing_modalities: ['visual']
    });
    
    const result = await executeEmbeddingGeneration(options);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('Missing Modalities: visual');
    expect(result.output).toContain('Available: text, audio');
  });
});
```

#### Search Pattern Analysis
```typescript
describe('Search Pattern Analysis Action', () => {
  it('should analyze search patterns over time period', async () => {
    const options = { action: 'search-patterns', days: 30, limit: 50 };
    
    mockSearchPatterns({
      total_searches: 1250,
      unique_queries: 340,
      top_queries: [
        { query: 'python tutorial', count: 45, avg_ctr: 0.75 },
        { query: 'machine learning', count: 38, avg_ctr: 0.68 }
      ],
      dominant_topics: ['programming', 'tutorials', 'machine-learning'],
      search_trends: [
        { date: '2024-01-01', search_count: 42 },
        { date: '2024-01-02', search_count: 38 }
      ]
    });
    
    const result = await executeSearchPatternAnalysis(options);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('Total Searches: 1,250');
    expect(result.output).toContain('Top Queries:');
    expect(result.output).toContain('python tutorial (45 searches, 75% CTR)');
    expect(result.output).toContain('Dominant Topics: programming, tutorials, machine-learning');
  });

  it('should format search trends for visualization', async () => {
    const searchData = {
      search_trends: [
        { date: '2024-01-01', search_count: 42, avg_ctr: 0.65 },
        { date: '2024-01-02', search_count: 38, avg_ctr: 0.72 },
        { date: '2024-01-03', search_count: 51, avg_ctr: 0.68 }
      ]
    };
    
    const formatted = formatSearchTrends(searchData.search_trends);
    
    expect(formatted).toContain('📈 Search Trends:');
    expect(formatted).toContain('2024-01-01: 42 searches (65% CTR)');
    expect(formatted).toContain('2024-01-03: 51 searches (68% CTR)');
  });
});
```

#### Dashboard Generation
```typescript
describe('Dashboard Generation Action', () => {
  it('should generate comprehensive intelligence dashboard', async () => {
    const options = { action: 'dashboard', generateReport: true };
    
    mockDashboardData({
      total_media_items: 1500,
      analyzed_items: 1200,
      avg_correlation_score: 0.78,
      quality_distribution: { high: 45, medium: 40, low: 15 },
      top_improvement_areas: ['Audio quality', 'Tag completeness'],
      recent_optimizations: 25
    });
    
    const result = await executeDashboardGeneration(options);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('📊 Cross-Modal Intelligence Dashboard');
    expect(result.output).toContain('Total Media Items: 1,500');
    expect(result.output).toContain('Average Correlation Score: 78%');
    expect(result.output).toContain('Quality Distribution:');
  });

  it('should save dashboard report when requested', async () => {
    const options = { action: 'dashboard', generateReport: true };
    const reportSpy = jest.spyOn(reportGenerator, 'saveReport');
    
    await executeDashboardGeneration(options);
    
    expect(reportSpy).toHaveBeenCalledWith(
      expect.stringContaining('cross-modal-intelligence-report'),
      expect.any(Object)
    );
  });
});
```

### Integration Tests

#### End-to-End CLI Execution
```typescript
describe('Cross-Modal Intelligence CLI Integration', () => {
  it('should complete full correlation analysis workflow', async () => {
    // Setup test media with cross-modal content
    const mediaId = await setupTestMedia({
      transcript: 'Python programming tutorial for beginners',
      tags: ['tutorial'],
      search_queries: ['python programming', 'beginner coding']
    });
    
    // Execute CLI command
    const result = await runCLI(['correlations', '--media-id', mediaId.toString()]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Correlation analysis completed');
    expect(result.stdout).toContain('Suggested Tags:');
    expect(result.stdout).toContain('python');
  });

  it('should handle search pattern analysis for empty dataset', async () => {
    // Clear search history
    await clearSearchHistory();
    
    const result = await runCLI(['search-patterns', '--days', '7']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No search patterns found');
    expect(result.stdout).toContain('for the specified time period');
  });

  it('should display help when no action provided', async () => {
    const result = await runCLI([]);
    
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Available actions:');
  });
});
```

## Mock Requirements

### Cross-Modal Service Mocks
- Correlation analysis results with various scores
- Quality assessment data with issues and suggestions
- Embedding generation with different modalities
- Search pattern data with trends and statistics

### Media Data Mocks
- Media items with multi-modal content
- Missing or incomplete media records
- Various content types and quality levels

### Dashboard Data Mocks
- Aggregated statistics for dashboard display
- Quality distributions and improvement areas
- Recent optimization results

## Test Data Requirements

### Analysis Scenarios
- High-correlation content with good tag alignment
- Low-correlation content needing improvement
- Mixed-quality content with various issues
- Search patterns with clear trends

### CLI Usage Patterns
- Single media analysis workflows
- Batch analysis operations
- Dashboard generation and reporting
- Error handling and recovery

## Success Criteria

- [ ] All CLI actions are properly parsed and validated
- [ ] Analysis results are formatted clearly for users
- [ ] Error handling provides helpful feedback
- [ ] Dashboard generation works with real data
- [ ] Integration with cross-modal service is reliable
- [ ] Performance is acceptable for typical datasets
- [ ] Help documentation is comprehensive

## Implementation Priority

1. **High Priority**: CLI parsing, basic analysis actions
2. **Medium Priority**: Dashboard generation, result formatting
3. **Low Priority**: Advanced reporting, performance optimization

## Dependencies

- Cross-Modal Intelligence Service for analysis
- Media metadata system for content access
- Search analytics for pattern data
- Report generation utilities for dashboard
