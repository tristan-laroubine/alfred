#!/bin/sh
# Install alfred from the GitHub releases.
#
#   curl -fsSL https://raw.githubusercontent.com/tristan-laroubine/alfred/main/install.sh | sh
#
# Environment variables:
#   ALFRED_VERSION       version to install (default: latest)
#   ALFRED_INSTALL_DIR   where to put the binary (default: ~/.local/bin)
set -eu

REPO="tristan-laroubine/alfred"
VERSION="${ALFRED_VERSION:-latest}"
INSTALL_DIR="${ALFRED_INSTALL_DIR:-$HOME/.local/bin}"

fail() {
  echo "✖ $*" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "Unsupported system: $(uname -s)" ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "Unsupported architecture: $(uname -m)" ;;
esac
# A shell running under Rosetta reports x86_64: use the native binary
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
  arch=arm64
fi

asset="alfred-$os-$arch.tar.gz"
if [ -n "${ALFRED_DOWNLOAD_URL:-}" ]; then
  base_url="$ALFRED_DOWNLOAD_URL"
elif [ "$VERSION" = latest ]; then
  base_url="https://github.com/$REPO/releases/latest/download"
else
  base_url="https://github.com/$REPO/releases/download/v${VERSION#v}"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "› Downloading $asset ($VERSION)"
curl -fsSL "$base_url/$asset" -o "$tmp/$asset" || fail "Download failed: $base_url/$asset"
curl -fsSL "$base_url/checksums.txt" -o "$tmp/checksums.txt" || fail "Download failed: $base_url/checksums.txt"

expected="$(grep " $asset\$" "$tmp/checksums.txt" | cut -d' ' -f1)"
if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)"
else
  actual="$(sha256sum "$tmp/$asset" | cut -d' ' -f1)"
fi
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "Checksum mismatch for $asset"

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$INSTALL_DIR"
install -m 755 "$tmp/alfred" "$INSTALL_DIR/alfred"
echo "✔ Installed $("$INSTALL_DIR/alfred" --version) in $INSTALL_DIR/alfred"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "⚠ $INSTALL_DIR is not in your PATH, add this line to your shell config:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
echo "Next: run 'alfred init' to create your commands file and enable completion."
