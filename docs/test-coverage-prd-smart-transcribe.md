# Test Coverage PRD: Smart Transcribe CLI

**File**: `src/cli/smart-transcribe.ts`  
**Current Coverage**: 0% (No tests)  
**Target Coverage**: 80%  
**Priority**: Medium  

## Overview

The Smart Transcribe CLI is an advanced command-line tool that provides intelligent transcription services with MCP integration, quality assessment, pattern analysis, and feedback learning capabilities.

## File Purpose

The Smart Transcribe CLI implements:
- Advanced transcription with quality options
- MCP server integration for enhanced processing
- Batch transcription capabilities
- Analytics and pattern analysis
- User feedback collection and learning
- Recommendation system integration

## Key Components to Test

### 1. CLI Argument Parsing
- File path validation and format checking
- Quality and model parameter handling
- Batch processing options
- MCP integration flags

### 2. Transcription Processing
- Single file transcription
- Batch processing workflows
- Quality level handling (fast, balanced, high)
- Model selection and configuration

### 3. MCP Integration
- Whisper MCP server communication
- Enhanced processing workflows
- Error handling and fallbacks

### 4. Analytics and Learning
- Pattern analysis integration
- Feedback collection
- Recommendation generation
- Performance tracking

## Test Assertions

### Unit Tests

#### CLI Argument Parsing
```typescript
describe('Smart Transcribe CLI Parsing', () => {
  it('should parse file path parameter', () => {
    const args = ['--file', '/path/to/audio.mp3'];
    const options = parseCliArgs(args);
    
    expect(options.filePath).toBe('/path/to/audio.mp3');
  });

  it('should parse quality parameter with valid values', () => {
    const args = ['--file', 'audio.mp3', '--quality', 'high'];
    const options = parseCliArgs(args);
    
    expect(options.quality).toBe('high');
    expect(['fast', 'balanced', 'high']).toContain(options.quality);
  });

  it('should reject invalid quality values', () => {
    const args = ['--file', 'audio.mp3', '--quality', 'invalid'];
    
    expect(() => parseCliArgs(args))
      .toThrow('Invalid quality. Must be one of: fast, balanced, high');
  });

  it('should parse batch directory parameter', () => {
    const args = ['--batch', '/path/to/audio/files'];
    const options = parseCliArgs(args);
    
    expect(options.batch).toBe('/path/to/audio/files');
  });

  it('should parse feedback parameters', () => {
    const args = ['--feedback', 'correction', '--rating', '4'];
    const options = parseCliArgs(args);
    
    expect(options.feedback).toBe('correction');
    expect(options.rating).toBe(4);
  });

  it('should validate rating range', () => {
    const args = ['--rating', '6'];
    
    expect(() => parseCliArgs(args))
      .toThrow('Rating must be between 1 and 5');
  });
});
```

#### File Validation
```typescript
describe('File Validation', () => {
  it('should validate audio file exists', async () => {
    const filePath = '/path/to/existing/audio.mp3';
    mockFileExists(filePath, true);
    
    const isValid = await validateAudioFile(filePath);
    expect(isValid).toBe(true);
  });

  it('should reject non-existent files', async () => {
    const filePath = '/path/to/missing/audio.mp3';
    mockFileExists(filePath, false);
    
    await expect(validateAudioFile(filePath))
      .rejects.toThrow('Audio file not found: /path/to/missing/audio.mp3');
  });

  it('should validate supported audio formats', async () => {
    const supportedFiles = ['audio.mp3', 'audio.wav', 'audio.m4a', 'audio.flac'];
    
    for (const file of supportedFiles) {
      mockFileExists(file, true);
      const isValid = await validateAudioFile(file);
      expect(isValid).toBe(true);
    }
  });

  it('should reject unsupported file formats', async () => {
    const unsupportedFile = 'document.txt';
    mockFileExists(unsupportedFile, true);
    
    await expect(validateAudioFile(unsupportedFile))
      .rejects.toThrow('Unsupported file format');
  });

  it('should validate batch directory contains audio files', async () => {
    const batchDir = '/path/to/batch';
    mockDirectoryContents(batchDir, ['audio1.mp3', 'audio2.wav', 'readme.txt']);
    
    const audioFiles = await validateBatchDirectory(batchDir);
    expect(audioFiles).toHaveLength(2);
    expect(audioFiles).toContain('audio1.mp3');
    expect(audioFiles).toContain('audio2.wav');
  });
});
```

