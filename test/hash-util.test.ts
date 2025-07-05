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

  it('generates different hashes for different content', async () => {
    const file1 = join(dir, 'file1.txt');
    const file2 = join(dir, 'file2.txt');

    await fs.writeFile(file1, 'content1');
    await fs.writeFile(file2, 'content2');

    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);

    expect(hash1).not.toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
    expect(hash2).toHaveLength(64);
  });

  it('generates consistent hashes for same content', async () => {
    const file1 = join(dir, 'file1.txt');
    const file2 = join(dir, 'file2.txt');
    const content = 'identical content';

    await fs.writeFile(file1, content);
    await fs.writeFile(file2, content);

    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);

    expect(hash1).toBe(hash2);
  });

  it('handles empty files', async () => {
    const file = join(dir, 'empty.txt');
    await fs.writeFile(file, '');

    const hash = await hashFile(file);

    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hash).toHaveLength(64);
  });

  it('handles binary files', async () => {
    const file = join(dir, 'binary.bin');
    const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
    await fs.writeFile(file, binaryData);

    const hash = await hashFile(file);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // Valid hex string
  });

  it('handles large files', async () => {
    const file = join(dir, 'large.txt');
    const largeContent = 'x'.repeat(10000); // 10KB file
    await fs.writeFile(file, largeContent);

    const hash = await hashFile(file);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws error for non-existent files', async () => {
    const nonExistentFile = join(dir, 'does-not-exist.txt');

    await expect(hashFile(nonExistentFile)).rejects.toThrow();
  });

  it('handles files with special characters in content', async () => {
    const file = join(dir, 'special.txt');
    const specialContent = 'Hello 世界! 🌍 \n\t\r Special chars: àáâãäåæçèéêë';
    await fs.writeFile(file, specialContent, 'utf-8');

    const hash = await hashFile(file);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
