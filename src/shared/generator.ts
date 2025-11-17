import { resolveRef } from './utils';

// Basic interface for the OpenAPI document to provide some type safety.
interface OpenAPIDocument {
  paths: OpenapiPaths;
  components: {
    schemas?: OpenAPIScheme;
  };
  servers?: { url: string }[];
}

export type OpenAPIScheme = Record<string, OpenAPISchemeObject>;

export interface OpenAPISchemeObject {
  type: string;
  required: string[];
  properties: Record<string, OpenAPISchemeProperty>;
}

export interface OpenAPISchemeProperty {
  type: string;
  format?: string;
  description?: string;
  example?: any;
  items?: OpenAPISchemeProperty;
  $ref?: string;
  allOf?: any[];
  oneOf?: any[];
  anyOf?: any[];
  enum?: any[];
  properties?: Record<string, any>;
  additionalProperties?: any;
  required?: string[];
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head' | 'trace';

export interface ApiEndpointDetail {
  operationId?: string;
  summary?: string;
  tags?: string[];
  responses: Record<string, any>;
  parameters?: ApiParameters;
  requestBody?: {
    content: Record<string, any>;
  };
}

export type ApiParameters = ApiParameter[];

interface ApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie' | 'body';
  required: boolean;
  schema: OpenAPISchemeProperty;
}

export type ApiEndpoint = Record<HttpMethod, ApiEndpointDetail>;
export type OpenapiPaths = Record<string, ApiEndpoint>;

/**
 * Maps an OpenAPI type to a TypeScript type.
 */
export function mapOpenAPITypeToTS(openapiType: string, format?: string): string {
  switch (openapiType) {
    case 'integer':
      return 'number';
    case 'number':
      return 'number';
    case 'string':
      if (!format) return 'string';
      switch (format) {
        case 'binary':
          return 'Blob';
        case 'byte':
          return 'string';
        default:
          return 'string';
      }
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'Array';
    case 'object':
      return 'object';
    case 'null':
      return 'null';
    case 'file':
      return 'File';
    default:
      console.warn(`Unknown OpenAPI type: ${openapiType}, format: ${format}`);
      return 'any';
  }
}

type TypeConstructor = [string | number, string | ConstructType, boolean?] | string;

class ConstructType {
  result: TypeConstructor[];
  semi: string;
  
  constructor(semi: string = ";") {
    this.result = [];
    this.semi = semi;
  }
  
  build = () => {
    let r = '{';
    for (const item of this.result) {
      if (typeof item === 'string') {
        r += item + this.semi;
      } else if (Array.isArray(item)) {
        if (item[1] instanceof ConstructType) {
          r += item[0] + `${item[2] ? '' : '?'}: ` + item[1].build() + this.semi;
        } else {
          r += item[0] + `${item[2] ? '' : '?'}: ` + item[1] + this.semi;
        }
      }
    }
    r += '}';
    return r;
  }
  
  push = (item: TypeConstructor) => {
    if (Array.isArray(item)) {
      if (item[2] === undefined) {
        item[2] = true;
      }
    }
    this.result.push(item);
  }
}

/**
 * Infers a TypeScript type from an OpenAPI schema object.
 * Supports OpenAPI 3.0 and 3.1 specifications.
 */