#### Transcription Processing
```typescript
describe('Transcription Processing', () => {
  it('should transcribe single audio file', async () => {
    const filePath = '/path/to/audio.mp3';
    const options = { quality: 'balanced', model: 'whisper-1' };
    
    mockTranscriptionService({
      text: 'This is the transcribed content.',
      confidence: 0.92,
      duration: 120
    });
    
    const result = await transcribeFile(filePath, options);
    
    expect(result.success).toBe(true);
    expect(result.transcript).toBe('This is the transcribed content.');
    expect(result.confidence).toBe(0.92);
    expect(result.processing_time_ms).toBeGreaterThan(0);
  });

  it('should handle different quality levels', async () => {
    const filePath = '/path/to/audio.mp3';
    
    // Test fast quality
    const fastResult = await transcribeFile(filePath, { quality: 'fast' });
    expect(fastResult.processing_time_ms).toBeLessThan(5000);
    
    // Test high quality
    const highResult = await transcribeFile(filePath, { quality: 'high' });
    expect(highResult.confidence).toBeGreaterThan(fastResult.confidence);
  });

  it('should process batch of audio files', async () => {
    const batchDir = '/path/to/batch';
    const audioFiles = ['audio1.mp3', 'audio2.wav', 'audio3.m4a'];
    mockDirectoryContents(batchDir, audioFiles);
    
    const results = await processBatch(batchDir, { quality: 'balanced' });
    
    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result.success).toBe(true);
      expect(result.transcript).toBeString();
    });
  });

  it('should handle transcription errors gracefully', async () => {
    const filePath = '/path/to/corrupted.mp3';
    mockTranscriptionError('Audio file is corrupted');
    
    const result = await transcribeFile(filePath, { quality: 'balanced' });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('corrupted');
  });
});
```

#### MCP Integration
```typescript
describe('MCP Integration', () => {
  it('should use Whisper MCP server when available', async () => {
    const filePath = '/path/to/audio.mp3';
    mockMCPServerAvailable('whisper', true);
    
    const mcpSpy = jest.spyOn(mcpClient, 'callTool');
    await transcribeWithMCP(filePath, { quality: 'high' });
    
    expect(mcpSpy).toHaveBeenCalledWith('whisper', 'transcribe_audio', {
      file_path: filePath,
      quality: 'high'
    });
  });

  it('should fallback to direct transcription when MCP unavailable', async () => {
    const filePath = '/path/to/audio.mp3';
    mockMCPServerAvailable('whisper', false);
    
    const directSpy = jest.spyOn(whisperService, 'transcribe');
    await transcribeWithMCP(filePath, { quality: 'balanced' });
    
    expect(directSpy).toHaveBeenCalled();
  });

  it('should enhance transcription with pattern analysis', async () => {
    const filePath = '/path/to/audio.mp3';
    mockMCPServerAvailable('patterns', true);
    
    const result = await transcribeWithEnhancement(filePath);
    
    expect(result.enhanced_transcript).toBeDefined();
    expect(result.detected_patterns).toBeArray();
    expect(result.quality_score).toBeGreaterThan(0);
  });
});
```

