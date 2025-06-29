# Test Coverage PRD: Banana Summarize CLI

**File**: `src/cli/banana-summarize.ts`  
**Current Coverage**: 0% (No tests)  
**Target Coverage**: 80%  
**Priority**: Medium  

## Overview

The Banana Summarize CLI is a command-line tool for generating AI-powered content summaries from media files. It supports multiple summary styles and integrates with the LLM service for content analysis.

## File Purpose

The Banana Summarize CLI implements:
- Command-line interface for content summarization
- Multiple summary styles (bullet, paragraph, key_points)
- Integration with media metadata system
- Direct and task-based execution modes
- LLM model selection and configuration

## Key Components to Test

### 1. CLI Argument Parsing
- Required and optional parameter handling
- Input validation and error messages
- Help text generation

### 2. Media Validation
- Media ID existence verification
- Content availability checking
- Supported format validation

### 3. Summary Generation
- Different summary styles
- LLM model integration
- Content processing logic

### 4. Output Handling
- Summary formatting and display
- Error reporting and logging
- Task creation vs direct execution

## Test Assertions

### Unit Tests

#### CLI Argument Parsing
```typescript
describe('CLI Argument Parsing', () => {
  it('should parse required media ID parameter', () => {
    const args = ['--media', '123'];
    const options = parseCliArgs(args);
    
    expect(options.mediaId).toBe(123);
  });

  it('should parse optional style parameter', () => {
    const args = ['--media', '123', '--style', 'paragraph'];
    const options = parseCliArgs(args);
    
    expect(options.style).toBe('paragraph');
    expect(['bullet', 'paragraph', 'key_points']).toContain(options.style);
  });

  it('should use default values for optional parameters', () => {
    const args = ['--media', '123'];
    const options = parseCliArgs(args);
    
    expect(options.style).toBe('bullet'); // Default style
    expect(options.force).toBe(false);
    expect(options.direct).toBe(false);
  });

  it('should validate style parameter values', () => {
    const args = ['--media', '123', '--style', 'invalid'];
    
    expect(() => parseCliArgs(args))
      .toThrow('Invalid style. Must be one of: bullet, paragraph, key_points');
  });

  it('should require media ID parameter', () => {
    const args = ['--style', 'bullet'];
    
    expect(() => parseCliArgs(args))
      .toThrow('Media ID is required');
  });

  it('should display help when requested', () => {
    const args = ['--help'];
    const consoleSpy = jest.spyOn(console, 'log');
    
    parseCliArgs(args);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--media'));
  });
});
```

#### Media Validation
```typescript
describe('Media Validation', () => {
  it('should validate media exists in database', async () => {
    const mediaId = 123;
    mockMediaExists(mediaId, true);
    
    const isValid = await validateMediaId(mediaId);
    expect(isValid).toBe(true);
  });

  it('should reject non-existent media ID', async () => {
    const mediaId = 999;
    mockMediaExists(mediaId, false);
    
    await expect(validateMediaId(mediaId))
      .rejects.toThrow('Media with ID 999 not found');
  });

  it('should check for existing summary when not forcing', async () => {
    const mediaId = 123;
    mockExistingSummary(mediaId, 'Existing summary content');
    
    const hasExisting = await checkExistingSummary(mediaId);
    expect(hasExisting).toBe(true);
  });

  it('should validate media has content for summarization', async () => {
    const mediaId = 123;
    mockMediaContent(mediaId, { transcript: 'Video content...', duration: 300 });
    
    const hasContent = await validateMediaContent(mediaId);
    expect(hasContent).toBe(true);
  });

  it('should reject media without sufficient content', async () => {
    const mediaId = 124;
    mockMediaContent(mediaId, { transcript: '', duration: 10 });
    
    await expect(validateMediaContent(mediaId))
      .rejects.toThrow('Media does not have sufficient content for summarization');
  });
});
```

