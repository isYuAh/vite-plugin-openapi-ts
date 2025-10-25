# vite-plugin-openapi-ts

🚀 A Vite plugin that automatically generates TypeScript types and a type-safe API client from OpenAPI (Swagger) specifications.

## Features

- ✨ **Automatic Code Generation**: Generate TypeScript types and API client from OpenAPI spec
- 🔒 **Type-Safe**: Fully typed API client with IntelliSense support
- 🎯 **Framework Agnostic**: Works with Vue, React, Svelte, or any Vite project
- 📦 **Zero Configuration**: Works out of the box with sensible defaults
- 🔄 **Auto-Sync**: Regenerates types on every build

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

### 2. Use the generated client

```ts
import apiClient from './openapi';

// All endpoints are fully typed!
const { data } = await apiClient(
  '/users/{id}',
  'get',
  {},
  { id: '123' }
);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | *required* | URL to your OpenAPI specification (JSON) |
| `baseUrl` | `string` | `http://localhost:8080` | Base URL for API requests |
| `outputDir` | `string` | `src/openapi` | Directory where types will be generated |

## License

MIT