#### Analytics and Feedback
```typescript
describe('Analytics and Feedback', () => {
  it('should collect user feedback on transcription quality', async () => {
    const transcriptionId = 'trans_123';
    const feedback = {
      rating: 4,
      corrections: 'Fixed some technical terms',
      session_id: 'session_456'
    };
    
    await collectFeedback(transcriptionId, feedback);
    
    const stored = await getFeedback(transcriptionId);
    expect(stored.rating).toBe(4);
    expect(stored.corrections).toBe('Fixed some technical terms');
  });

  it('should analyze transcription patterns', async () => {
    const sessionId = 'session_123';
    mockTranscriptionHistory(sessionId, [
      { file: 'meeting1.mp3', accuracy: 0.95, domain: 'business' },
      { file: 'meeting2.mp3', accuracy: 0.92, domain: 'business' },
      { file: 'lecture.mp3', accuracy: 0.88, domain: 'education' }
    ]);
    
    const patterns = await analyzeTranscriptionPatterns(sessionId);
    
    expect(patterns.domain_accuracy).toBeDefined();
    expect(patterns.domain_accuracy.business).toBeGreaterThan(0.9);
    expect(patterns.improvement_suggestions).toBeArray();
  });

  it('should generate recommendations based on usage patterns', async () => {
    const userId = 'user_123';
    mockUserTranscriptionHistory(userId, {
      frequent_domains: ['meetings', 'interviews'],
      avg_file_duration: 1800, // 30 minutes
      preferred_quality: 'high'
    });
    
    const recommendations = await generateRecommendations(userId);
    
    expect(recommendations).toContain('Consider using batch processing for meeting transcriptions');
    expect(recommendations).toContain('High quality setting recommended for your content type');
  });

  it('should track performance metrics', async () => {
    const sessionId = 'session_123';
    
    await trackTranscriptionMetrics(sessionId, {
      file_count: 5,
      total_duration_minutes: 150,
      avg_accuracy: 0.94,
      processing_time_minutes: 45
    });
    
    const metrics = await getSessionMetrics(sessionId);
    expect(metrics.efficiency_score).toBeGreaterThan(0);
    expect(metrics.quality_score).toBeGreaterThan(0.9);
  });
});
```

### Integration Tests

#### End-to-End Transcription Workflow
```typescript
describe('Transcription Workflow Integration', () => {
  it('should complete full smart transcription workflow', async () => {
    // Setup test audio file
    const audioFile = await setupTestAudioFile('test_meeting.mp3');
    
    // Execute transcription with analytics
    const result = await runSmartTranscribe([
      '--file', audioFile,
      '--quality', 'high',
      '--analytics',
      '--session-id', 'test_session'
    ]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Transcription completed');
    expect(result.stdout).toContain('Quality score:');
    
    // Verify transcript was saved
    const transcript = await getTranscriptFromDatabase(audioFile);
    expect(transcript).toBeDefined();
    expect(transcript.text).toBeString();
    
    // Verify analytics were recorded
    const analytics = await getTranscriptionAnalytics('test_session');
    expect(analytics.file_count).toBe(1);
  });

  it('should handle batch processing with progress tracking', async () => {
    const batchDir = await setupTestAudioBatch(5); // 5 audio files
    
    const result = await runSmartTranscribe([
      '--batch', batchDir,
      '--quality', 'balanced'
    ]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Processed 5 files');
    expect(result.stdout).toContain('100% complete');
    
    // Verify all files were processed
    const transcripts = await getTranscriptsFromBatch(batchDir);
    expect(transcripts).toHaveLength(5);
  });
});
```

## Mock Requirements

### Audio Processing Mocks
- Whisper service responses with varying quality
- Audio file metadata and duration
- Transcription confidence scores

### MCP Server Mocks
- Whisper MCP server availability and responses
- Pattern analysis MCP server integration
- Enhanced processing workflows

### Analytics Mocks
- User transcription history
- Pattern detection results
- Performance metrics data

## Test Data Requirements

### Audio Files
- Various formats (MP3, WAV, M4A, FLAC)
- Different durations (short clips to long recordings)
- Various audio qualities and content types
- Batch processing scenarios

### Transcription Scenarios
- High-quality clear speech
- Noisy or low-quality audio
- Multiple speakers
- Technical or domain-specific content

## Success Criteria

- [ ] All CLI arguments are properly parsed and validated
- [ ] Audio file validation catches all error conditions
- [ ] Transcription works for all supported formats and quality levels
- [ ] MCP integration functions with proper fallbacks
- [ ] Analytics and feedback collection work reliably
- [ ] Batch processing handles large sets efficiently
- [ ] Error handling provides clear user feedback

## Implementation Priority

1. **High Priority**: CLI parsing, file validation, basic transcription
2. **Medium Priority**: MCP integration, analytics, feedback collection
3. **Low Priority**: Advanced recommendations, performance optimization

## Dependencies

- Whisper service for transcription processing
- MCP client for server integration
- Analytics system for pattern tracking
- Database for transcript and feedback storage
