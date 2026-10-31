#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/config"
APK_DIR="$ROOT/apk"

if [[ ! -f "$CONFIG/local.properties" ]]; then
  echo "Crie $CONFIG/local.properties (veja local.properties.example)" >&2
  exit 1
fi

cd "$CONFIG"
./gradlew assembleDebug assembleRelease --no-daemon

mkdir -p "$APK_DIR"
cp -f "$ROOT/app/build/outputs/apk/debug/app-debug.apk" "$APK_DIR/CobraRede-debug.apk"
cp -f "$ROOT/app/build/outputs/apk/release/app-release-unsigned.apk" "$APK_DIR/CobraRede-release-unsigned.apk"

echo "APKs em: $APK_DIR"
ls -lh "$APK_DIR"/*.apk