export function inferType(
  schema: any,
  openapi: OpenAPIDocument,
  useNamespace: boolean = true
): string {
  if (!schema) return 'any';

  // Handle $ref references
  if (schema.$ref) {
    // Priority for schemas, as they are pre-generated interfaces.
    if (schema.$ref.startsWith('#/components/schemas/')) {
      const refName = schema.$ref.substring('#/components/schemas/'.length);
      return useNamespace ? `Schemes.SCHEME_${refName}` : `SCHEME_${refName}`;
    }

    // For all other references, resolve them and infer their type recursively.
    const resolvedComponent = resolveRef(schema.$ref, openapi);
    if (resolvedComponent) {
      return inferType(resolvedComponent, openapi, useNamespace);
    } else {
      console.warn(`[openapi-ts] Warning: Could not resolve $ref: ${schema.$ref}`);
      return 'any';
    }
  }

  // --- The rest of the function logic remains largely the same, but recursive calls are updated ---

  // Handle allOf (intersection types)
  if (schema.allOf) {
    const types = schema.allOf.map((s: any) => inferType(s, openapi, useNamespace));
    return types.join(' & ');
  }

  // Handle oneOf/anyOf (union types)
  if (schema.oneOf || schema.anyOf) {
    const types = (schema.oneOf || schema.anyOf).map((s: any) => inferType(s, openapi, useNamespace));
    return types.join(' | ');
  }

  // OpenAPI 3.1: Support for the 'const' keyword (singleton enum)
  if (schema.const !== undefined) {
    return typeof schema.const === 'string' ? `'${schema.const}'` : String(schema.const);
  }

  // From here, we need to ensure recursive calls to inferType pass the full openapi object.
  const type = schema.type;
  
  // OpenAPI 3.1: Support for type arrays, e.g., type: ["string", "null"]
  if (Array.isArray(type)) {
    const types = type.map(t => {
      if (t === 'null') return 'null';
      if (t === 'array') {
        const itemType = schema.items ? inferType(schema.items, openapi, useNamespace) : 'any';
        return `Array<${itemType}>`;
      }
      if (t === 'object') return 'object';
      return mapOpenAPITypeToTS(t, schema.format);
    });
    return types.join(' | ');
  }

  // OpenAPI 3.0: Support for the 'nullable' field (deprecated, but still needed for compatibility)
  const isNullable = schema.nullable === true;
  
  if (type === 'array') {
    const itemType = schema.items ? inferType(schema.items, openapi, useNamespace) : 'any';
    const arrayType = `Array<${itemType}>`;
    return isNullable ? `${arrayType} | null` : arrayType;
  }

  if (type === 'object') {
    // This part needs to handle the schema of a parameter, which might not be a typical schema object
    if (schema.in && schema.name && schema.schema) {
      return inferType(schema.schema, openapi, useNamespace);
    }

    let objectType: string;
    if (schema.properties) {
      const objType = new ConstructType();
      const required = schema.required || [];
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(propName);
        const propType = inferType(propSchema, openapi, useNamespace);
        objType.push([propName, propType, isRequired]);
      }
      objectType = objType.build();
    } else if (schema.additionalProperties) {
      const valueType = schema.additionalProperties === true 
        ? 'any' 
        : inferType(schema.additionalProperties, openapi, useNamespace);
      objectType = `Record<string, ${valueType}>`;
    } else {
      objectType = 'Record<string, any>';
    }
    return isNullable ? `${objectType} | null` : objectType;
  }

  if (type === 'string') {
    if (schema.enum) {
      const enumType = schema.enum.map((e: any) => `'${e}'`).join(' | ');
      return isNullable ? `${enumType} | null` : enumType;
    }
    const stringType = mapOpenAPITypeToTS('string', schema.format);
    return isNullable ? `${stringType} | null` : stringType;
  }

  if (type === 'number' || type === 'integer') {
    const numberType = mapOpenAPITypeToTS(type, schema.format);
    return isNullable ? `${numberType} | null` : numberType;
  }

  if (type === 'boolean') {
    return isNullable ? 'boolean | null' : 'boolean';
  }
  
  if (type === 'null') return 'null';
  if (type === 'file') return 'File';

  // Handle enums without a type
  if (schema.enum) {
    const enumType = schema.enum.map((e: any) => typeof e === 'string' ? `'${e}'` : e).join(' | ');
    return isNullable ? `${enumType} | null` : enumType;
  }

  return 'any';
}

/**
 * 生成 schemes.ts 内容
 */
