# Test Coverage PRD: Media Organizer Utility

**File**: `src/utils/media_organizer.ts`  
**Current Coverage**: ~30% (Minimal coverage)  
**Target Coverage**: 85%  
**Priority**: High  

## Overview

The Media Organizer is a critical utility that handles intelligent file organization, naming conventions, collision resolution, and metadata-driven folder structures. It's essential for the media management workflow and requires comprehensive testing.

## File Purpose

The Media Organizer implements:
- Intelligent media file organization based on metadata
- Template-based folder structure generation
- Filename normalization and collision resolution
- Media type detection and categorization
- Safe file operations with rollback capabilities

## Key Components to Test

### 1. Organization Logic
- Metadata-driven folder structure creation
- Template processing and variable substitution
- File path generation and validation

### 2. File Operations
- Safe file moving with collision detection
- Rollback capabilities for failed operations
- Permission and disk space validation

### 3. Naming Conventions
- Filename normalization and sanitization
- Collision resolution strategies
- Cross-platform compatibility

### 4. Media Type Handling
- TV series vs movie detection
- Season/episode extraction
- Genre-based organization

## Test Assertions

### Unit Tests

#### Organization Strategy
```typescript
describe('MediaOrganizer.organizeMedia', () => {
  it('should organize TV series with season/episode structure', async () => {
    const task: MediaOrganizeTask = {
      id: 1,
      type: 'media_organize',
      source_path: '/incoming/The.Office.S01E01.Pilot.mkv',
      target_base: '/media/tv',
      organization_strategy: 'tv_series',
      template: '{series_name}/Season {season}/{series_name} - S{season:02d}E{episode:02d} - {episode_title}.{ext}'
    };
    
    mockMediaMetadata({
      series_name: 'The Office',
      season: 1,
      episode: 1,
      episode_title: 'Pilot'
    });
    
    const result = await organizer.organizeMedia(task);
    
    expect(result.success).toBe(true);
    expect(result.targetPath).toBe('/media/tv/The Office/Season 1/The Office - S01E01 - Pilot.mkv');
    expect(result.actualPath).toBe(result.targetPath);
  });

  it('should organize movies by genre and year', async () => {
    const task: MediaOrganizeTask = {
      id: 2,
      type: 'media_organize',
      source_path: '/incoming/Inception.2010.1080p.mkv',
      target_base: '/media/movies',
      organization_strategy: 'movie',
      template: '{genre}/{title} ({year})/{title} ({year}).{ext}'
    };
    
    mockMediaMetadata({
      title: 'Inception',
      year: 2010,
      genre: 'Sci-Fi'
    });
    
    const result = await organizer.organizeMedia(task);
    
    expect(result.success).toBe(true);
    expect(result.targetPath).toBe('/media/movies/Sci-Fi/Inception (2010)/Inception (2010).mkv');
  });

  it('should handle missing metadata gracefully', async () => {
    const task: MediaOrganizeTask = {
      source_path: '/incoming/unknown_file.mp4',
      target_base: '/media/unsorted',
      organization_strategy: 'fallback'
    };
    
    mockMediaMetadata({}); // No metadata available
    
    const result = await organizer.organizeMedia(task);
    
    expect(result.success).toBe(true);
    expect(result.targetPath).toContain('/media/unsorted');
    expect(result.targetPath).toContain('unknown_file.mp4');
  });

  it('should validate target paths for security', async () => {
    const maliciousTask: MediaOrganizeTask = {
      source_path: '/incoming/file.mp4',
      target_base: '/media',
      template: '../../../etc/passwd' // Path traversal attempt
    };
    
    await expect(organizer.organizeMedia(maliciousTask))
      .rejects.toThrow('Invalid target path: path traversal detected');
  });
});
```

