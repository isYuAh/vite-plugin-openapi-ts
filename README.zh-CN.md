# vite-plugin-openapi-ts

🚀 一个 Vite 插件，可以从 OpenAPI (Swagger) 规范自动生成 TypeScript 类型和类型安全的 API 客户端。

[English](./README.md) | 简体中文

## 特性

- ✨ **自动代码生成**：从 OpenAPI 规范生成 TypeScript 类型和 API 客户端
- 🔒 **类型安全**：完整的类型推导，支持 IntelliSense 智能提示
- 🎯 **框架无关**：适用于 Vue、React、Svelte 或任何 Vite 项目
- 📦 **零配置**：开箱即用，使用合理的默认配置
- 🔄 **自动同步**：每次构建时自动重新生成类型
- 📄 **多格式支持**：支持 JSON 和 YAML 格式的 OpenAPI 规范
- 🌐 **OpenAPI 3.0 & 3.1**：完全兼容两个版本

## 安装

```bash
pnpm add -D vite-plugin-openapi-ts
```

或使用其他包管理器：

```bash
npm install -D vite-plugin-openapi-ts
# 或
yarn add -D vite-plugin-openapi-ts
```

## 使用方法

### 1. 配置插件

在 `vite.config.ts` 中添加插件：

```ts
import { defineConfig } from 'vite';
import openapiPlugin from 'vite-plugin-openapi-ts';

export default defineConfig({
  plugins: [
    openapiPlugin({
      url: 'http://localhost:8080/v3/api-docs',
      baseUrl: 'http://localhost:8080',
      outputDir: 'src/openapi' // 可选，默认为 'src/openapi'
    })
  ]
});
```

**YAML 格式支持：**

```ts
export default defineConfig({
  plugins: [
    openapiPlugin({
      // 使用 YAML 格式
      url: 'http://localhost:8080/swagger.yaml',
      // 或从外部源获取
      // url: 'https://petstore3.swagger.io/api/v3/openapi.yaml',
      baseUrl: 'http://localhost:8080',
      outputDir: 'src/openapi'
    })
  ]
});
```

### 2. 使用生成的客户端

```ts
import apiClient from './openapi';

// 所有端点都是完全类型化的！
const { data } = await apiClient(
  '/users/{id}',
  'get',
  {
    params: { id: '123' }
  }
);

// 带查询参数
const { data: users } = await apiClient(
  '/users',
  'get',
  {
    query: { page: 1, limit: 10 }
  }
);

// 带请求体
const { data: newUser } = await apiClient(
  '/users',
  'post',
  {
    body: { name: 'John', email: 'john@example.com' }
  }
);

// 带请求头和 Cookie
const { data: profile } = await apiClient(
  '/profile',
  'get',
  {
    header: { 'Authorization': 'Bearer token' },
    cookie: { 'session': 'abc123' }
  }
);
```

### 3. 配置全局设置

```ts
import apiClient, { config } from './openapi';

// 配置全局 baseUrl
config.baseUrl = 'https://api.example.com';

// 配置全局请求头
config.headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer your-token'
};

// 现在所有请求都会使用这些配置
const { data } = await apiClient('/users', 'get');
```

### 4. 错误处理

```ts
import apiClient, { ApiError } from './openapi';

try {
  const { data } = await apiClient('/users/{id}', 'get', {
    params: { id: '123' }
  });
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API 错误:', error.status, error.message);
    console.error('响应数据:', error.data);
  }
}
```

