import { appendFileSync } from "fs";
import { install } from "tabtab";
import { interactiveInitCache } from "../src/localCache";
import { $ } from "bun";

appendFileSync('./tmp-postinstall.log', 'postinstall triggered\n');

console.log("🤖 Initializing alfred CLI...");
await interactiveInitCache();
await install({
    name: "alfred",
    completer: "alfred",
});
$`bun i`;
await Bun.build({
  entrypoints: ['./src/main.ts'],
  outdir: './dist',
  compile: true,
});
console.log("✅ alfred CLI initialized successfully!");