#### Collision Resolution
```typescript
describe('MediaOrganizer.handleCollisions', () => {
  it('should detect file collisions', async () => {
    const targetPath = '/media/movies/Action/Movie.mkv';
    mockFileExists(targetPath, true);
    
    const collision = await organizer.detectCollision(targetPath);
    expect(collision.exists).toBe(true);
    expect(collision.path).toBe(targetPath);
  });

  it('should resolve collisions with incremental naming', async () => {
    const basePath = '/media/movies/Action/Movie.mkv';
    mockFileExists(basePath, true);
    mockFileExists('/media/movies/Action/Movie (1).mkv', true);
    mockFileExists('/media/movies/Action/Movie (2).mkv', false);
    
    const resolvedPath = await organizer.resolveCollision(basePath);
    expect(resolvedPath).toBe('/media/movies/Action/Movie (2).mkv');
  });

  it('should compare file hashes for duplicate detection', async () => {
    const sourcePath = '/incoming/movie.mkv';
    const targetPath = '/media/movies/movie.mkv';
    const fileHash = 'abc123def456';
    
    mockFileHash(sourcePath, fileHash);
    mockFileHash(targetPath, fileHash);
    
    const isDuplicate = await organizer.isDuplicateFile(sourcePath, targetPath);
    expect(isDuplicate).toBe(true);
  });

  it('should handle different files with same name', async () => {
    const sourcePath = '/incoming/movie.mkv';
    const targetPath = '/media/movies/movie.mkv';
    
    mockFileHash(sourcePath, 'hash1');
    mockFileHash(targetPath, 'hash2');
    
    const isDuplicate = await organizer.isDuplicateFile(sourcePath, targetPath);
    expect(isDuplicate).toBe(false);
  });

  it('should skip organization for exact duplicates', async () => {
    const task: MediaOrganizeTask = {
      source_path: '/incoming/duplicate.mkv',
      target_base: '/media/movies'
    };
    
    mockExactDuplicate('/media/movies/existing.mkv', true);
    
    const result = await organizer.organizeMedia(task);
    
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('duplicate');
  });
});
```

#### Template Processing
```typescript
describe('MediaOrganizer.processTemplate', () => {
  it('should substitute template variables correctly', () => {
    const template = '{series_name}/Season {season}/{series_name} - S{season:02d}E{episode:02d}.{ext}';
    const metadata = {
      series_name: 'Breaking Bad',
      season: 1,
      episode: 3,
      ext: 'mkv'
    };
    
    const result = organizer.processTemplate(template, metadata);
    expect(result).toBe('Breaking Bad/Season 1/Breaking Bad - S01E03.mkv');
  });

  it('should handle missing template variables', () => {
    const template = '{title} ({year})/{title}.{ext}';
    const metadata = {
      title: 'Unknown Movie',
      ext: 'mp4'
      // year is missing
    };
    
    const result = organizer.processTemplate(template, metadata);
    expect(result).toBe('Unknown Movie (Unknown)/Unknown Movie.mp4');
  });

  it('should apply formatting to numeric variables', () => {
    const template = 'S{season:02d}E{episode:02d}';
    const metadata = { season: 1, episode: 5 };
    
    const result = organizer.processTemplate(template, metadata);
    expect(result).toBe('S01E05');
  });

  it('should sanitize template output for filesystem safety', () => {
    const template = '{title}/{title}.{ext}';
    const metadata = {
      title: 'Movie: The "Sequel" <Part 2>',
      ext: 'mkv'
    };
    
    const result = organizer.processTemplate(template, metadata);
    expect(result).toBe('Movie - The Sequel Part 2/Movie - The Sequel Part 2.mkv');
    expect(result).not.toMatch(/[<>:"|?*]/); // No invalid characters
  });
});
```

#### File Operations
```typescript
describe('MediaOrganizer.moveFile', () => {
  it('should move file successfully', async () => {
    const sourcePath = '/incoming/test.mkv';
    const targetPath = '/media/movies/test.mkv';
    
    mockFileExists(sourcePath, true);
    mockFileExists(targetPath, false);
    mockFileMove(sourcePath, targetPath, true);
    
    const result = await organizer.moveFile(sourcePath, targetPath);
    
    expect(result.success).toBe(true);
    expect(result.originalPath).toBe(sourcePath);
    expect(result.actualPath).toBe(targetPath);
  });

  it('should create target directory if it does not exist', async () => {
    const sourcePath = '/incoming/test.mkv';
    const targetPath = '/media/new_folder/test.mkv';
    
    mockDirectoryExists('/media/new_folder', false);
    mockDirectoryCreate('/media/new_folder', true);
    
    const result = await organizer.moveFile(sourcePath, targetPath);
    
    expect(result.success).toBe(true);
    expect(mockDirectoryCreate).toHaveBeenCalledWith('/media/new_folder');
  });

  it('should handle permission errors gracefully', async () => {
    const sourcePath = '/incoming/test.mkv';
    const targetPath = '/readonly/test.mkv';
    
    mockFileMove(sourcePath, targetPath, false, 'Permission denied');
    
    const result = await organizer.moveFile(sourcePath, targetPath);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });

  it('should validate disk space before moving large files', async () => {
    const sourcePath = '/incoming/large_movie.mkv';
    const targetPath = '/media/movies/large_movie.mkv';
    
    mockFileSize(sourcePath, 50 * 1024 * 1024 * 1024); // 50GB
    mockDiskSpace('/media', 10 * 1024 * 1024 * 1024); // 10GB available
    
    const result = await organizer.moveFile(sourcePath, targetPath);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient disk space');
  });
});
```

