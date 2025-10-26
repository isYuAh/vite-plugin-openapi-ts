import { Command } from "commander";
import path from "path";
import pc from "picocolors";
import fs from "fs";
import { extractBaseUrl, generate } from "../shared/utils";

const DEFAULT_OUTPUT_DIR = "src/openapi";

export const cleanCacheCommand = new Command("clean-cache")
  .description("Clean generated cache")
  .option("-d, --dir <outputDir>", "Output directory", DEFAULT_OUTPUT_DIR)
  .action((options) => {

    const cachePath = path.join(path.resolve(process.cwd(), options.dir), '.openapi-cache.json')
    if (fs.existsSync(cachePath)) {
      try {
        fs.unlinkSync(cachePath);
        console.log(pc.green("[openapi-ts] Cache file deleted successfully."));
      } catch (error) {
        console.log(pc.red("[openapi-ts] Failed to delete cache file:"), error);
      }
    }else {
      console.log(pc.yellow("[openapi-ts] No cache file found."));
      return;
    }
  });

export const cleanCommand = new Command("clean")
  .description("Clean generated types")
  .option("-c, --clean-cache", "Also clean cache file", true)
  .option("-d, --dir <outputDir>", "Output directory", DEFAULT_OUTPUT_DIR)
  .action((options) => {
    const outputPath = path.resolve(process.cwd(), options.dir);
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(path.join(outputPath, "schemes.ts"));
        fs.unlinkSync(path.join(outputPath, "index.ts"));
        if (options.cleanCache) {
          const cachePath = path.join(outputPath, '.openapi-cache.json')
          if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
            console.log(pc.green("[openapi-ts] Cache file deleted successfully."));
          }
        }
        console.log(pc.green("[openapi-ts] Generated files deleted successfully."));
      } catch (error) {
        console.log(pc.red("[openapi-ts] Failed to delete generated files:"), error);
      }
    } else {
      console.log(pc.yellow("[openapi-ts] No generated files found."));
      return;
    }
  });

export const generateCommand = new Command("generate")
  .aliases(["gen", "g"])
  .description("Generate TypeScript types from OpenAPI specification")
  .option("-u, --url <specUrl>", "OpenAPI specification URL")
  .option("-b, --base-url <baseUrl>", "Base URL for the API client")
  .option("-o, --output-dir <outputDir>", "Output directory", DEFAULT_OUTPUT_DIR)
  .option("-c, --enable-cache", "Enable cache to skip regeneration if spec hasn't changed", true)
  .option("-t, --skip-timeout <timeout>", "Timeout in milliseconds to skip regeneration if url hasn't changed", "0")
  .action(async (options) => {
    let config: any;
    if (!options.url) {
      if (fs.existsSync("openapi.config.json")) {
        const configContent = fs.readFileSync("openapi.config.json", "utf-8");
        const config = JSON.parse(configContent);
      }
      console.log(pc.red("[openapi-ts] Specification URL is required. Use -u or --url to specify it."));
      process.exit(1);
    }
    const specUrl = options.url || config?.url;
    if (!specUrl) {
      console.log(pc.red("[openapi-ts] Specification URL is required. Use -u or --url to specify it or provide in openapi.config.json"));
      process.exit(1);
    }
    const baseUrl = options.baseUrl || config?.baseUrl || extractBaseUrl(specUrl);
    const outputDir = options.outputDir;
    const enableCache = options.enableCache;
    const skipTimeout = parseInt(options.skipTimeout, 10) || 0;
    try {
      generate({
        url: specUrl,
        baseUrl,
        outputDir,
        enableCache,
        skipTimeout,
      });
    } catch (error) {
      console.log(pc.red("[openapi-ts] Failed to generate types:"), error);
    }
  });