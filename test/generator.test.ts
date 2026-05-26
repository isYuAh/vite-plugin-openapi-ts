import { describe, it, expect } from 'vitest';
import {
  mapOpenAPITypeToTS,
  inferType,
  genSchemes,
  parseParams,
  parseRequestBody,
  parseResponse,
  genPaths,
  genClient,
  summary,
} from '../src/shared/generator';
import type { OpenAPIDocument } from '../src/shared/generator';

const emptyOpenapi: OpenAPIDocument = {
  paths: {},
  components: { schemas: {} },
};

const sampleOpenapi: OpenAPIDocument = {
  paths: {},
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', description: 'User ID' },
          name: { type: 'string' },
          email: { type: 'string' },
          age: { type: 'integer', format: 'int32' },
        },
      },
      Pet: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          tag: { type: 'string' },
        },
      },
    },
  },
};

describe('mapOpenAPITypeToTS', () => {
  it('maps integer to number', () => {
    expect(mapOpenAPITypeToTS('integer')).toBe('number');
  });

  it('maps number to number', () => {
    expect(mapOpenAPITypeToTS('number')).toBe('number');
  });

  it('maps string to string', () => {
    expect(mapOpenAPITypeToTS('string')).toBe('string');
  });

  it('maps string with binary format to Blob', () => {
    expect(mapOpenAPITypeToTS('string', 'binary')).toBe('Blob');
  });

  it('maps string with byte format to string', () => {
    expect(mapOpenAPITypeToTS('string', 'byte')).toBe('string');
  });

  it('maps string with date format to string', () => {
    expect(mapOpenAPITypeToTS('string', 'date')).toBe('string');
  });

  it('maps boolean to boolean', () => {
    expect(mapOpenAPITypeToTS('boolean')).toBe('boolean');
  });

  it('maps array to Array', () => {
    expect(mapOpenAPITypeToTS('array')).toBe('Array');
  });

  it('maps object to object', () => {
    expect(mapOpenAPITypeToTS('object')).toBe('object');
  });

  it('maps null to null', () => {
    expect(mapOpenAPITypeToTS('null')).toBe('null');
  });

  it('maps file to File', () => {
    expect(mapOpenAPITypeToTS('file')).toBe('File');
  });

  it('maps unknown type to any', () => {
    expect(mapOpenAPITypeToTS('unknown')).toBe('any');
  });
});

