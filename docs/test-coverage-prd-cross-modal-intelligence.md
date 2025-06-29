# Test Coverage PRD: Cross-Modal Intelligence Service

**File**: `src/services/cross-modal-intelligence-service.ts`  
**Current Coverage**: 0% (No dedicated tests)  
**Target Coverage**: 85%  
**Priority**: High  

## Overview

The Cross-Modal Intelligence Service implements Phase 2 of the roadmap, providing advanced analysis of correlations between search queries, transcripts, tags, and content quality. This service is critical for improving content discovery and tagging optimization.

## File Purpose

The Cross-Modal Intelligence Service implements:
- Search-Transcript-Tag correlation analysis
- Content quality correlation assessment
- Cross-modal embedding generation
- Search behavior pattern tracking
- Feedback loops between search and tagging systems

## Key Components to Test

### 1. CrossModalIntelligenceService Class
- Correlation analysis algorithms
- Embedding generation and management
- Search pattern detection
- Quality assessment integration

### 2. Correlation Analysis
- Search query to transcript matching
- Tag relevance scoring
- Content quality correlation
- Multi-modal similarity calculations

### 3. Embedding Management
- Cross-modal embedding generation
- Vector similarity calculations
- Embedding storage and retrieval
- Dimension reduction and optimization

### 4. Search Intelligence
- Search behavior tracking
- Query pattern analysis
- Result relevance feedback
- Search optimization recommendations

## Test Assertions

### Unit Tests

#### Correlation Analysis
```typescript
describe('CrossModalIntelligenceService.analyzeSearchTranscriptTagCorrelation', () => {
  it('should analyze correlation for media with transcript and tags', async () => {
    const mediaId = 123;
    mockMediaData(mediaId, {
      transcript: 'This video discusses machine learning algorithms and neural networks',
      tags: ['ai', 'machine-learning', 'technology'],
      search_queries: ['machine learning tutorial', 'neural networks explained']
    });
    
    const correlation = await service.analyzeSearchTranscriptTagCorrelation(mediaId);
    
    expect(correlation.media_id).toBe(123);
    expect(correlation.correlation_score).toBeGreaterThan(0.7);
    expect(correlation.suggested_tags).toContain('neural-networks');
    expect(correlation.confidence).toBeGreaterThan(0.8);
  });

  it('should identify missing relevant tags', async () => {
    const mediaId = 124;
    mockMediaData(mediaId, {
      transcript: 'Tutorial on Python programming and data science techniques',
      tags: ['tutorial'], // Missing relevant tags
      search_queries: ['python programming', 'data science tutorial']
    });
    
    const correlation = await service.analyzeSearchTranscriptTagCorrelation(mediaId);
    
    expect(correlation.suggested_tags).toContain('python');
    expect(correlation.suggested_tags).toContain('data-science');
    expect(correlation.improvement_potential).toBeGreaterThan(0.6);
  });

  it('should handle media without transcript gracefully', async () => {
    const mediaId = 125;
    mockMediaData(mediaId, {
      transcript: '',
      tags: ['video'],
      search_queries: ['test video']
    });
    
    const correlation = await service.analyzeSearchTranscriptTagCorrelation(mediaId);
    
    expect(correlation.correlation_score).toBe(0);
    expect(correlation.suggested_tags).toHaveLength(0);
    expect(correlation.confidence).toBeLessThan(0.3);
  });

  it('should calculate accurate correlation scores', async () => {
    const testCases = [
      {
        transcript: 'cooking pasta with tomato sauce',
        tags: ['cooking', 'pasta', 'italian'],
        queries: ['pasta recipe', 'italian cooking'],
        expectedScore: 0.9
      },
      {
        transcript: 'advanced quantum physics concepts',
        tags: ['cooking', 'recipe'], // Mismatched tags
        queries: ['quantum physics'],
        expectedScore: 0.2
      }
    ];
    
    for (const testCase of testCases) {
      const mediaId = Math.floor(Math.random() * 1000);
      mockMediaData(mediaId, testCase);
      
      const correlation = await service.analyzeSearchTranscriptTagCorrelation(mediaId);
      expect(correlation.correlation_score).toBeCloseTo(testCase.expectedScore, 1);
    }
  });
});
```

