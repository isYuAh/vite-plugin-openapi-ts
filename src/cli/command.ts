import { Command } from "commander";
import path from "path";
import pc from "picocolors";
import fs from "fs";
import { extractBaseUrl, generate } from "../shared/utils";

const DEFAULT_OUTPUT_DIR = "src/openapi";

export const initCommand = new Command("init")
  .description("Initialize openapi-ts config file and gitignore entries")
  .option("-u, --url <specUrl>", "OpenAPI specification URL to prefill in config")
  .option("-b, --base-url <baseUrl>", "Base URL to prefill in config")
  .option("-o, --output-dir <outputDir>", "Output directory for generated files", DEFAULT_OUTPUT_DIR)
  .option("-f, --force", "Overwrite existing openapi.config.json if it exists", false)
  .action((options) => {
    const cwd = process.cwd();
    const configPath = path.resolve(cwd, "openapi.config.json");

    const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;

    const configExists = fs.existsSync(configPath);
    let existingConfig: any = null;

    if (configExists) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        existingConfig = JSON.parse(content);
      } catch (error) {
        console.log(
          pc.yellow(
            "[openapi-ts] Existing openapi.config.json is not valid JSON. It will not be overwritten without --force."
          )
        );
      }
    }

    if (configExists && !options.force) {
      console.log(
        pc.yellow(
          "[openapi-ts] openapi.config.json already exists. Use --force to overwrite it, or edit it manually."
        )
      );
    } else {
      const config = {
        url: options.url || "",
        baseUrl: options.baseUrl || "",
        outputDir,
        enableCache: true,
        skipTimeout: 0,
        force: false,
      };

      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
        console.log(pc.green("[openapi-ts] openapi.config.json has been initialized."));
        if (!config.url) {
          console.log(
            pc.yellow(
              '[openapi-ts] Please edit openapi.config.json to fill in the "url" field before running generate.'
            )
          );
        }
      } catch (error) {
        console.log(pc.red("[openapi-ts] Failed to write openapi.config.json:"), error);
      }
    }

    // Decide which outputDir to use when updating .gitignore
    let outputDirForIgnore = outputDir;
    if (existingConfig && typeof existingConfig.outputDir === "string" && !options.force) {
      outputDirForIgnore = existingConfig.outputDir;
    }

    const normalizedOutputDir = outputDirForIgnore.replace(/\\/g, "/").replace(/\/+$/, "");
    const gitignorePath = path.resolve(cwd, ".gitignore");

    const entries = [
      "# vite-plugin-openapi-ts",
      `${normalizedOutputDir}/`,
      `${normalizedOutputDir}/.openapi-cache.json`,
    ];

    try {
      let gitignoreContent = "";
      if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      }

      const lines = gitignoreContent.split(/\r?\n/);
      const missingEntries = entries.filter((entry) => entry && !lines.includes(entry));

      if (missingEntries.length === 0) {
        console.log(pc.dim("[openapi-ts] .gitignore already contains entries for generated files."));
        return;
      }

      const needsNewline = gitignoreContent.length > 0 && !gitignoreContent.endsWith("\n");
      const toAppend =
        (needsNewline ? "\n" : "") +
        missingEntries.join("\n") +
        "\n";

      fs.writeFileSync(gitignorePath, gitignoreContent + toAppend);
      console.log(pc.green("[openapi-ts] .gitignore updated with vite-plugin-openapi-ts entries."));
    } catch (error) {
      console.log(pc.yellow("[openapi-ts] Failed to update .gitignore:"), error);
    }
  });

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
  .option("-f, --force", "Force regeneration by bypassing the cache", false)
  .action(async (options) => {
    let config: any = {};

    const configPath = path.resolve(process.cwd(), "openapi.config.json");
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, "utf-8");
        config = JSON.parse(configContent);
      } catch (error) {
        console.log(pc.yellow("[openapi-ts] Failed to read openapi.config.json, falling back to CLI options only:"), error);
      }
    }

    const specUrl = options.url || config.url;
    if (!specUrl) {
      console.log(pc.red("[openapi-ts] Specification URL is required. Use -u or --url to specify it or provide in openapi.config.json"));
      process.exit(1);
    }
    const isRemote = specUrl.startsWith('http');
    let baseUrl = options.baseUrl || config.baseUrl;

    if (!baseUrl) {
      if (isRemote) {
        baseUrl = extractBaseUrl(specUrl);
      } else {
        console.log(pc.red("[openapi-ts] Base URL is required for local spec files. Use -b or --base-url to specify it or provide baseUrl in openapi.config.json."));
        process.exit(1);
      }
    }

    const outputDir = options.outputDir || config.outputDir || DEFAULT_OUTPUT_DIR;
    const enableCache = options.enableCache ?? (config.enableCache ?? true);
    const skipTimeout = options.skipTimeout !== undefined
      ? (parseInt(options.skipTimeout, 10) || 0)
      : (config.skipTimeout ?? 0);
    const force = options.force ?? (config.force ?? false);

    try {
      generate({
        url: specUrl,
        baseUrl,
        outputDir,
        enableCache,
        skipTimeout,
        force,
      });
    } catch (error) {
      console.log(pc.red("[openapi-ts] Failed to generate types:"), error);
    }
  });
