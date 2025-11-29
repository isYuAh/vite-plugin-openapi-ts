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
| `url` | `string` | *required* | OpenAPI specification source, supports HTTP/HTTPS URL or local file path (supports `.json`, `.yaml`, `.yml`) |
| `baseUrl` | `string` | Auto-detected from URL | Base URL for API requests. When using a local spec file, you **must** provide this (either in options or `openapi.config.json`) |
| `outputDir` | `string` | `src/openapi` | Directory where types will be generated |
| `enableCache` | `boolean` | `true` | Enable hash-based cache to skip regeneration when the spec content and baseUrl have not changed |
| `skipTimeout` | `number` | `0` | Timeout in milliseconds. When cache is enabled and `force` is `false`, if the last generation is within this duration and `url`/`baseUrl` are unchanged, generation will be skipped |
| `force` | `boolean` | `false` | Force regeneration by bypassing cache and `skipTimeout` |

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
- ✅ Request body (JSON, FormData auto-detection)
- ✅ Response types with status codes
- ✅ Error handling with `ApiError` class
- ✅ Configurable base URL and headers
- ✅ **Request/Response Interceptors**
- ✅ **Request Cancellation (AbortController)**
- ✅ **Timeout Control**
- ✅ **Automatic Retry with Configurable Strategy**
- ✅ **Global Error Handler**
- ✅ **Automatic FormData Conversion for File Uploads**
- ✅ Full TypeScript IntelliSense support

## Advanced Features

### Request/Response Interceptors

```ts
import apiClient, { interceptors } from './openapi';

// Add request interceptor
const removeRequestInterceptor = interceptors.request.use(async (config) => {
  // Add authentication token
  config.headers['Authorization'] = `Bearer ${getToken()}`;
  console.log('Request:', config.method, config.url.pathname);
  return config;
});

// Add response interceptor
interceptors.response.use(async (response) => {
  console.log('Response:', response.response.status);
  return response;
});

// Add error interceptor
interceptors.error.use(async (error) => {
  console.error('Request failed:', error.message);
  if (error.status === 401) {
    // Redirect to login
    window.location.href = '/login';
  }
  throw error;
});

// Remove interceptor when needed
removeRequestInterceptor();
```

### Request Cancellation

```ts
import apiClient from './openapi';

// Create abort controller
const controller = new AbortController();

// Pass signal to request
apiClient('/users', 'get', {
  requestConfig: {
    signal: controller.signal
  }
});

// Cancel request
controller.abort();

// Example: Cancel on component unmount (React)
useEffect(() => {
  const controller = new AbortController();
  
  apiClient('/users', 'get', {
    requestConfig: { signal: controller.signal }
  });
  
  return () => controller.abort();
}, []);
```

### Timeout Control

```ts
import apiClient, { config } from './openapi';

// Set global timeout (default: 30000ms)
config.timeout = 10000; // 10 seconds

// Or set timeout per request
apiClient('/users', 'get', {
  requestConfig: {
    timeout: 5000 // 5 seconds for this request
  }
});
```

### Automatic Retry

```ts
// Simple retry: retry 3 times
apiClient('/users', 'get', {
  requestConfig: {
    retry: 3
  }
});

// Advanced retry with custom strategy
apiClient('/users', 'post', {
  body: { name: 'John' },
  requestConfig: {
    retry: {
      times: 3,
      delay: 1000, // 1 second between retries
      retryOn: (error) => {
        // Only retry on 5xx server errors
        return error.status >= 500;
      }
    }
  }
});
```

### Global Error Handler

```ts
import { setErrorHandler } from './openapi';

// Set global error handler
setErrorHandler((error) => {
  // Show toast notification
  toast.error(error.message);
  
  // Log to error tracking service
  errorTracker.log(error);
});

// Now all errors will be handled globally
apiClient('/users', 'get'); // Errors automatically handled
```

### File Upload with Auto FormData

```ts
// The client automatically detects File/Blob and converts to FormData
const fileInput = document.querySelector('input[type="file"]');

apiClient('/upload', 'post', {
  body: {
    file: fileInput.files[0],     // File object
    username: 'John',              // Regular fields
    metadata: { tags: ['photo'] }  // Objects are JSON stringified
  }
  // Automatically converted to FormData
  // Content-Type header automatically set to multipart/form-data
});

// Multiple files
apiClient('/upload-multiple', 'post', {
  body: {
    files: fileInput.files,  // FileList
    userId: '123'
  }
});
```

### Complete Example

```ts
import apiClient, { config, interceptors, setErrorHandler } from './openapi';

// Global configuration
config.baseUrl = 'https://api.example.com';
config.timeout = 15000;

// Add authentication
interceptors.request.use(async (config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh
interceptors.error.use(async (error) => {
  if (error.status === 401) {
    await refreshToken();
    // Retry the request
  }
  throw error;
});

// Global error handling
setErrorHandler((error) => {
  if (error.status === 0) {
    toast.error('Network error. Please check your connection.');
  } else {
    toast.error(error.message);
  }
});

// Make requests with all features
const controller = new AbortController();

const { data } = await apiClient('/users', 'get', {
  query: { page: 1 },
  requestConfig: {
    timeout: 5000,
    retry: 3,
    signal: controller.signal
  }
});
```

## Configuration via `openapi.config.json`

You can configure both the Vite plugin and the CLI via a shared `openapi.config.json` file placed at your project root.

Example:

```json
{
  "url": "http://localhost:8080/v3/api-docs",
  "baseUrl": "http://localhost:8080",
  "outputDir": "src/openapi",
  "enableCache": true,
  "skipTimeout": 0,
  "force": false
}
```

Behavior:

- **Vite plugin**
  - When you call `openapiPlugin()` **without arguments**, the plugin will try to read `openapi.config.json` from `process.cwd()` and use it as the configuration.
  - If neither options nor config file is provided, the plugin will stay inactive and print a warning.
- **CLI (`openapi-ts`)**
  - The CLI will first read `openapi.config.json` as default values, then override them with command-line options (if provided).
  - For example, the final `url` comes from `--url` (if present), otherwise from `openapi.config.json.url`.

When using a local spec file (e.g. `./openapi.yaml`) as `url`, make sure to provide a proper `baseUrl` either in `openapi.config.json` or via CLI / plugin options.

## License

MIT