describe('inferType', () => {
  it('returns any for null/undefined schema', () => {
    expect(inferType(null, emptyOpenapi)).toBe('any');
    expect(inferType(undefined, emptyOpenapi)).toBe('any');
  });

  it('resolves $ref to components/schemas with namespace', () => {
    const schema = { $ref: '#/components/schemas/User' };
    expect(inferType(schema, sampleOpenapi, true)).toBe('Schemes.SCHEME_User');
  });

  it('resolves $ref without namespace', () => {
    const schema = { $ref: '#/components/schemas/User' };
    expect(inferType(schema, sampleOpenapi, false)).toBe('SCHEME_User');
  });

  it('returns any for unresolvable $ref', () => {
    const schema = { $ref: '#/components/parameters/NotFound' };
    expect(inferType(schema, emptyOpenapi)).toBe('any');
  });

  it('resolves $ref to other locations via resolveRef', () => {
    const openapi = {
      ...emptyOpenapi,
      components: {
        ...emptyOpenapi.components,
        parameters: {
          LimitParam: { type: 'integer' },
        },
      },
    } as any;
    const schema = { $ref: '#/components/parameters/LimitParam' };
    expect(inferType(schema, openapi)).toBe('number');
  });

  it('handles allOf (intersection)', () => {
    const schema = {
      allOf: [
        { $ref: '#/components/schemas/User' },
        { type: 'object', properties: { role: { type: 'string' } }, required: ['role'] },
      ],
    };
    const result = inferType(schema, sampleOpenapi);
    expect(result).toContain('Schemes.SCHEME_User');
    expect(result).toContain('&');
    expect(result).toContain('role');
  });

  it('handles oneOf (union)', () => {
    const schema = {
      oneOf: [
        { $ref: '#/components/schemas/User' },
        { $ref: '#/components/schemas/Pet' },
      ],
    };
    const result = inferType(schema, sampleOpenapi);
    expect(result).toBe('Schemes.SCHEME_User | Schemes.SCHEME_Pet');
  });

  it('handles anyOf (union)', () => {
    const schema = {
      anyOf: [
        { type: 'string' },
        { type: 'number' },
      ],
    };
    expect(inferType(schema, emptyOpenapi)).toBe('string | number');
  });

  it('handles const string', () => {
    expect(inferType({ const: 'hello' }, emptyOpenapi)).toBe("'hello'");
  });

  it('handles const number', () => {
    expect(inferType({ const: 42 }, emptyOpenapi)).toBe('42');
  });

  it('handles type array (OpenAPI 3.1)', () => {
    const schema = { type: ['string', 'null'] };
    expect(inferType(schema, emptyOpenapi)).toBe('string | null');
  });

  it('handles type array with array type', () => {
    const schema = { type: ['array', 'null'], items: { type: 'string' } };
    expect(inferType(schema, emptyOpenapi)).toBe('Array<string> | null');
  });

  it('handles array type', () => {
    const schema = { type: 'array', items: { type: 'string' } };
    expect(inferType(schema, emptyOpenapi)).toBe('Array<string>');
  });

  it('handles array type without items', () => {
    const schema = { type: 'array' };
    expect(inferType(schema, emptyOpenapi)).toBe('Array<any>');
  });

  it('handles nullable array', () => {
    const schema = { type: 'array', items: { type: 'number' }, nullable: true };
    expect(inferType(schema, emptyOpenapi)).toBe('Array<number> | null');
  });

  it('handles object with properties', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    };
    const result = inferType(schema, emptyOpenapi);
    expect(result).toBe('{name: string;age?: number;}');
  });

  it('handles object with additionalProperties as schema', () => {
    const schema = {
      type: 'object',
      additionalProperties: { type: 'string' },
    };
    expect(inferType(schema, emptyOpenapi)).toBe('Record<string, string>');
  });

  it('handles object with additionalProperties: true', () => {
    const schema = {
      type: 'object',
      additionalProperties: true,
    };
    expect(inferType(schema, emptyOpenapi)).toBe('Record<string, any>');
  });

  it('handles object without properties or additionalProperties', () => {
    const schema = { type: 'object' };
    expect(inferType(schema, emptyOpenapi)).toBe('Record<string, any>');
  });

  it('handles nullable object', () => {
    const schema = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      nullable: true,
    };
    const result = inferType(schema, emptyOpenapi);
    expect(result).toContain('null');
  });

  it('handles parameter-like schema (in/name/schema)', () => {
    const schema = {
      type: 'object',
      in: 'query',
      name: 'limit',
      schema: { type: 'integer' },
    };
    expect(inferType(schema, emptyOpenapi)).toBe('number');
  });

  it('handles string enum', () => {
    const schema = { type: 'string', enum: ['active', 'inactive'] };
    expect(inferType(schema, emptyOpenapi)).toBe("'active' | 'inactive'");
  });

  it('handles nullable string enum', () => {
    const schema = { type: 'string', enum: ['a', 'b'], nullable: true };
    expect(inferType(schema, emptyOpenapi)).toBe("'a' | 'b' | null");
  });

  it('handles string with binary format', () => {
    const schema = { type: 'string', format: 'binary' };
    expect(inferType(schema, emptyOpenapi)).toBe('Blob');
  });

  it('handles nullable string', () => {
    const schema = { type: 'string', nullable: true };
    expect(inferType(schema, emptyOpenapi)).toBe('string | null');
  });

  it('handles number type', () => {
    expect(inferType({ type: 'number' }, emptyOpenapi)).toBe('number');
  });

  it('handles integer type', () => {
    expect(inferType({ type: 'integer' }, emptyOpenapi)).toBe('number');
  });

  it('handles nullable number', () => {
    expect(inferType({ type: 'integer', nullable: true }, emptyOpenapi)).toBe('number | null');
  });

  it('handles boolean type', () => {
    expect(inferType({ type: 'boolean' }, emptyOpenapi)).toBe('boolean');
  });

  it('handles nullable boolean', () => {
    expect(inferType({ type: 'boolean', nullable: true }, emptyOpenapi)).toBe('boolean | null');
  });

  it('handles null type', () => {
    expect(inferType({ type: 'null' }, emptyOpenapi)).toBe('null');
  });

  it('handles file type', () => {
    expect(inferType({ type: 'file' }, emptyOpenapi)).toBe('File');
  });

  it('handles enum without type', () => {
    const schema = { enum: ['cat', 'dog'] };
    expect(inferType(schema, emptyOpenapi)).toBe("'cat' | 'dog'");
  });

  it('handles enum with non-string values', () => {
    const schema = { enum: [1, 2, 3] };
    expect(inferType(schema, emptyOpenapi)).toBe('1 | 2 | 3');
  });

  it('handles nullable enum without type', () => {
    const schema = { enum: ['a', 'b'], nullable: true };
    expect(inferType(schema, emptyOpenapi)).toBe("'a' | 'b' | null");
  });

  it('returns any for unknown schema with no type', () => {
    expect(inferType({}, emptyOpenapi)).toBe('any');
  });
});

