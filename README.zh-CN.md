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
| `url` | `string` | *必填* | OpenAPI 规范的 URL（支持 `.json`、`.yaml`、`.yml`） |
| `baseUrl` | `string` | 从 URL 自动提取 | API 请求的基础 URL |
| `outputDir` | `string` | `src/openapi` | 生成类型文件的目录 |

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
- ✅ 请求体（JSON、FormData）
- ✅ 带状态码的响应类型
- ✅ 使用 `ApiError` 类进行错误处理
- ✅ 可配置的 baseUrl 和 headers
- ✅ 完整的 TypeScript IntelliSense 支持

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

## 常见问题

### Q: 支持本地文件吗？
A: 目前仅支持 HTTP/HTTPS URL。如果需要使用本地文件，可以使用本地服务器提供文件。

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
