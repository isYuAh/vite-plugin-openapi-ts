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
  const normalizeMediaType = (mediaType: string): string => mediaType.split(';')[0]?.trim().toLowerCase();
  const isJsonLikeMediaType = (mediaType: string): boolean => {
    const mt = normalizeMediaType(mediaType);
    return mt === 'application/json' || mt.endsWith('+json') || mt === 'text/json';
  };
  const isWildcardMediaType = (mediaType: string): boolean => {
    const mt = normalizeMediaType(mediaType);
    return mt === '*/*' || mt.includes('*');
  };
  const getSchema = (mediaContent: any): any | undefined => {
    if (!mediaContent || typeof mediaContent !== 'object') return undefined;
    return (mediaContent as any).schema ?? undefined;
  };

  if (!requestBody?.content) return 'any';

  // 1) Prefer explicit JSON-like media types (application/json, application/*+json, etc.)
  for (const [contentType, content] of Object.entries(requestBody.content)) {
    if (!isJsonLikeMediaType(contentType)) continue;
    const schema = getSchema(content);
    if (schema) return inferType(schema, openapi);
  }

  // 2) Handle forms
  for (const [contentType, content] of Object.entries(requestBody.content)) {
    const mt = normalizeMediaType(contentType);
    if (mt === 'application/x-www-form-urlencoded' || mt.startsWith('multipart/')) {
      // prioritize schema if available
      const schema = getSchema(content);
      if (schema) return inferType(schema, openapi);
      // if there is no schema, fallback to generic FormData type
      return 'Record<string, string | Blob | File>';
    }
  }

  // 3) Springdoc sometimes emits "*/*" even for JSON; if schema exists, infer it.
  for (const [contentType, content] of Object.entries(requestBody.content)) {
    if (!isWildcardMediaType(contentType)) continue;
    const schema = getSchema(content);
    if (schema) return inferType(schema, openapi);
  }

  // 4) If there's only one content entry and it contains a schema, infer it as a last resort.
  const entries = Object.entries(requestBody.content);
  if (entries.length === 1) {
    const schema = getSchema(entries[0]?.[1]);
    if (schema) return inferType(schema, openapi);
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

  const normalizeMediaType = (mediaType: string): string => mediaType.split(';')[0]?.trim().toLowerCase();
  const isJsonLikeMediaType = (mediaType: string): boolean => {
    const mt = normalizeMediaType(mediaType);
    return mt === 'application/json' || mt.endsWith('+json') || mt === 'text/json';
  };
  const isWildcardMediaType = (mediaType: string): boolean => {
    const mt = normalizeMediaType(mediaType);
    return mt === '*/*' || mt.includes('*');
  };
  const isTextMediaType = (mediaType: string): boolean => normalizeMediaType(mediaType).startsWith('text/');
  const isBinaryBlobMediaType = (mediaType: string): boolean => {
    const mt = normalizeMediaType(mediaType);
    return mt === 'application/octet-stream' || mt.startsWith('image/') || mt === 'application/pdf';
  };
  const getSchema = (mediaContent: any): any | undefined => {
    if (!mediaContent || typeof mediaContent !== 'object') return undefined;
    return (mediaContent as any).schema ?? undefined;
  };

  // 1) Prefer JSON-like media types that carry schema.
  for (const [contentType, content] of Object.entries(response.content)) {
    if (!isJsonLikeMediaType(contentType)) continue;
    const schema = getSchema(content);
    if (schema) return inferType(schema, openapi);
  }

  // 2) Explicit text responses
  if (Object.keys(response.content).some(isTextMediaType)) {
    return 'string';
  }

  // 3) Explicit binary/blob responses
  if (Object.keys(response.content).some(isBinaryBlobMediaType)) {
    return 'Blob';
  }

  // 4) Springdoc sometimes emits "*/*" even for JSON; if schema exists, infer it.
  for (const [contentType, content] of Object.entries(response.content)) {
    if (!isWildcardMediaType(contentType)) continue;
    const schema = getSchema(content);
    if (schema) return inferType(schema, openapi);
  }

  // 5) If there's only one content entry and it contains a schema, infer it as a last resort.
  const entries = Object.entries(response.content);
  if (entries.length === 1) {
    const schema = getSchema(entries[0]?.[1]);
    if (schema) return inferType(schema, openapi);
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
        responsesType.push([`'${statusCode}'`, responseType]);
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

/**
 * HTTP 客户端抽象，支持替换为 axios 等自定义实现。
 */
export type HttpClientRequest = RequestInit & { url: URL };
export type HttpClient = (request: HttpClientRequest) => Promise<Response>;

// 默认基于 fetch 的 httpClient，实现保持向后兼容
const fetchHttpClient: HttpClient = async ({ url, ...rest }) => fetch(url, rest);

export interface ApiClientConfig {
  baseUrl: ServerUrl;
  headers: Record<string, string>;
  timeout: number;
  httpClient: HttpClient;
}

export let config: ApiClientConfig = {
  baseUrl: "${base}" as ServerUrl,
  headers: {
    "Content-Type": "application/json"
  },
  timeout: 30000, // 默认 30 秒超时
  httpClient: fetchHttpClient,
}

/**
 * 拦截器类型定义
 */
type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
type ResponseInterceptor = (response: ApiResponse<any>) => ApiResponse<any> | Promise<ApiResponse<any>>;
type ErrorInterceptor = (error: ApiError) => Promise<ApiResponse<any> | void>;

export interface RequestConfig {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
  timeout?: number;
  retry?: number | {
    times: number;
    delay: number;
    retryOn?: (error: ApiError) => boolean;
  };
  httpClient?: HttpClient;
  [key: string]: any;
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

  getAll(): T[] {
    return this.interceptors;
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
  requestConfig: RequestConfig,
  retryConfig: number | {
    times: number;
    delay: number;
    retryOn?: (error: ApiError) => boolean;
  } | undefined,
  httpClient: HttpClient
): Promise<Response> {
  if (!retryConfig) {
    return httpClient({ url, ...configs });
  }

  const times = typeof retryConfig === 'number' ? retryConfig : retryConfig.times;
  const retryDelay = typeof retryConfig === 'number' ? 1000 : retryConfig.delay;
  const retryOn = typeof retryConfig === 'number' 
    ? undefined 
    : retryConfig.retryOn;

  let lastError: any;

  for (let attempt = 0; attempt <= times; attempt++) {
    try {
      const response = await httpClient({ url, ...configs });

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
        requestConfig,
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
  requestConfig: RequestConfig;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response: Response,
    public requestConfig: RequestConfig,
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
      /** 单次请求覆盖 httpClient */
      httpClient?: HttpClient;
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

type ApiClientInstance = {
  <T extends keyof API_Endpoints, M extends keyof API_Endpoints[T] & string>(
    path: T,
    method: M,
    ...args: IsOptionsRequired<T, M> extends true ? [options: ApiClientOptions<T, M>] : [options?: ApiClientOptions<T, M>]
  ): Promise<ApiResponse<ExtractSuccessResponses<API_Endpoints[T][M]>>>;
  request(config: RequestConfig): Promise<ApiResponse<any>>;
  config: ApiClientConfig;
  interceptors: {
    request: InterceptorManager<RequestInterceptor>;
    response: InterceptorManager<ResponseInterceptor>;
    error: InterceptorManager<ErrorInterceptor>;
  };
  setErrorHandler: (handler: (error: ApiError) => void) => void;
  getHttpClient: () => HttpClient;
  setHttpClient: (client: HttpClient) => void;
};

export function createApiClient(customConfig?: Partial<ApiClientConfig>): ApiClientInstance {
  const isDefaultInstance = !customConfig;
  const instanceConfig: ApiClientConfig = isDefaultInstance
    ? config
    : {
        ...config,
        ...customConfig,
        headers: { ...config.headers, ...(customConfig?.headers || {}) },
        httpClient: customConfig?.httpClient ?? config.httpClient,
      };

  const localInterceptors = {
    request: new InterceptorManager<RequestInterceptor>(),
    response: new InterceptorManager<ResponseInterceptor>(),
    error: new InterceptorManager<ErrorInterceptor>(),
  };

  let localOnError: ((error: ApiError) => void) | null = null;

  const coreRequest = async (initialConfig: RequestConfig): Promise<ApiResponse<any>> => {
    let requestCfg = initialConfig;
    
    // 处理超时 (如果没有提供 signal)
    let timeoutId: any;
    if (!requestCfg.signal && requestCfg.timeout && requestCfg.timeout > 0) {
      const controller = new AbortController();
      requestCfg.signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), requestCfg.timeout);
    }
    
    // 执行实例级请求拦截器
    for (const interceptor of localInterceptors.request.getAll()) {
      requestCfg = await interceptor(requestCfg);
    }
    // 执行默认（全局）请求拦截器
    for (const interceptor of interceptors.request.getAll()) {
      requestCfg = await interceptor(requestCfg);
    }
    
    const fetchConfigs: RequestInit = {
      method: requestCfg.method,
      headers: requestCfg.headers,
      body: requestCfg.body,
      signal: requestCfg.signal,
    };
    
    const resolvedHttpClient = requestCfg.httpClient || instanceConfig.httpClient;
    
    try {
      // 发送请求（支持重试）
      const response = await fetchWithRetry(requestCfg.url, fetchConfigs, requestCfg, requestCfg.retry, resolvedHttpClient);
      
      if (timeoutId) clearTimeout(timeoutId);
      
      if (!response.ok) {
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
        throw new ApiError(
          \`API request failed: \${response.status} \${response.statusText}\`,
          response.status,
          response,
          requestCfg,
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
      
      let result: ApiResponse<any> = { data, response, requestConfig: requestCfg };
      
      // 执行响应拦截器：实例级 → 默认
      for (const interceptor of localInterceptors.response.getAll()) {
        result = await interceptor(result);
      }
      for (const interceptor of interceptors.response.getAll()) {
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
            requestCfg,
            null
          );
      
      // 错误拦截器：实例级 → 默认
      for (const interceptor of localInterceptors.error.getAll()) {
        const res = await interceptor(apiError);
        if (res) return res;
      }
      for (const interceptor of interceptors.error.getAll()) {
        const res = await interceptor(apiError);
        if (res) return res;
      }
      
      // 实例优先的错误处理，其次使用全局 onError
      if (localOnError) {
        localOnError(apiError);
      } else if (onError) {
        onError(apiError);
      }
      
      throw apiError;
    }
  };

  const client = async <
    T extends keyof API_Endpoints,
    M extends keyof API_Endpoints[T] & string
  >(
    path: T,
    method: M,
    ...args: IsOptionsRequired<T, M> extends true ? [options: ApiClientOptions<T, M>] : [options?: ApiClientOptions<T, M>]
  ): Promise<ApiResponse<ExtractSuccessResponses<API_Endpoints[T][M]>>> => {
    const options = args[0];
    const { 
      query = {}, 
      params = {}, 
      header = {},
      cookie = {},
      body = {}, 
      baseUrl = instanceConfig.baseUrl,
      headers = instanceConfig.headers,
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
    const timeout = requestConfig.timeout ?? instanceConfig.timeout;
    
    // 构建请求配置
    let requestCfg: RequestConfig = {
      url,
      method,
      headers: mergedHeaders,
      body: processedBody,
      signal: requestConfig.signal,
      timeout,
      retry: requestConfig.retry,
      httpClient: requestConfig.httpClient,
    };
    
    return coreRequest(requestCfg);
  };

  const boundClient = client as ApiClientInstance;
  boundClient.request = coreRequest;
  boundClient.config = instanceConfig;
  boundClient.interceptors = localInterceptors;
  boundClient.setErrorHandler = (handler: (error: ApiError) => void) => {
    localOnError = handler;
  };
  boundClient.getHttpClient = () => instanceConfig.httpClient;
  boundClient.setHttpClient = (client: HttpClient) => {
    instanceConfig.httpClient = client;
    if (isDefaultInstance) {
      config.httpClient = client;
    }
  };

  return boundClient;
}

// 默认实例，保持旧用法兼容
const defaultClient = createApiClient();

export default defaultClient;
export const requestInterceptors = defaultClient.interceptors.request;
export const responseInterceptors = defaultClient.interceptors.response;
export const errorInterceptors = defaultClient.interceptors.error;
export const getHttpClient = defaultClient.getHttpClient;
export const setHttpClient = defaultClient.setHttpClient;
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
