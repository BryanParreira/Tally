#!/usr/bin/env bash
# Build, sign and notarize Tally for macOS (Apple Silicon + Intel in one app).
#
# One-time setup, in your own terminal (never paste these into chat or commit them):
#   1. Create an App Store Connect API key (Users and Access > Integrations > Keys),
#      download the .p8 file, and note the Key ID and Issuer ID.
#   2. export APPLE_API_KEY=<Key ID>
#      export APPLE_API_ISSUER=<Issuer ID>
#      export APPLE_API_KEY_PATH=/path/to/AuthKey_<Key ID>.p8
#   (Or, instead of the API key: APPLE_ID, APPLE_PASSWORD = an app-specific password, APPLE_TEAM_ID.)
#   3. Generate the updater signing key once: npx tauri signer generate -w ~/.tauri/tally.key
#      export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/tally.key)"
#
# Then: ./scripts/release-mac.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Bryan Bernardo Parreira (5PNLAR99PK)}"

security find-identity -v -p codesigning | grep -q "$IDENTITY" || {
  echo "Signing identity not found in your keychain: $IDENTITY" >&2
  exit 1
}
if [[ -z "${APPLE_API_KEY:-}" && -z "${APPLE_ID:-}" ]]; then
  echo "Notarization credentials missing. See the setup notes at the top of this script." >&2
  exit 1
fi
[[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]] || echo "Note: TAURI_SIGNING_PRIVATE_KEY is not set, so the auto-update archive can't be signed." >&2

rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null
npm ci
npm test
APPLE_SIGNING_IDENTITY="$IDENTITY" npx tauri build --target universal-apple-darwin

APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Tally.app"
DMG=$(ls src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg | head -1)
echo "== Checking the result =="
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose=2 "$APP"
xcrun stapler validate "$APP" || true
xcrun stapler validate "$DMG" || true
echo "Done: $DMG"
