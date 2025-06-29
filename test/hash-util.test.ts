import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';

// Import with query parameter to avoid mocks from other tests
import { hashFile } from '../src/utils/hash.ts?actual';

describe('hashFile utility', () => {
  const dir = '/tmp/hash-test';

  beforeEach(async () => {
    await fs.mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('generates expected SHA-256 hash for known content', async () => {
    const file = join(dir, 'hello.txt');
    await fs.writeFile(file, 'hello world');
    const hash = await hashFile(file);
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });
});
