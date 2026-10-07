#!/usr/bin/env bash
# Build the standalone binaries attached to GitHub releases (used by Homebrew and install.sh).
# Usage: scripts/build-binaries.sh [target...]   (default: all targets)
set -euo pipefail
cd "$(dirname "$0")/.."

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=(darwin-arm64 darwin-x64 linux-arm64 linux-x64)
fi

rm -rf build release
mkdir -p release
for target in "${targets[@]}"; do
  echo "› $target"
  bun build src/main.ts --compile --minify --target="bun-$target" --outfile "build/$target/alfred"
  if [[ "$target" == darwin-* && "$(uname -s)" == Darwin ]]; then
    # Unsigned arm64 binaries are killed by macOS: sign them ad-hoc
    codesign --force --sign - "build/$target/alfred"
  fi
  tar -czf "release/alfred-$target.tar.gz" -C "build/$target" alfred
done
(cd release && shasum -a 256 alfred-*.tar.gz > checksums.txt)
cat release/checksums.txt
