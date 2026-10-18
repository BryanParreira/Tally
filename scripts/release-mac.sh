#!/usr/bin/env bash
# Build, sign and notarize Tally for macOS (Apple Silicon + Intel in one app).
#
# One-time setup, in your own terminal (never paste these into chat or commit them):
#   1. Store notarization credentials in your keychain:
#        xcrun notarytool store-credentials "tally-notary" \
#          --apple-id <apple id> --team-id 5PNLAR99PK   # prompts for an app-specific password
#   2. Updater signing key lives at ~/.tauri/tally.key (npx tauri signer generate -w ~/.tauri/tally.key).
#
# Then: ./scripts/release-mac.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Bryan Bernardo Parreira (5PNLAR99PK)}"

security find-identity -v -p codesigning | grep -q "$IDENTITY" || {
  echo "Signing identity not found in your keychain: $IDENTITY" >&2
  exit 1
}
PROFILE="${NOTARY_PROFILE:-tally-notary}"
xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1 || {
  echo "Notary keychain profile '$PROFILE' not found. See the setup notes at the top of this script." >&2
  exit 1
}
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -f "$HOME/.tauri/tally.key" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/tally.key")"
fi
[[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]] || echo "Note: TAURI_SIGNING_PRIVATE_KEY is not set, so the auto-update archive can't be signed." >&2

rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null
npm ci
npm test
APPLE_SIGNING_IDENTITY="$IDENTITY" npx tauri build --target universal-apple-darwin

APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Tally.app"
DMG=$(ls src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg | head -1)
echo "== Notarizing =="
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$DMG"
echo "== Checking the result =="
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose=2 "$APP"
xcrun stapler validate "$DMG"
echo "Done: $DMG"
