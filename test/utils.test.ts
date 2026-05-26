import { describe, it, expect } from 'vitest';
import { resolveRef, calculateHash, extractBaseUrl } from '../src/shared/utils';

describe('resolveRef', () => {
  const doc = {
    components: {
      schemas: {
        User: { type: 'object', properties: { id: { type: 'string' } } },
        Order: { type: 'object', properties: { total: { type: 'number' } } },
      },
      parameters: {
        UserIdParam: { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      },
      responses: {
        NotFound: { description: 'Not found' },
      },
    },
    paths: {
      '/users': {
        get: { summary: 'List users' },
      },
    },
  };

  it('resolves #/components/schemas/User', () => {
    const result = resolveRef('#/components/schemas/User', doc);
    expect(result).toEqual(doc.components.schemas.User);
  });

  it('resolves #/components/parameters/UserIdParam', () => {
    const result = resolveRef('#/components/parameters/UserIdParam', doc);
    expect(result).toEqual(doc.components.parameters.UserIdParam);
  });

  it('resolves #/components/responses/NotFound', () => {
    const result = resolveRef('#/components/responses/NotFound', doc);
    expect(result).toEqual(doc.components.responses.NotFound);
  });

  it('resolves #/paths/~1users/get', () => {
    const result = resolveRef('#/paths/~1users/get', doc);
    expect(result).toEqual(doc.paths['/users'].get);
  });

  it('returns null for null refPath', () => {
    expect(resolveRef(null as any, doc)).toBeNull();
  });

  it('returns null for undefined refPath', () => {
    expect(resolveRef(undefined as any, doc)).toBeNull();
  });

  it('returns null for non-# ref', () => {
    expect(resolveRef('https://example.com/schema', doc)).toBeNull();
  });

  it('returns null for non-existent path', () => {
    expect(resolveRef('#/components/schemas/NonExistent', doc)).toBeNull();
  });

  it('handles URI-encoded characters (~0 for ~, ~1 for /)', () => {
    const docWithSpecialChars = {
      'special~name': {
        'deep/path': 'found',
      },
    };
    expect(resolveRef('#/special~0name/deep~1path', docWithSpecialChars)).toBe('found');
  });

  it('returns null when intermediate path is not an object', () => {
    expect(resolveRef('#/components/schemas/User/id/foo', doc)).toBeNull();
  });

  it('returns null when intermediate path is null', () => {
    const docWithNull = { components: null };
    expect(resolveRef('#/components/schemas/User', docWithNull)).toBeNull();
  });
});

describe('calculateHash', () => {
  it('returns consistent SHA-256 hash', () => {
    const content = 'hello world';
    const hash = calculateHash(content);
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('returns different hashes for different content', () => {
    const hash1 = calculateHash('content A');
    const hash2 = calculateHash('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('returns same hash for same content', () => {
    const hash1 = calculateHash('same content');
    const hash2 = calculateHash('same content');
    expect(hash1).toBe(hash2);
  });

  it('returns a 64-character hex string', () => {
    const hash = calculateHash('test');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('handles empty string', () => {
    const hash = calculateHash('');
    expect(hash).toHaveLength(64);
  });
});

describe('extractBaseUrl', () => {
  it('extracts base URL from HTTP URL', () => {
    expect(extractBaseUrl('http://localhost:8080/v3/api-docs')).toBe('http://localhost:8080');
  });

  it('extracts base URL from HTTPS URL', () => {
    expect(extractBaseUrl('https://api.example.com/v1/spec')).toBe('https://api.example.com');
  });

  it('extracts base URL with custom port', () => {
    expect(extractBaseUrl('http://example.com:3000/api')).toBe('http://example.com:3000');
  });

  it('extracts base URL with default port', () => {
    expect(extractBaseUrl('https://example.com/api/docs')).toBe('https://example.com');
  });
});