#### Content Quality Correlation
```typescript
describe('CrossModalIntelligenceService.assessContentQualityCorrelation', () => {
  it('should assess quality correlation for high-quality content', async () => {
    const mediaId = 200;
    mockMediaData(mediaId, {
      transcript: 'Clear, well-structured explanation of complex topics with good audio quality',
      tags: ['education', 'tutorial', 'high-quality'],
      metadata: { duration: 1800, audio_bitrate: 320, video_resolution: '1920x1080' },
      user_ratings: [5, 5, 4, 5],
      engagement_metrics: { views: 1000, likes: 95, completion_rate: 0.85 }
    });
    
    const assessment = await service.assessContentQualityCorrelation(mediaId);
    
    expect(assessment.overall_quality_score).toBeGreaterThan(0.8);
    expect(assessment.transcript_quality_score).toBeGreaterThan(0.8);
    expect(assessment.metadata_quality_score).toBeGreaterThan(0.8);
    expect(assessment.user_engagement_score).toBeGreaterThan(0.8);
  });

  it('should identify quality issues in content', async () => {
    const mediaId = 201;
    mockMediaData(mediaId, {
      transcript: 'um... like... this is... uh... not very clear',
      tags: ['video'], // Generic tags
      metadata: { duration: 120, audio_bitrate: 64, video_resolution: '480x360' },
      user_ratings: [2, 1, 3, 2],
      engagement_metrics: { views: 100, likes: 5, completion_rate: 0.3 }
    });
    
    const assessment = await service.assessContentQualityCorrelation(mediaId);
    
    expect(assessment.overall_quality_score).toBeLessThan(0.5);
    expect(assessment.quality_issues).toContain('Poor transcript clarity');
    expect(assessment.quality_issues).toContain('Low audio quality');
    expect(assessment.improvement_suggestions).toHaveLength(greaterThan(0));
  });

  it('should correlate search success with content quality', async () => {
    const highQualityMedia = 202;
    const lowQualityMedia = 203;
    
    mockMediaData(highQualityMedia, { /* high quality data */ });
    mockMediaData(lowQualityMedia, { /* low quality data */ });
    
    mockSearchAnalytics([
      { media_id: highQualityMedia, search_success_rate: 0.9, click_through_rate: 0.8 },
      { media_id: lowQualityMedia, search_success_rate: 0.3, click_through_rate: 0.2 }
    ]);
    
    const correlation = await service.analyzeQualitySearchCorrelation();
    
    expect(correlation.correlation_coefficient).toBeGreaterThan(0.7);
    expect(correlation.quality_impact_on_search).toBeGreaterThan(0.6);
  });
});
```

#### Cross-Modal Embeddings
```typescript
describe('CrossModalIntelligenceService.generateCrossModalEmbeddings', () => {
  it('should generate embeddings for media content', async () => {
    const mediaId = 300;
    mockMediaData(mediaId, {
      transcript: 'Machine learning tutorial covering neural networks',
      tags: ['ai', 'tutorial', 'machine-learning'],
      visual_features: [0.1, 0.2, 0.3, 0.4], // Mock visual embeddings
      audio_features: [0.5, 0.6, 0.7, 0.8] // Mock audio embeddings
    });
    
    const embeddings = await service.generateCrossModalEmbeddings(mediaId);
    
    expect(embeddings.text_embedding).toHaveLength(384); // Standard embedding size
    expect(embeddings.visual_embedding).toHaveLength(4);
    expect(embeddings.audio_embedding).toHaveLength(4);
    expect(embeddings.combined_embedding).toHaveLength(greaterThan(0));
    expect(embeddings.embedding_quality_score).toBeGreaterThan(0.5);
  });

  it('should handle missing modalities gracefully', async () => {
    const mediaId = 301;
    mockMediaData(mediaId, {
      transcript: 'Audio-only content',
      tags: ['audio'],
      visual_features: null, // No visual data
      audio_features: [0.1, 0.2, 0.3]
    });
    
    const embeddings = await service.generateCrossModalEmbeddings(mediaId);
    
    expect(embeddings.text_embedding).toBeDefined();
    expect(embeddings.audio_embedding).toBeDefined();
    expect(embeddings.visual_embedding).toBeNull();
    expect(embeddings.modalities_available).toEqual(['text', 'audio']);
  });

  it('should calculate similarity between cross-modal embeddings', async () => {
    const media1 = 302;
    const media2 = 303;
    
    // Similar content
    mockMediaData(media1, { transcript: 'Python programming tutorial' });
    mockMediaData(media2, { transcript: 'Learn Python programming basics' });
    
    const similarity = await service.calculateCrossModalSimilarity(media1, media2);
    
    expect(similarity.overall_similarity).toBeGreaterThan(0.7);
    expect(similarity.text_similarity).toBeGreaterThan(0.8);
    expect(similarity.semantic_similarity).toBeGreaterThan(0.7);
  });
});
```

