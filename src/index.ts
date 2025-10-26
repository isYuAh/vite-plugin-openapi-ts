import { type Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import yaml from 'js-yaml';
import { calculateHash } from './shared/utils'
import { genSchemes, summary } from './shared/generator';

const CONFIG_FILENAME = 'openapi.config.json';

export interface PluginOptions {
  /** OpenAPI specification URL (supports both JSON and YAML formats) */
  url: string;
  /** API base URL for the generated client */
  baseUrl?: string;
  /** Output directory relative to project root */
  outputDir?: string;
  /** Enable cache to skip regeneration if spec hasn't changed (default: true) */
  enableCache?: boolean;
  /** Timeout in milliseconds to skip regeneration if url hasn't changed (default: 0) */
  skipTimeout?: number;
}

/**
 * Vite plugin to generate TypeScript types and API client from OpenAPI specification
 */
export default function openapiPlugin(options?: PluginOptions): Plugin {

  // 如果没有传入 options，则尝试从配置文件加载
  if (!options) {
    const config_path = path.resolve(process.cwd(), CONFIG_FILENAME);
    if (fs.existsSync(config_path)) {
      const configContent = fs.readFileSync(config_path, 'utf-8');
      options = JSON.parse(configContent) as PluginOptions;
    } else {
      console.warn(pc.yellow(`[openapi-ts] No configuration provided and ${CONFIG_FILENAME} not found. Plugin will be inactive.`));
      return { name: 'vite-plugin-openapi-ts' };
    }
  }
  
  const {
    url,
    outputDir = 'src/openapi',
    enableCache = true,
    skipTimeout = 0,
  } = options;

  // 从 URL 中提取 baseUrl (协议 + 域名 + 端口)
  const extractBaseUrl = (urlString: string): string => {
    try {
      const urlObj = new URL(urlString);
      return `${urlObj.protocol}//${urlObj.host}`;
    } catch (error) {
      console.warn(pc.yellow(`[openapi-ts] Failed to extract baseUrl from URL "${urlString}", using default: http://localhost:8080`));
      return 'http://localhost:8080';
    }
  };

  const baseUrl = options.baseUrl ?? extractBaseUrl(url);



  /**
   * 获取缓存文件路径
   */
  const getCachePath = (outputPath: string): string => {
    return path.join(outputPath, '.openapi-cache.json');
  };

  /**
   * 读取缓存
   */
  const readCache = (cachePath: string): { hash: string; timestamp: number, baseUrl: string, url: string } | null => {
    try {
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        return cache;
      }
    } catch (error) {
      // 缓存文件损坏或无效，忽略
    }
    return null;
  };

  /**
   * 写入缓存
   */
  const writeCache = (cachePath: string, hash: string): void => {
    try {
      fs.writeFileSync(cachePath, JSON.stringify({
        hash,
        timestamp: Date.now(),
        url,
        baseUrl,
      }, null, 2));
    } catch (error) {
      // 写入缓存失败不影响主流程
    }
  };

  return {
    name: 'vite-plugin-openapi-ts',
    
    async buildStart() {
      try {
        this.info(pc.cyan(`[openapi-ts] Fetching OpenAPI spec from ${pc.dim(url)}`));
        const outputPath = path.resolve(process.cwd(), outputDir);
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        const cachePath = getCachePath(outputPath);
        if (skipTimeout > 0 && enableCache) {
          const cache = readCache(cachePath);
          if (cache && cache.url === url && cache.baseUrl === baseUrl && (Date.now() - cache.timestamp) < skipTimeout) {
            this.info(pc.green(`[openapi-ts] Skip timeout active, skipping generation (last generated: ${new Date(cache.timestamp).toLocaleString()})`));
            return;
          }
        }

        // 检测是否为 YAML 格式
        const isYaml = url.endsWith('.yaml') || url.endsWith('.yml');
        
        // 获取 OpenAPI spec 内容
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
        }
        
        const specText = await response.text();
        
        // 计算 spec 的 hash
        const specHash = calculateHash(specText);
        
        // 检查缓存
        if (enableCache) {
          const cache = readCache(cachePath);
          if (cache && cache.hash === specHash && cache.baseUrl === baseUrl && cache.url === url) {
            // 验证生成的文件是否存在
            const schemesPath = path.join(outputPath, 'schemes.ts');
            const indexPath = path.join(outputPath, 'index.ts');
            
            if (fs.existsSync(schemesPath) && fs.existsSync(indexPath)) {
              this.info(pc.green(`[openapi-ts] Cache hit, skipping generation (hash: ${pc.dim(specHash.slice(0, 8))})`));
              return;
            } else {
              this.warn(pc.yellow(`[openapi-ts] Cache found but generated files missing, regenerating...`));
            }
          }
        }
        
        // 解析 OpenAPI spec
        const contentType = response.headers.get('content-type') || '';
        const shouldParseAsYaml = contentType.includes('yaml') || 
                                  contentType.includes('yml') || 
                                  isYaml;
        
        let openapi: any;
        try {
          // 根据检测结果解析
          if (shouldParseAsYaml) {
            this.info(pc.dim('[openapi-ts] Parsing as YAML format'));
            openapi = yaml.load(specText);
          } else {
            this.info(pc.dim('[openapi-ts] Parsing as JSON format'));
            openapi = JSON.parse(specText);
          }
        } catch (parseError) {
          // 如果解析失败，尝试另一种格式（智能回退）
          this.warn(pc.yellow(`[openapi-ts] Failed to parse as ${shouldParseAsYaml ? 'YAML' : 'JSON'}, trying alternative format...`));
          try {
            openapi = shouldParseAsYaml ? JSON.parse(specText) : yaml.load(specText);
          } catch (fallbackError) {
            throw new Error(`Failed to parse OpenAPI spec: ${parseError}`);
          }
        }
        
        const schemes = openapi.components?.schemas || {};
        const paths = openapi.paths || {};
        const servers: string[] = (openapi.servers || []).map((server: any) => server.url);
        
        // 生成 schemes.ts
        fs.writeFileSync(
          path.join(outputPath, 'schemes.ts'),
          `// Auto-generated by vite-plugin-openapi-ts\n// Do not edit this file manually\n\n` +
          genSchemes(schemes)
        );
        
        // 生成 index.ts
        fs.writeFileSync(
          path.join(outputPath, 'index.ts'),
          `// Auto-generated by vite-plugin-openapi-ts\n// Do not edit this file manually\n\n` +
          summary(paths, baseUrl, schemes, servers)
        );
        
        this.info(pc.green(`[openapi-ts] Generated ${pc.bold(outputDir + '/schemes.ts')} and ${pc.bold(outputDir + '/index.ts')}`));
        
        // 写入缓存
        if (enableCache) {
          writeCache(cachePath, specHash);
        }
        
      } catch (error) {
        this.error(pc.red(`[openapi-ts] Failed to generate types: ${error}`));
      }
    }
  };
}

// 命名导出
export { openapiPlugin };
