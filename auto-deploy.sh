#!/usr/bin/env bash
cd "$(dirname "$0")"


# Compile and bundle the TypeScript file
bun build src/main.ts --compile --minify --outfile dist/alfred
# Delete .bun-build files
find . -iname '*.bun-build' -type f -delete

# Enable alias expansion
shopt -s expand_aliases

# Load .zprofile to check if the alias already exists
source ~/.zprofile

# Check if alfred is installed by running alfred --version
if ! command -v alfred &> /dev/null; then
  echo "Alfred is not installed"
  
  # Create an alias for the compiled Alfred command
  echo "alias alfred='$(pwd)/dist/alfred'" >> ~/.zprofile
  echo "Alfred command alias added to ~/.zprofile"
  
  # Reload .zprofile to immediately apply the alias
  source ~/.zprofile
else
  echo "Alfred is already installed"
  alfred --version
fi
