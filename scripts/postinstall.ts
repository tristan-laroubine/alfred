#!/usr/bin/env node

import { initCacheFiles } from "../src/localCache";
import { $ } from "bun";
// A reliable postinstall script
const os = require("os");
const path = require("path");
const fs = require("fs");

try {
  const global = process.env.npm_config_global === "true";

  // Log where we are running
  const logPath = path.join(os.tmpdir(), "allfy-postinstall.log");
  fs.appendFileSync(
    logPath,
    `[${new Date().toISOString()}] postinstall triggered (global=${global})\n`
  );

  await initCacheFiles();
  $`bun i`;
  await Bun.build({
    entrypoints: ['./src/main.ts'],
    outdir: './dist',
    compile: true,
  });

  console.log("✔ postinstall executed");
  console.log("Log: " + logPath);
} catch (err) {
  console.error("postinstall failed:", err);
  process.exit(1);
}
