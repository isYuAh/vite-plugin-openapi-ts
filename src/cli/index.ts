#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";

const program = new Command();

program.name("openapi-ts").description("CLI tool to generate TypeScript types from OpenAPI specifications").version("1.0.0");

import { generateCommand } from "./command";
import { cleanCommand } from "./command";
import { cleanCacheCommand } from "./command";

program.addCommand(generateCommand);
program.addCommand(cleanCommand);
program.addCommand(cleanCacheCommand);

program.parse(process.argv);