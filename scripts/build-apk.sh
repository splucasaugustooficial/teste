#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
node scripts/sync-android-assets.mjs
python3 scripts/make-icons.py
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
if [[ ! -d "$sdk" ]]; then
  echo "Android SDK não encontrado em $sdk" >&2
  exit 1
fi
printf 'sdk.dir=%s\n' "$sdk" > android/local.properties
cd android
./gradlew assembleRelease --no-daemon
mkdir -p "$root/dist" /opt/cursor/artifacts
cp -f app/build/outputs/apk/release/app-release.apk "$root/dist/CobraArena.apk"
cp -f app/build/outputs/apk/release/app-release.apk /opt/cursor/artifacts/CobraArena.apk
echo "APK: $root/dist/CobraArena.apk"