#### Rollback Operations
```typescript
describe('MediaOrganizer.rollbackOperation', () => {
  it('should rollback successful file move', async () => {
    const operation = {
      type: 'move',
      sourcePath: '/incoming/test.mkv',
      targetPath: '/media/movies/test.mkv',
      completed: true
    };
    
    mockFileExists('/media/movies/test.mkv', true);
    mockFileMove('/media/movies/test.mkv', '/incoming/test.mkv', true);
    
    const result = await organizer.rollbackOperation(operation);
    
    expect(result.success).toBe(true);
    expect(result.restored_path).toBe('/incoming/test.mkv');
  });

  it('should handle rollback of directory creation', async () => {
    const operation = {
      type: 'create_directory',
      path: '/media/new_series',
      completed: true,
      was_empty: true
    };
    
    mockDirectoryEmpty('/media/new_series', true);
    mockDirectoryRemove('/media/new_series', true);
    
    const result = await organizer.rollbackOperation(operation);
    
    expect(result.success).toBe(true);
    expect(mockDirectoryRemove).toHaveBeenCalledWith('/media/new_series');
  });

  it('should not remove non-empty directories during rollback', async () => {
    const operation = {
      type: 'create_directory',
      path: '/media/existing_series',
      completed: true,
      was_empty: false
    };
    
    mockDirectoryEmpty('/media/existing_series', false);
    
    const result = await organizer.rollbackOperation(operation);
    
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('not empty');
  });
});
```

### Integration Tests

#### End-to-End Organization Workflow
```typescript
describe('Media Organization Integration', () => {
  it('should complete full organization workflow', async () => {
    // Setup source file with metadata
    const sourceFile = await setupTestMediaFile({
      path: '/incoming/The.Mandalorian.S01E01.mkv',
      metadata: {
        series_name: 'The Mandalorian',
        season: 1,
        episode: 1,
        episode_title: 'Chapter 1'
      }
    });
    
    const task: MediaOrganizeTask = {
      source_path: sourceFile,
      target_base: '/media/tv',
      organization_strategy: 'tv_series'
    };
    
    const result = await organizer.organizeMedia(task);
    
    expect(result.success).toBe(true);
    expect(result.targetPath).toContain('The Mandalorian');
    expect(result.targetPath).toContain('Season 1');
    
    // Verify file was actually moved
    const fileExists = await checkFileExists(result.actualPath);
    expect(fileExists).toBe(true);
    
    // Verify source file was removed
    const sourceExists = await checkFileExists(sourceFile);
    expect(sourceExists).toBe(false);
  });

  it('should handle batch organization with mixed content types', async () => {
    const files = await setupMixedMediaFiles([
      { type: 'tv_series', path: '/incoming/show.s01e01.mkv' },
      { type: 'movie', path: '/incoming/movie.2020.mp4' },
      { type: 'documentary', path: '/incoming/nature.doc.mkv' }
    ]);
    
    const results = await organizer.organizeBatch(files, '/media');
    
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
    
    // Verify different organization strategies were applied
    expect(results[0].targetPath).toContain('/tv/');
    expect(results[1].targetPath).toContain('/movies/');
    expect(results[2].targetPath).toContain('/documentaries/');
  });
});
```

## Mock Requirements

### File System Mocks
- File existence and metadata checks
- Directory creation and removal
- File move operations with error scenarios
- Disk space and permission validation

### Media Metadata Mocks
- TV series information (season, episode, title)
- Movie metadata (title, year, genre)
- Audio metadata for music organization
- Missing or incomplete metadata scenarios

### Hash Calculation Mocks
- File hash generation for duplicate detection
- Hash comparison for different file sizes
- Performance simulation for large files

## Test Data Requirements

### Media Files
- TV series with proper naming conventions
- Movies with various naming patterns
- Music files with ID3 tags
- Corrupted or incomplete files

### Organization Scenarios
- Simple file moves without conflicts
- Complex nested directory structures
- Collision resolution with multiple duplicates
- Cross-platform path compatibility

## Success Criteria

- [ ] All organization strategies work correctly
- [ ] Collision detection and resolution is reliable
- [ ] Template processing handles all variable types
- [ ] File operations are safe with proper error handling
- [ ] Rollback functionality restores original state
- [ ] Cross-platform compatibility is maintained
- [ ] Performance is acceptable for large file operations

## Implementation Priority

1. **High Priority**: Core organization logic and file operations
2. **Medium Priority**: Collision resolution and template processing
3. **Low Priority**: Rollback operations and performance optimization

## Dependencies

- Media type detection utilities
- Filename normalization functions
- Hash calculation utilities
- Cross-platform path handling
