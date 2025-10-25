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

  const type = schema.type;
  
  if (type === 'array') {
    const itemType = schema.items ? inferType(schema.items, schemas, useNamespace) : 'any';
    return `Array<${itemType}>`;
  }

  if (type === 'object') {
    if (schema.properties) {
      const objType = new ConstructType();
      const required = schema.required || [];
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(propName);
        const propType = inferType(propSchema, schemas, useNamespace);
        objType.push([propName, propType, isRequired]);
      }
      return objType.build();
    }
    if (schema.additionalProperties) {
      const valueType = schema.additionalProperties === true 
        ? 'any' 
        : inferType(schema.additionalProperties, schemas, useNamespace);
      return `Record<string, ${valueType}>`;
    }
    return 'Record<string, any>';
  }

  if (type === 'string') {
    if (schema.enum) {
      return schema.enum.map((e: any) => `'${e}'`).join(' | ');
    }
    return mapOpenAPITypeToTS('string', schema.format);
  }

  if (type === 'number' || type === 'integer') {
    return mapOpenAPITypeToTS(type, schema.format);
  }

  if (type === 'boolean') return 'boolean';
  if (type === 'null') return 'null';
  if (type === 'file') return 'File';

  if (schema.enum) {
    return schema.enum.map((e: any) => typeof e === 'string' ? `'${e}'` : e).join(' | ');
  }

  return 'any';
}

/**
 * 生成 schemes.ts 内容
 */
export function genSchemes(object: OpenAPIScheme): string {
  let schemes = '';
  for (const [name, scheme] of Object.entries(object)) {
    schemes += `export interface SCHEME_${name} {\n`;
    for (const [propName, prop] of Object.entries(scheme.properties)) {
      const isRequired = scheme.required.includes(propName);
      const optionalMark = isRequired ? '' : '?';
      const propType = inferType(prop as any, object, false);
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
} {
  const result = {
    pathParams: new ConstructType(),
    queryParams: new ConstructType(),
  };
  
  for (const value of params) {
    const paramType = inferType(value.schema, schemas);
    if (value.in === 'path') {
      result.pathParams.push([value.name, paramType, value.required]);
    } else if (value.in === 'query') {
      result.queryParams.push([value.name, paramType, value.required]);
    }
  }
  
  return {
    pathParams: result.pathParams.build(),
    queryParams: result.queryParams.build(),
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
  const serverTypes = servers.length > 0 
    ? servers.map(s => `'${s}'`).join(' | ') + ' | string'
    : 'string';
    
  return `
export type ServerUrl = ${serverTypes};

export let config = {
  baseUrl: "${base}" as ServerUrl,
  headers: {
    "Content-Type": "application/json"
  }
}

export const buildPath = (template: string, params: Record<string, any>): string => {
  return template.split("/").map(seg => {
    if (seg.startsWith("{") && seg.endsWith("}")) {
      seg = seg.slice(1, -1);
    }
    if (seg.startsWith("**")) {
      seg = seg.slice(2);
      seg = params[seg];
    }
    if (seg.startsWith(":") || seg.startsWith("*")) {
      seg = seg.slice(1);
      seg = params[seg];
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
    body = {}, 
    baseUrl = config.baseUrl,
    headers = config.headers
  } = options || {};
  
  const url = new URL(buildPath(path as string, params as any), baseUrl)
  url.search = new URLSearchParams(query as any).toString();
  const configs: any = {
    method,
    headers,
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
  return `import type * as Schemes from './schemes';

${genPaths(paths, schemas)}

${genClient(base, servers)}
`;
}
