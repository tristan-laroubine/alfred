#!/usr/bin/env bash
cd "$(dirname "$0")"


# Compile and bundle the TypeScript file
bun build src/main.ts --compile --minify --outfile dist/alfred
# Delete .bun-build files
find . -iname '*.bun-build' -type f -delete