#### Summary Generation
```typescript
describe('Summary Generation', () => {
  it('should generate bullet-point summary', async () => {
    const mediaId = 123;
    const style = 'bullet';
    mockMediaContent(mediaId, { transcript: 'Long video content about cooking...' });
    
    const summary = await generateSummary(mediaId, style);
    
    expect(summary).toContain('•');
    expect(summary.split('•').length).toBeGreaterThan(2);
    expect(summary).not.toContain('\n\n'); // No paragraph breaks
  });

  it('should generate paragraph summary', async () => {
    const mediaId = 123;
    const style = 'paragraph';
    mockMediaContent(mediaId, { transcript: 'Long video content...' });
    
    const summary = await generateSummary(mediaId, style);
    
    expect(summary).toMatch(/^[A-Z].*\./); // Starts with capital, ends with period
    expect(summary.split('\n\n').length).toBeGreaterThan(1); // Multiple paragraphs
  });

  it('should generate key points summary', async () => {
    const mediaId = 123;
    const style = 'key_points';
    mockMediaContent(mediaId, { transcript: 'Educational content...' });
    
    const summary = await generateSummary(mediaId, style);
    
    expect(summary).toContain('Key Points:');
    expect(summary.split('\n').filter(line => line.trim().startsWith('-')).length)
      .toBeGreaterThan(2);
  });

  it('should use specified LLM model', async () => {
    const mediaId = 123;
    const model = 'gpt-4';
    const llmSpy = jest.spyOn(summarizerService, 'generateSummary');
    
    await generateSummary(mediaId, 'bullet', model);
    
    expect(llmSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model })
    );
  });

  it('should handle LLM service errors gracefully', async () => {
    const mediaId = 123;
    mockLLMError('Service temporarily unavailable');
    
    await expect(generateSummary(mediaId, 'bullet'))
      .rejects.toThrow('Failed to generate summary: Service temporarily unavailable');
  });
});
```

#### Task vs Direct Execution
```typescript
describe('Execution Modes', () => {
  it('should create task when not in direct mode', async () => {
    const options = { mediaId: 123, style: 'bullet', direct: false };
    const taskSpy = jest.spyOn(taskSystem, 'createTask');
    
    await executeSummarization(options);
    
    expect(taskSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media_summarize',
        media_id: 123,
        style: 'bullet'
      })
    );
  });

  it('should execute directly when in direct mode', async () => {
    const options = { mediaId: 123, style: 'bullet', direct: true };
    const directSpy = jest.spyOn(summarizerService, 'generateSummary');
    
    await executeSummarization(options);
    
    expect(directSpy).toHaveBeenCalled();
  });

  it('should force regeneration when force flag is set', async () => {
    const options = { mediaId: 123, style: 'bullet', force: true };
    mockExistingSummary(123, 'Old summary');
    
    const result = await executeSummarization(options);
    
    expect(result.regenerated).toBe(true);
    expect(result.summary).not.toBe('Old summary');
  });

  it('should skip generation if summary exists and not forcing', async () => {
    const options = { mediaId: 123, style: 'bullet', force: false };
    mockExistingSummary(123, 'Existing summary');
    
    const result = await executeSummarization(options);
    
    expect(result.skipped).toBe(true);
    expect(result.summary).toBe('Existing summary');
  });
});
```

### Integration Tests

#### End-to-End CLI Execution
```typescript
describe('CLI Integration', () => {
  it('should complete full summarization workflow', async () => {
    // Setup test media with content
    const mediaId = await setupTestMedia({
      title: 'Test Video',
      transcript: 'This is a long video about cooking techniques...',
      duration: 600
    });
    
    // Execute CLI command
    const result = await runCLI(['--media', mediaId.toString(), '--style', 'bullet']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Summary generated successfully');
    expect(result.stdout).toContain('•'); // Bullet points
    
    // Verify summary was saved
    const savedSummary = await getSummaryFromDatabase(mediaId);
    expect(savedSummary).toBeDefined();
    expect(savedSummary.style).toBe('bullet');
  });

  it('should handle missing media gracefully', async () => {
    const result = await runCLI(['--media', '99999']);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Media with ID 99999 not found');
  });

  it('should display help when no arguments provided', async () => {
    const result = await runCLI([]);
    
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--media <id>');
  });
});
```

## Mock Requirements

### Database Mocks
- Media metadata with transcript content
- Existing summary records
- Task creation and tracking

### Service Mocks
- LLM service responses for different styles
- Summarizer service with configurable outputs
- Error scenarios for service failures

### CLI Environment
- Command-line argument simulation
- Console output capture
- Exit code handling

## Test Data Requirements

### Media Content
- Videos with transcripts of varying lengths
- Audio files with speech content
- Media without sufficient content for summarization
- Different content types (educational, entertainment, etc.)

### Summary Examples
- Well-formatted bullet-point summaries
- Coherent paragraph summaries
- Structured key-points summaries
- Edge cases with minimal content

## Success Criteria

- [ ] All CLI arguments are properly parsed and validated
- [ ] Media validation catches all error conditions
- [ ] Summary generation works for all supported styles
- [ ] Task creation and direct execution modes both function
- [ ] Error handling provides clear user feedback
- [ ] Integration tests cover realistic usage scenarios
- [ ] Performance is acceptable for typical media files

## Implementation Priority

1. **High Priority**: CLI parsing, media validation, basic summary generation
2. **Medium Priority**: Different summary styles, error handling
3. **Low Priority**: Performance optimization, advanced features

## Dependencies

- Media metadata system for content access
- LLM service for summary generation
- Task system for asynchronous execution
- Database for summary storage