## 配置选项

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `url` | `string` | *必填* | OpenAPI 规范来源，支持 HTTP/HTTPS URL 或本地文件路径（支持 `.json`、`.yaml`、`.yml`） |
| `baseUrl` | `string` | 从 URL 自动提取 | API 请求的基础 URL。本地文件路径作为 `url` 时，**必须显式提供**（可在插件配置或 `openapi.config.json` 中配置） |
| `outputDir` | `string` | `src/openapi` | 生成类型文件的目录 |
| `enableCache` | `boolean` | `true` | 是否启用基于内容哈希的缓存，在规范内容和 `baseUrl` 未变化时跳过重新生成 |
| `skipTimeout` | `number` | `0` | 跳过超时时间（毫秒）。在启用缓存且未设置 `force` 时，如果距离上次生成时间小于该值且 `url`/`baseUrl` 未变化，则直接跳过生成 |
| `force` | `boolean` | `false` | 是否强制重新生成，忽略缓存与 `skipTimeout` |

## 支持的特性

### OpenAPI 规范
- ✅ OpenAPI 3.0.x
- ✅ OpenAPI 3.1.x
- ✅ JSON 格式
- ✅ YAML 格式
- ✅ 自动检测格式（通过 URL 扩展名或 Content-Type）

### Schema 特性
- ✅ 基本类型（string、number、boolean、array、object）
- ✅ 引用（`$ref`）
- ✅ 组合 schema（`allOf`、`oneOf`、`anyOf`）
- ✅ 枚举和常量值（`enum`、`const`）
- ✅ 可空类型（支持 `nullable: true` 和 `type: ["string", "null"]`）
- ✅ 从描述生成 JSDoc 注释

### API 客户端特性
- ✅ 路径参数（Path parameters）
- ✅ 查询参数（Query parameters）
- ✅ 请求头参数（Header parameters）
- ✅ Cookie 参数（Cookie parameters）
- ✅ 请求体（JSON、FormData 自动检测）
- ✅ 带状态码的响应类型
- ✅ 使用 `ApiError` 类进行错误处理
- ✅ 可配置的 baseUrl 和 headers
- ✅ **请求/响应拦截器**
- ✅ **请求取消（AbortController）**
- ✅ **超时控制**
- ✅ **可配置策略的自动重试**
- ✅ **全局错误处理器**
- ✅ **文件上传自动转换 FormData**
- ✅ **可实例化客户端 + 可插拔 HTTP 适配器（默认 fetch）**
- ✅ 完整的 TypeScript IntelliSense 支持

## 高级功能

### 请求/响应拦截器

```ts
import apiClient, { interceptors } from './openapi';

// 添加请求拦截器
const removeRequestInterceptor = interceptors.request.use(async (config) => {
  // 添加认证 token
  config.headers['Authorization'] = `Bearer ${getToken()}`;
  console.log('请求:', config.method, config.url.pathname);
  return config;
});

// 添加响应拦截器
interceptors.response.use(async (response) => {
  console.log('响应:', response.response.status);
  return response;
});

// 添加错误拦截器
interceptors.error.use(async (error) => {
  console.error('请求失败:', error.message);
  if (error.status === 401) {
    // 跳转到登录页
    window.location.href = '/login';
  }
  throw error;
});

// 需要时移除拦截器
removeRequestInterceptor();
```

### 实例化客户端 & 自定义 HTTP 适配器

```ts
import apiClient, { createApiClient, setHttpClient, HttpClient } from './openapi';

// 1) 创建独立实例（既可调用又带 config / interceptors 等属性）
const client = createApiClient({
  baseUrl: 'https://api.example.com',
  headers: { Authorization: 'Bearer xxx' },
});

// 在任何调用前插入拦截器
client.interceptors.request.use(async (cfg) => {
  cfg.headers['X-Instance'] = 'demo';
  return cfg;
});

// 使用该实例
const { data } = await client('/users', 'get');

// 2) 自定义 HTTP 适配器示例：使用 axios（库请自行安装，我们不内置）
import axios from 'axios';

const axiosInstance = axios.create({
  // 这里可以挂你的 axios 拦截器
});

const axiosAdapter: HttpClient = async ({ url, ...rest }) => {
  const res = await axiosInstance.request({
    url: url.toString(),
    method: rest.method as any,
    headers: rest.headers,
    data: rest.body,
    signal: rest.signal as any,
    responseType: 'arraybuffer',   // 保持二进制数据
    validateStatus: () => true,    // 模拟 fetch：不因状态码抛错
  });

  return new Response(res.data, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers as any,
  });
};

// 应用于默认 client
setHttpClient(axiosAdapter);
// 或单独实例
// client.setHttpClient(axiosAdapter);

// 之后 apiClient / client 会通过 axios（及其拦截器）发送请求
```