export function genSchemes(schemas: OpenAPIScheme, openapi: OpenAPIDocument): string {
  let schemes = '';
  for (const [name, scheme] of Object.entries(schemas)) {
    // add JSDoc Comments
    schemes += `/**\n`;
    schemes += ` * Schema: ${name}\n`;
    if (scheme.properties && Object.keys(scheme.properties).length > 0) {
      schemes += ` * @description Generated from OpenAPI schema\n`;
    }
    schemes += ` */\n`;
    schemes += `export interface SCHEME_${name} {\n`;
    
    // 处理 properties 可能不存在的情况
    const properties = scheme.properties || {};
    const required = scheme.required || [];
    
    for (const [propName, prop] of Object.entries(properties)) {
      const isRequired = required.includes(propName);
      const optionalMark = isRequired ? '' : '?';
      const propType = inferType(prop as any, openapi, false);
      
      // add property description if available
      if ((prop as any).description) {
        schemes += `  /** ${(prop as any).description} */\n`;
      }
      schemes += `  ${propName}${optionalMark}: ${propType};\n`;
    }
    schemes += `}\n\n`;
  }
  return schemes;
}

/**
 * 解析请求参数
 */
export function parseParams(params: (ApiParameter | { $ref: string })[], openapi: OpenAPIDocument): {
  pathParams: string;
  queryParams: string;
  headerParams: string;
  cookieParams: string;
} {
  const result = {
    pathParams: new ConstructType(),
    queryParams: new ConstructType(),
    headerParams: new ConstructType(),
    cookieParams: new ConstructType(),
  };
  
  for (const param of params) {
    let resolvedParam;
    if ('$ref' in param) {
        resolvedParam = resolveRef(param.$ref, openapi);
    } else {
        resolvedParam = param;
    }
    if (!resolvedParam) continue;

    const paramType = inferType(resolvedParam.schema, openapi);
    if (resolvedParam.in === 'path') {
      result.pathParams.push([resolvedParam.name, paramType, resolvedParam.required]);
    } else if (resolvedParam.in === 'query') {
      result.queryParams.push([resolvedParam.name, paramType, resolvedParam.required]);
    } else if (resolvedParam.in === 'header') {
      result.headerParams.push([resolvedParam.name, paramType, resolvedParam.required]);
    } else if (resolvedParam.in === 'cookie') {
      result.cookieParams.push([resolvedParam.name, paramType, resolvedParam.required]);
    }
  }
  
  return {
    pathParams: result.pathParams.build(),
    queryParams: result.queryParams.build(),
    headerParams: result.headerParams.build(),
    cookieParams: result.cookieParams.build(),
  };
}

/**
 * parse request body
 */
export function parseRequestBody(requestBody: { content: Record<string, any> }, openapi: OpenAPIDocument): string {
  if (requestBody.content) {
    for (const [contentType, content] of Object.entries(requestBody.content)) {
      if (contentType === 'application/json') {
        const paramType = inferType(content.schema, openapi);
        return paramType;
      } else if (contentType === 'application/x-www-form-urlencoded' || contentType.startsWith('multipart/')) {
        // prioritize schema if available
        if (content.schema) {
          return inferType(content.schema, openapi);
        }
        // if there is no schema, fallback to generic FormData type
        return 'Record<string, string | Blob | File>';
      }
    }
  }
  return 'any';
}

/**
 * 解析响应类型
 */
export function parseResponse(response: any, openapi: OpenAPIDocument): string {
  if (!response || !response.content) {
    return 'void';
  }
  
  for (const [contentType, content] of Object.entries(response.content)) {
    if (contentType === 'application/json') {
      if (content && (content as any).schema) {
        return inferType((content as any).schema, openapi);
      }
      return 'any';
    } else if (contentType.startsWith('text/')) {
      return 'string';
    } else if (contentType === 'application/octet-stream' || contentType.startsWith('image/')) {
      return 'Blob';
    } else if (contentType === 'application/pdf') {
      return 'Blob';
    }
  }
  
  return 'any';
}

