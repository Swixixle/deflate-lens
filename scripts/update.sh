#!/usr/bin/env bash
# Update a downloaded or cloned copy without changing saved work or local settings.
set -euo pipefail

if [ ! -f package.json ] || ! node -e 'if(require("./package.json").name!=="deflate-lens")process.exit(1)' 2>/dev/null; then
  echo "Open Terminal in your Deflate Lens folder, then run this command again." >&2
  exit 1
fi
command -v curl >/dev/null || { echo "curl is needed to download the update." >&2; exit 1; }
command -v unzip >/dev/null || { echo "unzip is needed to open the update." >&2; exit 1; }

deflate_update_dir=$(mktemp -d)
trap 'rm -rf "$deflate_update_dir"' EXIT
echo "Downloading the latest Deflate Lens…"
curl --fail --location --silent --show-error "${DEFLATE_UPDATE_ARCHIVE:-https://github.com/Swixixle/deflate-lens/archive/refs/heads/main.zip}" -o "$deflate_update_dir/update.zip"
unzip -q "$deflate_update_dir/update.zip" -d "$deflate_update_dir"
deflate_new_source="$deflate_update_dir/deflate-lens-main"
node -e 'if(require(process.argv[1]).name!=="deflate-lens")process.exit(1)' "$deflate_new_source/package.json"

mkdir -p .deflate-backups
deflate_backup_name=".deflate-backups/source-$(date +%Y%m%d-%H%M%S)-$$.tar.gz"
tar --exclude='./.git' --exclude='./node_modules' --exclude='./data' --exclude='./.env' --exclude='./.deflate-backups' -czf "$deflate_backup_name" .
tar -C "$deflate_new_source" --exclude='./.git' --exclude='./node_modules' --exclude='./data' --exclude='./.env' --exclude='./.deflate-backups' -cf "$deflate_update_dir/source.tar" .
tar -xf "$deflate_update_dir/source.tar"
rm -rf "$deflate_update_dir"
trap - EXIT
echo "Updated. Your saved work and settings are kept."

if [ "${DEFLATE_UPDATE_NO_LAUNCH:-}" != "1" ]; then
  npm run setup
  exec npm run launch
fi