### 请求取消

```ts
import apiClient from './openapi';

// 创建 abort controller
const controller = new AbortController();

// 传递 signal 到请求
apiClient('/users', 'get', {
  requestConfig: {
    signal: controller.signal
  }
});

// 取消请求
controller.abort();

// 示例：组件卸载时取消请求（React）
useEffect(() => {
  const controller = new AbortController();
  
  apiClient('/users', 'get', {
    requestConfig: { signal: controller.signal }
  });
  
  return () => controller.abort();
}, []);
```

### 超时控制

```ts
import apiClient, { config } from './openapi';

// 设置全局超时（默认：30000ms）
config.timeout = 10000; // 10 秒

// 或者为单个请求设置超时
apiClient('/users', 'get', {
  requestConfig: {
    timeout: 5000 // 此请求 5 秒超时
  }
});
```

### 自动重试

```ts
// 简单重试：重试 3 次
apiClient('/users', 'get', {
  requestConfig: {
    retry: 3
  }
});

// 高级重试，自定义策略
apiClient('/users', 'post', {
  body: { name: 'John' },
  requestConfig: {
    retry: {
      times: 3,
      delay: 1000, // 重试间隔 1 秒
      retryOn: (error) => {
        // 仅在 5xx 服务器错误时重试
        return error.status >= 500;
      }
    }
  }
});
```

### 全局错误处理器

```ts
import { setErrorHandler } from './openapi';

// 设置全局错误处理函数
setErrorHandler((error) => {
  // 显示 toast 提示
  toast.error(error.message);
  
  // 上报到错误追踪服务
  errorTracker.log(error);
});

// 现在所有错误都会被全局处理
apiClient('/users', 'get'); // 错误会自动处理
```

### 文件上传自动转换 FormData

```ts
// 客户端自动检测 File/Blob 并转换为 FormData
const fileInput = document.querySelector('input[type="file"]');

apiClient('/upload', 'post', {
  body: {
    file: fileInput.files[0],     // File 对象
    username: 'John',              // 普通字段
    metadata: { tags: ['photo'] }  // 对象会被 JSON 字符串化
  }
  // 自动转换为 FormData
  // Content-Type 自动设置为 multipart/form-data
});

// 多文件上传
apiClient('/upload-multiple', 'post', {
  body: {
    files: fileInput.files,  // FileList
    userId: '123'
  }
});
```

### 完整示例

```ts
import apiClient, { config, interceptors, setErrorHandler } from './openapi';

// 全局配置
config.baseUrl = 'https://api.example.com';
config.timeout = 15000;

// 添加认证
interceptors.request.use(async (config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// 处理 token 刷新
interceptors.error.use(async (error) => {
  if (error.status === 401) {
    await refreshToken();
    // 重试请求
  }
  throw error;
});

// 全局错误处理
setErrorHandler((error) => {
  if (error.status === 0) {
    toast.error('网络错误，请检查您的网络连接。');
  } else {
    toast.error(error.message);
  }
});

// 使用所有功能发起请求
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

## 生成的文件

插件会在指定的输出目录生成两个文件：

### `schemes.ts`
包含所有 OpenAPI schemas 的 TypeScript 接口定义：

```typescript
/**
 * Schema: User
 * @description Generated from OpenAPI schema
 */