/**
 * generate API Endpoints type
 */
export function genPaths(endpoints: OpenapiPaths, openapi: OpenAPIDocument): string {
  let paths = 'export type API_Endpoints = ';
  const pathMain = new ConstructType();
  
  for (const [path, endpoint] of Object.entries(endpoints)) {
    const pathType = new ConstructType();
    
    for (const method of Object.keys(endpoint)) {
      const methodType = new ConstructType();
      const endpointDetail = endpoint[method as HttpMethod];
      const r = parseParams(endpointDetail.parameters || [], openapi);
      
      methodType.push(['pathParams', r.pathParams]);
      methodType.push(['queryParams', r.queryParams]);
      methodType.push(['headerParams', r.headerParams]);
      methodType.push(['cookieParams', r.cookieParams]);
      methodType.push(['bodyParams', parseRequestBody(endpointDetail.requestBody || {content: {}}, openapi)]);
      
      // Responses
      const responsesType = new ConstructType();
      const responses = endpointDetail.responses || {};
      for (const [statusCode, response] of Object.entries(responses)) {
        const responseType = parseResponse(response, openapi);
        responsesType.push([statusCode, responseType]);
      }
      methodType.push(['responses', responsesType]);
      pathType.push([method, methodType]);
    }
    pathMain.push([`'${path}'`, pathType]);
  }
  
  return paths + pathMain.build() + ';';
}

/**
 * generate API client base code
 */
