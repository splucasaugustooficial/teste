#!/usr/bin/env bash
# Gera a próxima versão a partir desta pasta.
# O APK anterior vai para backup/ se ainda não estiver guardado.
# O novo fica em apk/snake-livre.apk e em backup/<versão>/.
# Suba versionName em android/app/build.gradle.kts a cada atualização.
# Precisa do Android SDK (platform 35 e build-tools 35) em ANDROID_HOME e do Java 17+.
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
version="$(sed -n 's/.*versionName = "\([^"]*\)".*/\1/p' app/build.gradle.kts | head -1)"
root="$(cd ../.. && pwd)"
built="app/build/outputs/apk/debug/app-debug.apk"
mkdir -p "$root/apk" "$root/backup"
if [[ -f "$root/apk/snake-livre.apk" ]]; then
  saved=0
  while IFS= read -r -d '' old; do
    if cmp -s "$root/apk/snake-livre.apk" "$old"; then
      saved=1
      break
    fi
  done < <(find "$root/backup" -type f -name '*.apk' -print0)
  if [[ "$saved" -eq 0 ]]; then
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$root/backup/anteriores"
    cp -f "$root/apk/snake-livre.apk" "$root/backup/anteriores/snake-livre-${stamp}.apk"
  fi
fi
cp -f "$built" "$root/apk/snake-livre.apk"
if [[ ! -f "$root/backup/${version}/snake-livre.apk" ]]; then
  mkdir -p "$root/backup/${version}"
  cp -f "$built" "$root/backup/${version}/snake-livre.apk"
fi
echo "APK em apk/snake-livre.apk"
echo "Backup em backup/${version}/snake-livre.apk"
