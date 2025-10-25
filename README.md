# vite-plugin-openapi-ts

🚀 A Vite plugin that automatically generates TypeScript types and a type-safe API client from OpenAPI (Swagger) specifications.

English | [简体中文](./README.zh-CN.md)

## Features

- ✨ **Automatic Code Generation**: Generate TypeScript types and API client from OpenAPI spec
- 🔒 **Type-Safe**: Fully typed API client with IntelliSense support
- 🎯 **Framework Agnostic**: Works with Vue, React, Svelte, or any Vite project
- 📦 **Zero Configuration**: Works out of the box with sensible defaults
- 🔄 **Auto-Sync**: Regenerates types on every build
- 📄 **Multiple Formats**: Supports both JSON and YAML OpenAPI specifications
- 🌐 **OpenAPI 3.0 & 3.1**: Full compatibility with both versions

## Installation

```bash
pnpm add -D vite-plugin-openapi-ts
```

## Usage

### 1. Configure the plugin

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import openapiPlugin from 'vite-plugin-openapi-ts';

export default defineConfig({
  plugins: [
    openapiPlugin({
      url: 'http://localhost:8080/v3/api-docs',
      baseUrl: 'http://localhost:8080',
      outputDir: 'src/openapi' // optional, default: 'src/openapi'
    })
  ]
});
```

**YAML Format Support:**

```ts
export default defineConfig({
  plugins: [
    openapiPlugin({
      // Use YAML format
      url: 'http://localhost:8080/swagger.yaml',
      // or from external sources
      // url: 'https://petstore3.swagger.io/api/v3/openapi.yaml',
      baseUrl: 'http://localhost:8080',
      outputDir: 'src/openapi'
    })
  ]
});
```

### 2. Use the generated client

```ts
import apiClient from './openapi';

// All endpoints are fully typed!
const { data } = await apiClient(
  '/users/{id}',
  'get',
  {
    params: { id: '123' }
  }
);

// With query parameters
const { data: users } = await apiClient(
  '/users',
  'get',
  {
    query: { page: 1, limit: 10 }
  }
);

// With request body
const { data: newUser } = await apiClient(
  '/users',
  'post',
  {
    body: { name: 'John', email: 'john@example.com' }
  }
);

// With headers and cookies
const { data: profile } = await apiClient(
  '/profile',
  'get',
  {
    header: { 'Authorization': 'Bearer token' },
    cookie: { 'session': 'abc123' }
  }
);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | *required* | URL to your OpenAPI specification (supports `.json`, `.yaml`, `.yml`) |
| `baseUrl` | `string` | Auto-detected from URL | Base URL for API requests |
| `outputDir` | `string` | `src/openapi` | Directory where types will be generated |

## Supported Features

### OpenAPI Specification
- ✅ OpenAPI 3.0.x
- ✅ OpenAPI 3.1.x
- ✅ JSON format
- ✅ YAML format
- ✅ Auto-detection of format (by URL extension or Content-Type)

### Schema Features
- ✅ Basic types (string, number, boolean, array, object)
- ✅ References (`$ref`)
- ✅ Composed schemas (`allOf`, `oneOf`, `anyOf`)
- ✅ Enums and const values
- ✅ Nullable types (both `nullable: true` and `type: ["string", "null"]`)
- ✅ JSDoc comments from descriptions

### API Client Features
- ✅ Path parameters
- ✅ Query parameters
- ✅ Header parameters
- ✅ Cookie parameters
- ✅ Request body (JSON, FormData)
- ✅ Response types with status codes
- ✅ Error handling with `ApiError` class
- ✅ Configurable base URL and headers
- ✅ Full TypeScript IntelliSense support

## License

MIT
