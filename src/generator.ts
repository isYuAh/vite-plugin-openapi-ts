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
 * 将 OpenAPI 类型映射为 TypeScript 类型
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
 * 推断 OpenAPI schema 的 TypeScript 类型
 * 支持 OpenAPI 3.0 和 3.1 规范
 */
export function inferType(
  schema: any,
  schemas?: OpenAPIScheme,
  useNamespace: boolean = true
): string {
  if (!schema) return 'any';

  // 处理 $ref 引用
  if (schema.$ref) {
    const refPath = schema.$ref.split('/');
    const refName = refPath[refPath.length - 1];
    if (schema.$ref.includes('/components/schemas/')) {
      return useNamespace ? `Schemes.SCHEME_${refName}` : `SCHEME_${refName}`;
    }
    return refName || 'any';
  }

  // 处理 allOf (交叉类型)
  if (schema.allOf) {
    const types = schema.allOf.map((s: any) => inferType(s, schemas, useNamespace));
    return types.join(' & ');
  }

  // 处理 oneOf/anyOf (联合类型)
  if (schema.oneOf || schema.anyOf) {
    const types = (schema.oneOf || schema.anyOf).map((s: any) => inferType(s, schemas, useNamespace));
    return types.join(' | ');
  }

  // OpenAPI 3.1: 支持 const 关键字（单一值枚举）
  if (schema.const !== undefined) {
    return typeof schema.const === 'string' ? `'${schema.const}'` : String(schema.const);
  }

  const type = schema.type;
  
  // OpenAPI 3.1: 支持 type 为数组，如 type: ["string", "null"]
  if (Array.isArray(type)) {
    const types = type.map(t => {
      if (t === 'null') return 'null';
      if (t === 'array') {
        const itemType = schema.items ? inferType(schema.items, schemas, useNamespace) : 'any';
        return `Array<${itemType}>`;
      }
      if (t === 'object') return 'object';
      return mapOpenAPITypeToTS(t, schema.format);
    });
    return types.join(' | ');
  }

  // OpenAPI 3.0: 支持 nullable 字段（已废弃，但仍需兼容）
  const isNullable = schema.nullable === true;
  
  if (type === 'array') {
    const itemType = schema.items ? inferType(schema.items, schemas, useNamespace) : 'any';
    const arrayType = `Array<${itemType}>`;
    return isNullable ? `${arrayType} | null` : arrayType;
  }

  if (type === 'object') {
    let objectType: string;
    if (schema.properties) {
      const objType = new ConstructType();
      const required = schema.required || [];
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(propName);
        const propType = inferType(propSchema, schemas, useNamespace);
        objType.push([propName, propType, isRequired]);
      }
      objectType = objType.build();
    } else if (schema.additionalProperties) {
      const valueType = schema.additionalProperties === true 
        ? 'any' 
        : inferType(schema.additionalProperties, schemas, useNamespace);
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

  // 处理没有 type 但有 enum 的情况
  if (schema.enum) {
    const enumType = schema.enum.map((e: any) => typeof e === 'string' ? `'${e}'` : e).join(' | ');
    return isNullable ? `${enumType} | null` : enumType;
  }

  return 'any';
}

/**
 * 生成 schemes.ts 内容
 */
export function genSchemes(object: OpenAPIScheme): string {
  let schemes = '';
  for (const [name, scheme] of Object.entries(object)) {
    // 添加 JSDoc 注释
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
      const propType = inferType(prop as any, object, false);
      
      // 为每个属性添加描述注释
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
export function parseParams(params: ApiParameter[], schemas?: OpenAPIScheme): {
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
  
  for (const value of params) {
    const paramType = inferType(value.schema, schemas);
    if (value.in === 'path') {
      result.pathParams.push([value.name, paramType, value.required]);
    } else if (value.in === 'query') {
      result.queryParams.push([value.name, paramType, value.required]);
    } else if (value.in === 'header') {
      result.headerParams.push([value.name, paramType, value.required]);
    } else if (value.in === 'cookie') {
      result.cookieParams.push([value.name, paramType, value.required]);
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
 * 解析请求体
 */
export function parseRequestBody(requestBody: { content: Record<string, any> }, schemas: OpenAPIScheme): string {
  if (requestBody.content) {
    for (const [contentType, content] of Object.entries(requestBody.content)) {
      if (contentType === 'application/json') {
        const paramType = inferType(content.schema, schemas);
        return paramType;
      } else if (contentType === 'application/x-www-form-urlencoded') {
        return 'FormData';
      } else if (contentType.startsWith('multipart/')) {
        return 'FormData';
      }
    }
  }
  return 'any';
}

/**
 * 解析响应类型
 */
export function parseResponse(response: any, schemas: OpenAPIScheme): string {
  if (!response || !response.content) {
    return 'void';
  }
  
  for (const [contentType, content] of Object.entries(response.content)) {
    if (contentType === 'application/json') {
      if (content && (content as any).schema) {
        return inferType((content as any).schema, schemas);
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
 * 生成 API 端点类型
 */
export function genPaths(endpoints: OpenapiPaths, schemas: OpenAPIScheme): string {
  let paths = 'export type API_Endpoints = ';
  const pathMain = new ConstructType();
  
  for (const [path, endpoint] of Object.entries(endpoints)) {
    const pathType = new ConstructType();
    
    for (const method of Object.keys(endpoint)) {
      const methodType = new ConstructType();
      const endpointDetail = endpoint[method as HttpMethod];
      const r = parseParams(endpointDetail.parameters || [], schemas);
      
      methodType.push(['pathParams', r.pathParams]);
      methodType.push(['queryParams', r.queryParams]);
      methodType.push(['headerParams', r.headerParams]);
      methodType.push(['cookieParams', r.cookieParams]);
      methodType.push(['bodyParams', parseRequestBody(endpointDetail.requestBody || {content: {}}, schemas)]);
      
      // Responses
      const responsesType = new ConstructType();
      const responses = endpointDetail.responses || {};
      for (const [statusCode, response] of Object.entries(responses)) {
        const responseType = parseResponse(response, schemas);
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
 * 生成 API 客户端代码
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
  }
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
      const cleanName = paramName.replace(/^\*+/, '');
      return params[cleanName] ?? seg;
    }
    // 处理 Express/Koa 风格 :paramName
    if (seg.startsWith(":")) {
      const paramName = seg.slice(1);
      return params[paramName] ?? seg;
    }
    // 处理通配符 *paramName 或 **paramName
    if (seg.startsWith("*")) {
      const paramName = seg.replace(/^\*+/, '');
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
): Promise<ApiResponse<API_Endpoints[T][M] extends {responses: {200: infer R}} ? R : any>> {
  const options = args[0];
  const { 
    query = {}, 
    params = {}, 
    header = {},
    cookie = {},
    body = {}, 
    baseUrl = config.baseUrl,
    headers = config.headers
  } = options || {};
  
  const url = new URL(buildPath(path as string, params as any), baseUrl)
  url.search = new URLSearchParams(query as any).toString();
  
  // 合并默认 headers 和参数中的 headers
  const mergedHeaders = { ...headers };
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
  
  const configs: any = {
    method,
    headers: mergedHeaders,
  };
  if (method !== 'get' && method !== 'head') {
    configs['body'] = JSON.stringify(body);
  }
  const response = await fetch(url, configs);
  
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
  return { data, response };
}
`;
}

/**
 * 生成完整的 index.ts 文件内容
 */
export function summary(paths: OpenapiPaths, base: string, schemas: OpenAPIScheme, servers: string[] = []): string {
  // 生成端点摘要注释
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

${endpointComments}${genPaths(paths, schemas)}

${genClient(base, servers)}
`;
}
