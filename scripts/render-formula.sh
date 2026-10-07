#!/usr/bin/env bash
# Print the Homebrew formula for a release.
# Usage: scripts/render-formula.sh <version> <checksums.txt>
set -euo pipefail
version="${1#v}"
checksums="$2"
repo="tristan-laroubine/alfred"

sha() {
  local value
  value=$(grep " alfred-$1.tar.gz\$" "$checksums" | cut -d' ' -f1)
  if [ -z "$value" ]; then
    echo "Missing checksum for $1" >&2
    exit 1
  fi
  echo "$value"
}

cat <<RUBY
class Allfy < Formula
  desc "Butler for your CLI: run your own shell commands from a JSON file"
  homepage "https://github.com/$repo"
  version "$version"

  on_macos do
    on_arm do
      url "https://github.com/$repo/releases/download/v#{version}/alfred-darwin-arm64.tar.gz"
      sha256 "$(sha darwin-arm64)"
    end
    on_intel do
      url "https://github.com/$repo/releases/download/v#{version}/alfred-darwin-x64.tar.gz"
      sha256 "$(sha darwin-x64)"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/$repo/releases/download/v#{version}/alfred-linux-arm64.tar.gz"
      sha256 "$(sha linux-arm64)"
    end
    on_intel do
      url "https://github.com/$repo/releases/download/v#{version}/alfred-linux-x64.tar.gz"
      sha256 "$(sha linux-x64)"
    end
  end

  def install
    bin.install "alfred"
    generate_completions_from_executable(bin/"alfred", "completion")
  end

  def caveats
    <<~EOS
      Your commands live in ~/.config/alfred/commands.json, run \`alfred edit\` to change them.
      Run \`alfred doctor\` to check your setup.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/alfred --version")
    (testpath/"commands.json").write <<~JSON
      [{ "name": "hello", "command": { "cmd": "echo Hello \${name}" }, "options": [{ "flags": "--name <name>" }] }]
    JSON
    ENV["ALFRED_COMMANDS"] = testpath/"commands.json"
    assert_equal "Hello Brew", shell_output("#{bin}/alfred hello --name Brew 2>/dev/null").strip
  end
end
RUBY