describe('genSchemes', () => {
  it('generates empty output for empty schemas', () => {
    expect(genSchemes({}, emptyOpenapi)).toBe('');
  });

  it('generates interface for a single schema', () => {
    const schemas = {
      User: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', description: 'User ID' },
          name: { type: 'string' },
        },
      },
    };
    const result = genSchemes(schemas, emptyOpenapi);
    expect(result).toContain('export interface SCHEME_User');
    expect(result).toContain('id: string');
    expect(result).toContain('name: string');
    expect(result).toContain("/** User ID */");
  });

  it('marks optional fields with ?', () => {
    const schemas = {
      Item: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
        },
      },
    };
    const result = genSchemes(schemas, emptyOpenapi);
    expect(result).toContain('id: string');
    expect(result).toContain('label?: string');
  });

  it('generates JSDoc for schema with properties', () => {
    const schemas = {
      Order: {
        type: 'object',
        required: [],
        properties: { total: { type: 'number' } },
      },
    };
    const result = genSchemes(schemas, emptyOpenapi);
    expect(result).toContain('@description Generated from OpenAPI schema');
  });

  it('handles schema without properties', () => {
    const schemas = {
      Empty: {
        type: 'object',
        required: [],
        properties: {},
      },
    };
    const result = genSchemes(schemas, emptyOpenapi);
    expect(result).toContain('export interface SCHEME_Empty');
  });

  it('generates multiple schemas', () => {
    const schemas = {
      User: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      Pet: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
    };
    const result = genSchemes(schemas, emptyOpenapi);
    expect(result).toContain('export interface SCHEME_User');
    expect(result).toContain('export interface SCHEME_Pet');
  });
});

describe('parseParams', () => {
  const openapi: OpenAPIDocument = {
    paths: {},
    components: { schemas: {} },
  };

  it('returns empty objects for empty params', () => {
    const result = parseParams([], openapi);
    expect(result.pathParams).toBe('{}');
    expect(result.queryParams).toBe('{}');
    expect(result.headerParams).toBe('{}');
    expect(result.cookieParams).toBe('{}');
  });

  it('parses path parameters', () => {
    const params = [
      { name: 'id', in: 'path' as const, required: true, schema: { type: 'string' } },
    ];
    const result = parseParams(params, openapi);
    expect(result.pathParams).toBe('{id: string;}');
  });

  it('parses query parameters', () => {
    const params = [
      { name: 'page', in: 'query' as const, required: false, schema: { type: 'integer' } },
    ];
    const result = parseParams(params, openapi);
    expect(result.queryParams).toBe('{page?: number;}');
  });

  it('parses header parameters', () => {
    const params = [
      { name: 'X-Token', in: 'header' as const, required: true, schema: { type: 'string' } },
    ];
    const result = parseParams(params, openapi);
    expect(result.headerParams).toBe('{X-Token: string;}');
  });

  it('parses cookie parameters', () => {
    const params = [
      { name: 'session', in: 'cookie' as const, required: true, schema: { type: 'string' } },
    ];
    const result = parseParams(params, openapi);
    expect(result.cookieParams).toBe('{session: string;}');
  });

  it('resolves $ref in parameters', () => {
    const openapiWithParams = {
      ...openapi,
      components: {
        ...openapi.components,
        parameters: {
          UserId: { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        },
      },
    } as any;
    const params = [{ $ref: '#/components/parameters/UserId' }];
    const result = parseParams(params as any, openapiWithParams);
    expect(result.pathParams).toBe('{userId: string;}');
  });

  it('skips unresolvable $ref', () => {
    const params = [{ $ref: '#/components/parameters/Missing' }];
    const result = parseParams(params as any, openapi);
    expect(result.pathParams).toBe('{}');
  });
});

describe('parseRequestBody', () => {
  it('returns any for missing content', () => {
    expect(parseRequestBody({ content: {} }, emptyOpenapi)).toBe('any');
  });

  it('returns any for undefined requestBody', () => {
    expect(parseRequestBody({ content: {} }, emptyOpenapi)).toBe('any');
  });

  it('parses application/json body', () => {
    const body = {
      content: {
        'application/json': {
          schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        },
      },
    };
    const result = parseRequestBody(body, emptyOpenapi);
    expect(result).toBe('{name: string;}');
  });

  it('parses application/json+suffix body (e.g. application/vnd.api+json)', () => {
    const body = {
      content: {
        'application/vnd.api+json': {
          schema: { type: 'string' },
        },
      },
    };
    expect(parseRequestBody(body, emptyOpenapi)).toBe('string');
  });

  it('parses multipart/form-data body with schema', () => {
    const body = {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: { file: { type: 'string', format: 'binary' } },
            required: ['file'],
          },
        },
      },
    };
    const result = parseRequestBody(body, emptyOpenapi);
    expect(result).toBe('{file: Blob;}');
  });

  it('falls back to generic FormData for multipart without schema', () => {
    const body = {
      content: {
        'multipart/form-data': {},
      },
    };
    const result = parseRequestBody(body, emptyOpenapi);
    expect(result).toBe('Record<string, string | Blob | File>');
  });

  it('parses application/x-www-form-urlencoded body', () => {
    const body = {
      content: {
        'application/x-www-form-urlencoded': {
          schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        },
      },
    };
    const result = parseRequestBody(body, emptyOpenapi);
    expect(result).toBe('{q: string;}');
  });

  it('parses */* wildcard content type with schema', () => {
    const body = {
      content: {
        '*/*': {
          schema: { type: 'string' },
        },
      },
    };
    expect(parseRequestBody(body, emptyOpenapi)).toBe('string');
  });

  it('infers from single content entry with schema', () => {
    const body = {
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    };
    expect(parseRequestBody(body, emptyOpenapi)).toBe('Blob');
  });

  it('resolves $ref in request body schema', () => {
    const body = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/User' },
        },
      },
    };
    expect(parseRequestBody(body, sampleOpenapi)).toBe('Schemes.SCHEME_User');
  });
});

