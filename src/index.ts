import { type Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { performGeneration, Logger, Cache } from './shared/utils';

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
  /** Force regeneration by bypassing the cache (default: false) */
  force?: boolean;
}

/**
 * Vite plugin to generate TypeScript types and API client from OpenAPI specification
 */
export default function openapiPlugin(options?: PluginOptions): Plugin {

  // If no options are passed, try to load from the config file
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
    force = false,
  } = options;

  // Extract baseUrl (protocol + domain + port) from the URL
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

  return {
    name: 'vite-plugin-openapi-ts',
    
    async buildStart() {
      const pluginLogger: Logger = {
        info: (msg: string) => this.info(msg),
        warn: (msg: string) => this.warn(msg),
        // 使用 warn 避免中断 dev 进程
        error: (msg: string) => this.warn(msg),
        dim: (msg: string) => this.info(pc.dim(msg)),
      };

      const readPluginCache = (cachePath: string): Cache | null => {
        try {
          if (fs.existsSync(cachePath)) {
            return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          }
        } catch (error) {
          // Cache file is corrupted or invalid, ignore
        }
        return null;
      };

      const writePluginCache = (cachePath: string, hash: string) => {
        try {
          fs.writeFileSync(cachePath, JSON.stringify({
            hash,
            timestamp: Date.now(),
            url,
            baseUrl,
          }, null, 2));
        } catch (error) {
          // Failing to write cache does not affect the main process
        }
      };

      try {
        await performGeneration({
          url,
          baseUrl,
          outputDir,
          enableCache,
          skipTimeout,
          force,
          logger: pluginLogger,
          readCache: readPluginCache,
          writeCache: writePluginCache,
        });
      } catch (error) {
        // 降级为警告，避免阻断 dev 命令
        pluginLogger.warn(pc.yellow(`[openapi-ts] Failed to generate types: ${error}`));
      }
    }
  };
}

// Named export
export { openapiPlugin };
