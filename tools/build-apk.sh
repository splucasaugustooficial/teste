#!/usr/bin/env bash
# Gera dist/snake-livre.apk. Precisa do Android SDK (platform 35 e build-tools 35)
# em ANDROID_HOME e do Java 17+.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "Defina ANDROID_HOME com o Android SDK." >&2
  exit 1
fi
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
python3 tools/make-icons.py
cd android
if [[ ! -x ./gradlew ]]; then
  gradle wrapper --gradle-version 8.11.1
fi
./gradlew assembleDebug
mkdir -p ../dist
cp -f app/build/outputs/apk/debug/app-debug.apk ../dist/snake-livre.apk
echo "APK em dist/snake-livre.apk"