export interface SCHEME_User {
  /** User's unique identifier */
  id: string;
  /** User's email address */
  email?: string;
  name: string;
}
```

### `index.ts`
包含：
- API 端点类型定义
- 类型安全的 API 客户端函数
- 配置对象
- 错误处理类

## 工作原理

1. **构建时获取**：在 Vite 构建开始时，插件从指定的 URL 获取 OpenAPI 规范
2. **格式检测**：自动检测并解析 JSON 或 YAML 格式
3. **类型生成**：将 OpenAPI schemas 转换为 TypeScript 接口
4. **客户端生成**：生成带完整类型推导的 API 客户端函数
5. **智能提示**：在你的 IDE 中享受完整的类型检查和自动完成

## 最佳实践

### 1. 使用环境变量

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    openapiPlugin({
      url: process.env.VITE_OPENAPI_URL || 'http://localhost:8080/v3/api-docs',
      baseUrl: process.env.VITE_API_BASE_URL || 'http://localhost:8080'
    })
  ]
});
```

### 2. 添加到 .gitignore

```gitignore
# 生成的 OpenAPI 文件
src/openapi/
```

### 3. 在 CI/CD 中使用

确保你的 CI/CD 流程可以访问 OpenAPI 规范 URL，或者将规范文件提交到仓库。

### 4. 使用配置文件 openapi.config.json

你可以在项目根目录创建一个 `openapi.config.json` 文件，把常用的默认配置集中写在这里：

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

行为说明：

- **Vite 插件**
  - 在 `vite.config.ts` 中调用 `openapiPlugin()` **不传任何参数** 时，插件会尝试从当前工作目录读取 `openapi.config.json`，并将其作为配置。
  - 如果既没有传入参数，也不存在配置文件，插件会保持“空实现”并输出一条提示日志。
- **CLI（`openapi-ts`）**
  - CLI 会先读取 `openapi.config.json` 作为默认值，再由命令行参数进行覆盖。
  - 例如，最终的 `url` 来源优先级为：`--url` > `openapi.config.json.url`。

当你使用本地文件路径（例如 `./openapi.yaml`）作为 `url` 时，请务必在配置文件或命令行/插件选项中提供一个正确的 `baseUrl`，否则生成的客户端无法正确指向实际 API 服务地址。

## 常见问题

### Q: 支持本地文件吗？
A: 支持。你可以把 `url` 写成本地文件路径（例如 `./openapi.yaml` 或 `./openapi.json`）。

- 使用 CLI 时，如果 `url` 是本地文件路径，**必须同时提供 `baseUrl`**（可以写在 `openapi.config.json` 中，或者通过 `--base-url` 参数传入）；
- 使用 Vite 插件时，如果使用本地文件路径而没有显式配置 `baseUrl`，插件会回退到默认值 `http://localhost:8080`，通常推荐在配置里显式设置一个符合实际环境的 `baseUrl`。

### Q: 如何处理多个 API 源？
A: 你可以多次使用插件，每次使用不同的 `outputDir`：

```ts
export default defineConfig({
  plugins: [
    openapiPlugin({
      url: 'http://api1.example.com/openapi.json',
      outputDir: 'src/api1'
    }),
    openapiPlugin({
      url: 'http://api2.example.com/openapi.yaml',
      outputDir: 'src/api2'
    })
  ]
});
```

### Q: 生成的代码可以自定义吗？
A: 当前版本使用固定的模板。如果需要自定义，可以 fork 项目并修改 `generator.ts`。

### Q: 支持 OpenAPI 2.0 (Swagger) 吗？
A: 目前仅支持 OpenAPI 3.0 和 3.1。对于 OpenAPI 2.0，建议先转换为 3.0 格式。

## 示例项目

查看 [examples](./examples) 目录了解完整的使用示例。

## 变更日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解详细的版本历史。

## 贡献

欢迎贡献！请随时提交 issue 或 pull request。

## 许可证

MIT

---

**提示**：生成的代码包含 `// Auto-generated` 注释，不要手动编辑这些文件，因为它们会在每次构建时被覆盖。
