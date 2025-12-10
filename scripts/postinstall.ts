import { install } from "tabtab";
import { interactiveInitCache } from "../src/localCache";


console.log("🤖 Initializing alfred CLI...");
await interactiveInitCache();
await install({
    name: "alfred",
    completer: "alfred",
});
await Bun.build({
  entrypoints: ['./src/main.ts'],
  outdir: './dist',
  compile: true,
});
console.log("✅ alfred CLI initialized successfully!");