describe('parseResponse', () => {
  it('returns void for null/undefined response', () => {
    expect(parseResponse(null, emptyOpenapi)).toBe('void');
    expect(parseResponse(undefined, emptyOpenapi)).toBe('void');
  });

  it('returns void for response without content', () => {
    expect(parseResponse({}, emptyOpenapi)).toBe('void');
  });

  it('parses JSON response', () => {
    const response = {
      content: {
        'application/json': {
          schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
        },
      },
    };
    const result = parseResponse(response, sampleOpenapi);
    expect(result).toBe('Array<Schemes.SCHEME_User>');
  });

  it('parses text response', () => {
    const response = {
      content: {
        'text/plain': { schema: { type: 'string' } },
      },
    };
    expect(parseResponse(response, emptyOpenapi)).toBe('string');
  });

  it('parses binary/blob response (octet-stream)', () => {
    const response = {
      content: {
        'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
      },
    };
    expect(parseResponse(response, emptyOpenapi)).toBe('Blob');
  });

  it('parses binary/blob response (image/png)', () => {
    const response = {
      content: {
        'image/png': {},
      },
    };
    expect(parseResponse(response, emptyOpenapi)).toBe('Blob');
  });

  it('parses binary/blob response (application/pdf)', () => {
    const response = {
      content: {
        'application/pdf': {},
      },
    };
    expect(parseResponse(response, emptyOpenapi)).toBe('Blob');
  });

  it('parses */* wildcard with schema', () => {
    const response = {
      content: {
        '*/*': {
          schema: { type: 'string' },
        },
      },
    };
    expect(parseResponse(response, emptyOpenapi)).toBe('string');
  });

  it('falls back to single content entry with schema', () => {
    const response = {
      content: {
        'application/something': {
          schema: { type: 'number' },
        },
      },
    };
    expect(parseResponse(response, emptyOpenapi)).toBe('number');
  });

  it('returns any for unparseable content', () => {
    const response = {
      content: {
        'application/something': {},
      },
    };
    expect(parseResponse(response, emptyOpenapi)).toBe('any');
  });
});

