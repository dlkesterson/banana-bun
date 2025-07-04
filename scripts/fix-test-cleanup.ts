#!/usr/bin/env bun

/**
 * Script to fix missing mock.restore() cleanup in test files
 * This addresses the test isolation issues identified in the test refactor plan
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const testFiles = [
  'test/mcp-client.test.ts',
  'test/mcp-manager.test.ts',
  'test/media-executor.test.ts',
  'test/media-organizer.test.ts',
  'test/metadata-optimization-server.test.ts',
  'test/monitor-server.test.ts',
  'test/new-mcp-servers-integration.test.ts',
  'test/pattern-analysis-server.test.ts',
  'test/phase2-summarization.test.ts',
  'test/planner-service.db.test.ts',
  'test/planner-service.integration.test.ts',
  'test/planner-service.test.ts',
  'test/recommend-executor.test.ts',
  'test/resource-optimization-server.test.ts',
  'test/retry-system.test.ts',
  'test/review-service.db.test.ts',
  'test/review-service.integration.test.ts',
  'test/review-service.test.ts',
  'test/scene-detect-executor.test.ts',
  'test/search-logs.test.ts',
  'test/services.integration.test.ts',
  'test/smart-transcribe.test.ts',
  'test/tag-executor.test.ts',
  'test/tool-executor.test.ts',
  'test/tool-runner.basic.test.ts',
  'test/tool-runner.test.ts',
  'test/transcribe-executor.test.ts'
];

function fixTestFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Check if file uses mock.module
    if (!content.includes('mock.module')) {
      console.log(`⏭️  Skipping ${filePath} - no mock.module found`);
      return;
    }
    
    // Check if file already has mock.restore
    if (content.includes('mock.restore')) {
      console.log(`✅ ${filePath} - already has mock.restore()`);
      return;
    }
    
    let newContent = content;
    
    // Add afterAll import if not present
    if (content.includes('import { describe, it, expect') && !content.includes('afterAll')) {
      newContent = newContent.replace(
        /import { ([^}]+) } from 'bun:test';/,
        (match, imports) => {
          if (!imports.includes('afterAll')) {
            return `import { ${imports}, afterAll } from 'bun:test';`;
          }
          return match;
        }
      );
    }
    
    // Add afterAll cleanup at the end of the file
    if (!newContent.includes('afterAll(')) {
      // Find the last closing brace and add cleanup before it
      const lines = newContent.split('\n');
      let lastNonEmptyIndex = lines.length - 1;
      
      // Find the last non-empty line
      while (lastNonEmptyIndex >= 0 && lines[lastNonEmptyIndex].trim() === '') {
        lastNonEmptyIndex--;
      }
      
      // Insert the cleanup before the last line
      lines.splice(lastNonEmptyIndex + 1, 0, '', 'afterAll(() => {', '  mock.restore();', '});');
      newContent = lines.join('\n');
    }
    
    writeFileSync(filePath, newContent);
    console.log(`🔧 Fixed ${filePath}`);
    
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error);
  }
}

console.log('🧪 Fixing test cleanup issues...\n');

for (const file of testFiles) {
  fixTestFile(file);
}

console.log('\n✨ Test cleanup fixes completed!');