export function genClient(base: string, servers: string[]): string {
  const allServers = Array.from(new Set([base, ...servers]));
  const serverLiterals = allServers.map(s => `'${s}'`).join(' | ');
    
  return `
export type ServerUrl = ${serverLiterals} | (string & {});

export let config = {
  baseUrl: "${base}" as ServerUrl,
  headers: {
    "Content-Type": "application/json"
  },
  timeout: 30000, // 默认 30 秒超时
}

/**
 * 拦截器类型定义
 */
type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
type ResponseInterceptor = (response: ApiResponse<any>) => ApiResponse<any> | Promise<ApiResponse<any>>;
type ErrorInterceptor = (error: ApiError) => Promise<never>;

interface RequestConfig {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
}

/**
 * 拦截器管理器
 */
class InterceptorManager<T> {
  private interceptors: T[] = [];

  use(interceptor: T): () => void {
    this.interceptors.push(interceptor);
    // 返回取消函数
    return () => {
      const index = this.interceptors.indexOf(interceptor);
      if (index !== -1) {
        this.interceptors.splice(index, 1);
      }
    };
  }

  forEach(fn: (interceptor: T) => void): void {
    this.interceptors.forEach(fn);
  }

  clear(): void {
    this.interceptors = [];
  }
}

/**
 * 拦截器实例
 */
export const interceptors = {
  request: new InterceptorManager<RequestInterceptor>(),
  response: new InterceptorManager<ResponseInterceptor>(),
  error: new InterceptorManager<ErrorInterceptor>(),
};

/**
 * 全局错误处理钩子
 */
export let onError: ((error: ApiError) => void) | null = null;

/**
 * 设置全局错误处理函数
 */
export function setErrorHandler(handler: (error: ApiError) => void): void {
  onError = handler;
}

/**
 * 检测对象是否包含 File/Blob，需要使用 FormData
 */
function shouldUseFormData(body: any): boolean {
  if (!body || typeof body !== 'object') return false;
  
  return Object.values(body).some(value => 
    value instanceof File || 
    value instanceof Blob || 
    value instanceof FileList ||
    (Array.isArray(value) && value.some(v => v instanceof File || v instanceof Blob))
  );
}

/**
 * 将对象转换为 FormData
 */
function toFormData(body: Record<string, any>): FormData {
  const formData = new FormData();
  
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }
    
    if (value instanceof FileList) {
      Array.from(value).forEach(file => formData.append(key, file));
    } else if (Array.isArray(value)) {
      value.forEach(item => {
        if (item instanceof File || item instanceof Blob) {
          formData.append(key, item);
        } else {
          formData.append(key, String(item));
        }
      });
    } else if (value instanceof File || value instanceof Blob) {
      formData.append(key, value);
    } else if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }
  
  return formData;
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的 fetch 函数
 */
async function fetchWithRetry(
  url: URL,
  configs: RequestInit,
  retryConfig?: number | {
    times: number;
    delay: number;
    retryOn?: (error: ApiError) => boolean;
  }
): Promise<Response> {
  if (!retryConfig) {
    return fetch(url, configs);
  }

  const times = typeof retryConfig === 'number' ? retryConfig : retryConfig.times;
  const retryDelay = typeof retryConfig === 'number' ? 1000 : retryConfig.delay;
  const retryOn = typeof retryConfig === 'number' 
    ? undefined 
    : retryConfig.retryOn;

  let lastError: any;

  for (let attempt = 0; attempt <= times; attempt++) {
    try {
      const response = await fetch(url, configs);

      if (response.ok) {
        return response;
      }

      // 构造错误对象
      const contentType = response.headers.get('content-type');
      let errorData: any;
      try {
        if (contentType?.includes('application/json')) {
          errorData = await response.clone().json();
        } else if (contentType?.includes('text/')) {
          errorData = await response.clone().text();
        } else {
          errorData = await response.clone().text();
        }
      } catch (e) {
        errorData = null;
      }

      const error = new ApiError(
        \`API request failed: \${response.status} \${response.statusText}\`,
        response.status,
        response,
        errorData
      );

      // 判断是否需要重试
      const shouldRetry = retryOn
        ? retryOn(error)
        : (response.status >= 500 || response.status === 408 || response.status === 429);

      if (!shouldRetry || attempt === times) {
        throw error;
      }

      lastError = error;
      await delay(retryDelay * (attempt + 1));

    } catch (error) {
      if (error instanceof ApiError) {
        if (attempt === times) {
          throw error;
        }
        lastError = error;
      } else {
        // 网络错误等，尝试重试
        if (attempt === times) {
          throw error;
        }
        lastError = error;
      }
      await delay(retryDelay * (attempt + 1));
    }
  }

  throw lastError;
}

/**
 * 构建 URL 路径，替换路径参数
 * 支持格式：{id}, :id, *id, **id, {*path} 等
 * @param template 路径模板，如 "/users/{id}/posts/{postId}"
 * @param params 参数对象，如 { id: "123", postId: "456" }
 * @returns 构建好的路径字符串
 */
export const buildPath = (template: string, params: Record<string, any>): string => {
  return template.split("/").map(seg => {
    // 处理 OpenAPI 标准格式 {paramName} 或 {*paramName}
    if (seg.startsWith("{") && seg.endsWith("}")) {
      const paramName = seg.slice(1, -1);
      // 移除可能的前缀 * 或 **
      const cleanName = paramName.replace(/^\\\*+/, '');
      return params[cleanName] ?? seg;
    }
    // 处理 Express/Koa 风格 :paramName
    if (seg.startsWith(":")) {
      const paramName = seg.slice(1);
      return params[paramName] ?? seg;
    }
    // 处理通配符 *paramName 或 **paramName
    if (seg.startsWith("*")) {
      const paramName = seg.replace(/^\\\*+/, '');
      return params[paramName] ?? seg;
    }
    return seg;
  }).join("/");
}

export type ApiResponse<T> = {
  data: T;
  response: Response;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response: Response,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type IsEmptyOrAllOptional<T> = {} extends T ? true : false;

type ExtractParams<T, K extends string> = T extends {[key in K]: infer P} ? P : {};

type ExtractSuccessResponses<T> = T extends { responses: infer R } ? R[Extract<keyof R, \`2\${string}\`>] : any;

// 根据是否有必填字段决定该字段是必填还是可选
type OptionalIfEmpty<K extends string, T> = IsEmptyOrAllOptional<T> extends true 
  ? { [P in K]?: T } 
  : { [P in K]: T };

export type ApiClientOptions<
  T extends keyof API_Endpoints,
  M extends keyof API_Endpoints[T] & string
> = 
  & OptionalIfEmpty<'query', ExtractParams<API_Endpoints[T][M], 'queryParams'>>
  & OptionalIfEmpty<'params', ExtractParams<API_Endpoints[T][M], 'pathParams'>>
  & OptionalIfEmpty<'header', ExtractParams<API_Endpoints[T][M], 'headerParams'>>
  & OptionalIfEmpty<'cookie', ExtractParams<API_Endpoints[T][M], 'cookieParams'>>
  & OptionalIfEmpty<'body', ExtractParams<API_Endpoints[T][M], 'bodyParams'>>
  & {
    baseUrl?: ServerUrl;
    headers?: Record<string, string>;
    /** 请求行为配置 */
    requestConfig?: {
      /** 超时时间（毫秒），默认 30000 */
      timeout?: number;
      /** 自定义取消信号 */
      signal?: AbortSignal;
      /** 重试配置 */
      retry?: number | {
        times: number;
        delay: number;
        retryOn?: (error: ApiError) => boolean;
      };
    };
  };

type IsOptionsRequired<
  T extends keyof API_Endpoints,
  M extends keyof API_Endpoints[T] & string
> = 
  IsEmptyOrAllOptional<ExtractParams<API_Endpoints[T][M], 'queryParams'>> extends false ? true :
  IsEmptyOrAllOptional<ExtractParams<API_Endpoints[T][M], 'pathParams'>> extends false ? true :
  IsEmptyOrAllOptional<ExtractParams<API_Endpoints[T][M], 'headerParams'>> extends false ? true :
  IsEmptyOrAllOptional<ExtractParams<API_Endpoints[T][M], 'cookieParams'>> extends false ? true :
  IsEmptyOrAllOptional<ExtractParams<API_Endpoints[T][M], 'bodyParams'>> extends false ? true :
  false;

export default async function apiClient<
  T extends keyof API_Endpoints,
  M extends keyof API_Endpoints[T] & string
>(
  path: T,
  method: M,
  ...args: IsOptionsRequired<T, M> extends true ? [options: ApiClientOptions<T, M>] : [options?: ApiClientOptions<T, M>]
): Promise<ApiResponse<ExtractSuccessResponses<API_Endpoints[T][M]>>> {
  const options = args[0];
  const { 
    query = {}, 
    params = {}, 
    header = {},
    cookie = {},
    body = {}, 
    baseUrl = config.baseUrl,
    headers = config.headers,
    requestConfig = {}
  } = options || {};
  
  // 处理路径拼接：如果 path 以 / 开头，需要去掉以正确拼接到 baseUrl
  const builtPath = buildPath(path as string, params as any);
  const relativePath = builtPath.startsWith('/') ? builtPath.slice(1) : builtPath;
  const fullUrl = baseUrl.endsWith('/') ? baseUrl + relativePath : baseUrl + '/' + relativePath;
  const url = new URL(fullUrl);
  url.search = new URLSearchParams(query as any).toString();
  
  // 合并默认 headers 和参数中的 headers
  const mergedHeaders: any = { ...headers };
  for (const [key, value] of Object.entries(header as any)) {
    mergedHeaders[key] = String(value);
  }
  
  // 处理 cookie 参数
  if (Object.keys(cookie as any).length > 0) {
    const cookieString = Object.entries(cookie as any)
      .map(([key, value]) => \`\${key}=\${value}\`)
      .join('; ');
    if (mergedHeaders['Cookie']) {
      mergedHeaders['Cookie'] += '; ' + cookieString;
    } else {
      mergedHeaders['Cookie'] = cookieString;
    }
  }
  
  // 处理请求体：自动检测是否需要 FormData
  let processedBody: any;
  if (method !== 'get' && method !== 'head') {
    if (shouldUseFormData(body)) {
      processedBody = toFormData(body as Record<string, any>);
      // 删除 Content-Type，让浏览器自动设置（包含 boundary）
      delete mergedHeaders['Content-Type'];
    } else {
      processedBody = JSON.stringify(body);
    }
  }
  
  // 处理超时和取消
  const timeout = requestConfig.timeout ?? config.timeout;
  const controller = new AbortController();
  const signal = requestConfig.signal || controller.signal;
  
  let timeoutId: any;
  if (timeout > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }
  
  // 构建请求配置
  let requestCfg: RequestConfig = {
    url,
    method,
    headers: mergedHeaders,
    body: processedBody,
    signal
  };
  
  // 执行请求拦截器
  for (const interceptor of (interceptors.request as any).interceptors) {
    requestCfg = await interceptor(requestCfg);
  }
  
  const fetchConfigs: RequestInit = {
    method: requestCfg.method,
    headers: requestCfg.headers,
    body: requestCfg.body,
    signal: requestCfg.signal,
  };
  
  try {
    // 发送请求（支持重试）
    const response = await fetchWithRetry(requestCfg.url, fetchConfigs, requestConfig.retry);
    
    if (timeoutId) clearTimeout(timeoutId);
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorData: any;
      try {
        if (contentType?.includes('application/json')) {
          errorData = await response.json();
        } else if (contentType?.includes('text/')) {
          errorData = await response.text();
        } else {
          errorData = await response.text();
        }
      } catch (e) {
        errorData = null;
      }
      throw new ApiError(
        \`API request failed: \${response.status} \${response.statusText}\`,
        response.status,
        response,
        errorData
      );
    }
    
    // 解析响应数据
    const contentType = response.headers.get('content-type')
    let data: any;
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else if (contentType?.includes('text/')) {
      data = await response.text()
    } else if (contentType?.includes('application/octet-stream') || contentType?.includes('image/')) {
      data = await response.blob()
    } else {
      data = await response.json()
    }
    
    let result: ApiResponse<any> = { data, response };
    
    // 执行响应拦截器
    for (const interceptor of (interceptors.response as any).interceptors) {
      result = await interceptor(result);
    }
    
    return result;
    
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    
    const apiError = error instanceof ApiError 
      ? error 
      : new ApiError(
          error instanceof Error ? error.message : String(error),
          0,
          null as any,
          null
        );
    
    // 执行错误拦截器
    for (const interceptor of (interceptors.error as any).interceptors) {
      await interceptor(apiError);
    }
    
    // 执行全局错误处理
    if (onError) {
      onError(apiError);
    }
    
    throw apiError;
  }
}
`;
}

/**
 * generate complete index.ts file
 */
export function summary(openapi: OpenAPIDocument, base: string): string {
  const paths = openapi.paths || {};
  const schemas = openapi.components?.schemas || {};
  const servers = (openapi.servers || []).map((s: any) => s.url);

  // generate Endpoints summary comments
  let endpointComments = '/**\n * API Endpoints Summary:\n';
  for (const [path, endpoint] of Object.entries(paths)) {
    for (const method of Object.keys(endpoint)) {
      const endpointDetail = endpoint[method as HttpMethod];
      const summaryText = endpointDetail.summary || 'No description';
      const tags = endpointDetail.tags ? endpointDetail.tags.join(', ') : 'Untagged';
      endpointComments += ` * - [${method.toUpperCase()}] ${path}\n`;
      endpointComments += ` *   ${summaryText}\n`;
      endpointComments += ` *   Tags: ${tags}\n`;
    }
  }
  endpointComments += ' */\n\n';

  return `import type * as Schemes from './schemes';

${endpointComments}${genPaths(paths, openapi)}

${genClient(base, servers)}
`;
}