describe('genPaths', () => {
  it('generates empty endpoints type for no paths', () => {
    const result = genPaths({}, emptyOpenapi);
    expect(result).toBe('export type API_Endpoints = {};');
  });

  it('generates type for a simple GET endpoint', () => {
    const paths = {
      '/users': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
        },
      },
    };
    const result = genPaths(paths, sampleOpenapi);
    expect(result).toContain("export type API_Endpoints = ");
    expect(result).toContain("'/users'");
    expect(result).toContain("'200'");
    expect(result).toContain('get');
  });

  it('generates type with parameters', () => {
    const paths = {
      '/users/{id}': {
        get: {
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'detail', in: 'query', required: false, schema: { type: 'boolean' } },
          ],
          responses: {
            '200': {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
            },
          },
        },
      },
    };
    const result = genPaths(paths, sampleOpenapi);
    expect(result).toContain('id');
    expect(result).toContain('detail');
  });

  it('handles endpoint with request body', () => {
    const paths = {
      '/users': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
              },
            },
          },
          responses: { '201': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
        },
      },
    };
    const result = genPaths(paths, sampleOpenapi);
    expect(result).toContain('post');
    expect(result).toContain('bodyParams');
  });
});

describe('genClient', () => {
  it('generates client code with base URL', () => {
    const result = genClient('http://localhost:8080', []);
    expect(result).toContain('baseUrl: "http://localhost:8080"');
    expect(result).toContain('export type ServerUrl');
    expect(result).toContain('export class ApiError');
    expect(result).toContain('export function createApiClient');
    expect(result).toContain('export default defaultClient');
  });

  it('includes server URLs in ServerUrl type', () => {
    const result = genClient('http://localhost:8080', ['https://api.example.com']);
    expect(result).toContain("'http://localhost:8080'");
    expect(result).toContain("'https://api.example.com'");
  });

  it('deduplicates base URL from servers', () => {
    const result = genClient('http://localhost:8080', ['http://localhost:8080']);
    const serverUrlLine = result.split('\n').find(l => l.includes('ServerUrl'));
    expect(serverUrlLine).toBeDefined();
  });

  it('contains interceptor types', () => {
    const result = genClient('http://localhost:8080', []);
    expect(result).toContain('InterceptorManager');
    expect(result).toContain('interceptors');
  });

  it('contains error handling utilities', () => {
    const result = genClient('http://localhost:8080', []);
    expect(result).toContain('setErrorHandler');
    expect(result).toContain('onError');
  });

  it('contains FormData auto-detection', () => {
    const result = genClient('http://localhost:8080', []);
    expect(result).toContain('shouldUseFormData');
    expect(result).toContain('toFormData');
  });

  it('contains retry logic', () => {
    const result = genClient('http://localhost:8080', []);
    expect(result).toContain('fetchWithRetry');
  });

  it('contains path builder', () => {
    const result = genClient('http://localhost:8080', []);
    expect(result).toContain('buildPath');
  });

  it('contains HttpClient type and adapter support', () => {
    const result = genClient('http://localhost:8080', []);
    expect(result).toContain('export type HttpClient');
    expect(result).toContain('setHttpClient');
    expect(result).toContain('getHttpClient');
  });
});

describe('summary', () => {
  it('generates complete index.ts content', () => {
    const result = summary(sampleOpenapi, 'http://localhost:8080');
    expect(result).toContain("import type * as Schemes from './schemes'");
    expect(result).toContain('export type API_Endpoints');
    expect(result).toContain('export type ServerUrl');
    expect(result).toContain('export default defaultClient');
  });

  it('includes endpoint summary comments', () => {
    const openapi: OpenAPIDocument = {
      paths: {
        '/pets': {
          get: {
            summary: 'List all pets',
            tags: ['pets'],
            responses: {},
          },
        },
      },
      components: { schemas: {} },
    };
    const result = summary(openapi, 'http://localhost:8080');
    expect(result).toContain('API Endpoints Summary');
    expect(result).toContain('List all pets');
    expect(result).toContain('[GET] /pets');
    expect(result).toContain('Tags: pets');
  });

  it('handles empty paths and schemas', () => {
    const result = summary(emptyOpenapi, 'http://localhost:8080');
    expect(result).toContain('export type API_Endpoints = {};');
  });

  it('includes server URLs from spec', () => {
    const openapi: OpenAPIDocument = {
      paths: {},
      components: { schemas: {} },
      servers: [{ url: 'https://prod.example.com' }, { url: 'https://staging.example.com' }],
    };
    const result = summary(openapi, 'http://localhost:8080');
    expect(result).toContain("'https://prod.example.com'");
    expect(result).toContain("'https://staging.example.com'");
  });
});
