#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";
import { generateCommand, cleanCommand, cleanCacheCommand, initCommand } from "./command";

const program = new Command();

program
  .name("openapi-ts")
  .description("CLI tool to generate TypeScript types from OpenAPI specifications")
  .version("1.0.0");

program.addCommand(generateCommand);
program.addCommand(cleanCommand);
program.addCommand(cleanCacheCommand);
program.addCommand(initCommand);

program.parse(process.argv);
