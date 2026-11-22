#!/usr/bin/env bash
# Build, sign (Developer ID: Digital Vibes GmbH), notarize and publish the macOS builds.
#
#   npm run release:mac                  # build + tag + upload to GitHub release v<version>
#   SKIP_UPLOAD=1 npm run release:mac    # local signed + notarized build only
#   NOTARIZE=0 SKIP_UPLOAD=1 ...         # signed but not notarized (quick check; Gatekeeper rejects it)
#
# Notarization uses a notarytool keychain profile (default "splatcraft", same Apple team).
# Create one once per machine with
#   xcrun notarytool store-credentials <name> --apple-id <id> --team-id 8HFX6YPXXN
# Windows and Linux builds are made by .github/workflows/release.yml when the tag is pushed.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
export CSC_NAME="${CSC_NAME:-Digital Vibes GmbH (8HFX6YPXXN)}"

if [[ -z "${SKIP_UPLOAD:-}" && -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit first (or use SKIP_UPLOAD=1)." >&2; exit 1
fi
if [[ "${NOTARIZE:-1}" == "0" ]]; then
  unset APPLE_KEYCHAIN_PROFILE APPLE_ID APPLE_API_KEY
  NOTARIZE_FLAG=(-c.mac.notarize=false)
  echo "⚠  NOTARIZE=0: the build will be signed but not notarized." >&2
else
  export APPLE_KEYCHAIN_PROFILE="${APPLE_KEYCHAIN_PROFILE:-splatcraft}"
  NOTARIZE_FLAG=()
fi

echo "▸ OneShot $TAG"
npm ci
npm run lint
npm test
rm -rf dist
npx electron-builder --mac --publish never ${NOTARIZE_FLAG[@]+"${NOTARIZE_FLAG[@]}"}

ARTIFACTS=(dist/*.dmg dist/*.dmg.blockmap dist/*-mac-*.zip dist/*-mac-*.zip.blockmap dist/latest-mac.yml)
for app in dist/mac*/OneShot.app; do
  codesign --verify --deep --strict "$app"
  spctl -a -t exec -vv "$app" 2>&1 || { [[ "${NOTARIZE:-1}" == "0" ]] || exit 1; }
done
ls -lh "${ARTIFACTS[@]}"

[[ -n "${SKIP_UPLOAD:-}" ]] && exit 0

if ! git rev-parse "$TAG" >/dev/null 2>&1; then git tag -a "$TAG" -m "OneShot $TAG"; fi
git push origin "$TAG"
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" --title "OneShot $TAG" --generate-notes --verify-tag
fi
gh release upload "$TAG" "${ARTIFACTS[@]}" --clobber
gh release view "$TAG" --web >/dev/null 2>&1 || gh release view "$TAG"