#### Search Behavior Analysis
```typescript
describe('CrossModalIntelligenceService.trackSearchBehavior', () => {
  it('should track search query and result interaction', async () => {
    const searchData = {
      query: 'machine learning tutorial',
      session_id: 'session_123',
      results: [
        { media_id: 100, rank: 1, clicked: true, watch_time: 300 },
        { media_id: 101, rank: 2, clicked: false },
        { media_id: 102, rank: 3, clicked: true, watch_time: 150 }
      ]
    };
    
    await service.trackSearchBehavior(searchData);
    
    const behavior = await service.getSearchBehavior('session_123');
    expect(behavior.queries).toHaveLength(1);
    expect(behavior.click_through_rate).toBeCloseTo(0.67, 2); // 2 out of 3 clicked
    expect(behavior.avg_watch_time).toBeCloseTo(225, 0); // (300 + 150) / 2
  });

  it('should detect search patterns over time', async () => {
    await setupSearchHistory([
      { query: 'python tutorial', timestamp: '2024-01-01T10:00:00Z' },
      { query: 'python programming', timestamp: '2024-01-01T11:00:00Z' },
      { query: 'machine learning python', timestamp: '2024-01-01T12:00:00Z' }
    ]);
    
    const patterns = await service.detectSearchPatterns('session_123', 7); // 7 days
    
    expect(patterns.dominant_topics).toContain('python');
    expect(patterns.query_evolution).toHaveLength(greaterThan(0));
    expect(patterns.search_intent_progression).toBeDefined();
  });

  it('should generate search optimization recommendations', async () => {
    await setupSearchAnalytics({
      low_ctr_queries: ['advanced machine learning', 'deep neural networks'],
      high_ctr_queries: ['python tutorial', 'beginner programming'],
      user_preferences: { content_length: 'medium', difficulty: 'beginner' }
    });
    
    const recommendations = await service.generateSearchOptimizations('user_123');
    
    expect(recommendations.tag_suggestions).toHaveLength(greaterThan(0));
    expect(recommendations.content_improvements).toHaveLength(greaterThan(0));
    expect(recommendations.search_query_refinements).toHaveLength(greaterThan(0));
  });
});
```

### Integration Tests

#### End-to-End Cross-Modal Analysis
```typescript
describe('Cross-Modal Intelligence Integration', () => {
  it('should complete full cross-modal analysis workflow', async () => {
    // 1. Setup media with multi-modal content
    const mediaId = await setupMultiModalMedia({
      transcript: 'Comprehensive Python programming course',
      tags: ['programming'],
      video_features: generateMockVideoFeatures(),
      audio_features: generateMockAudioFeatures()
    });
    
    // 2. Analyze correlations
    const correlation = await service.analyzeSearchTranscriptTagCorrelation(mediaId);
    expect(correlation.suggested_tags).toContain('python');
    
    // 3. Generate embeddings
    const embeddings = await service.generateCrossModalEmbeddings(mediaId);
    expect(embeddings.combined_embedding).toBeDefined();
    
    // 4. Track search behavior
    await service.trackSearchBehavior({
      query: 'python programming course',
      results: [{ media_id: mediaId, rank: 1, clicked: true }]
    });
    
    // 5. Generate recommendations
    const recommendations = await service.generateSearchOptimizations('test_user');
    expect(recommendations.tag_suggestions).toHaveLength(greaterThan(0));
  });
});
```

## Mock Requirements

### Media Data Mocks
- Multi-modal content with text, audio, and visual features
- Metadata including quality metrics
- User interaction data (ratings, engagement)

### Search Analytics Mocks
- Search query logs with results and interactions
- Click-through rates and engagement metrics
- User behavior patterns over time

### Embedding Service Mocks
- Text embedding generation
- Visual and audio feature extraction
- Similarity calculation algorithms

## Test Data Requirements

### Multi-Modal Content
- Videos with transcripts and visual features
- Audio files with speech and music content
- Images with descriptive metadata
- Mixed content types for correlation testing

### Search Scenarios
- Successful searches with high relevance
- Failed searches with poor results
- Progressive search refinement patterns
- Cross-domain search behaviors

## Success Criteria

- [ ] Correlation analysis accurately identifies relationships
- [ ] Content quality assessment reflects actual quality
- [ ] Cross-modal embeddings capture semantic similarity
- [ ] Search behavior tracking provides actionable insights
- [ ] Recommendations improve search and tagging effectiveness
- [ ] Integration between all components works seamlessly
- [ ] Performance is acceptable for real-time analysis

## Implementation Priority

1. **High Priority**: Correlation analysis and quality assessment
2. **Medium Priority**: Cross-modal embeddings and search tracking
3. **Low Priority**: Advanced recommendations and optimization

## Dependencies

- ChromaDB for embedding storage and similarity search
- Media metadata system for content access
- Search analytics system for behavior tracking
- Machine learning models for feature extraction
