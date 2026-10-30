#!/bin/bash
# Compila o Sonora para o simulador, instala, importa músicas de demonstração
# (tons sintetizados, artistas fictícios) e tira capturas de tela de cada tela.
# Uso: scripts/simulator-demo.sh [pasta-de-saída]   (requer macOS, Xcode, ffmpeg)
set -euo pipefail

OUT="${1:-screenshots}"
BUNDLE_ID="app.sonora.player"
WORK="$(mktemp -d)"
mkdir -p "$OUT"

# iPhone disponível com o iOS mais novo.
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    if not m:
        continue
    for d in devices:
        if not d["name"].startswith("iPhone"):
            continue
        score = ((int(m[1]), int(m[2])), "Pro" in d["name"] and "Max" not in d["name"], d["name"])
        if best is None or score > best[0]:
            best = (score, d["udid"], d["name"])
print(best[1])
')
echo "Simulador: $UDID"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 || true

xcodebuild build -project Sonora.xcodeproj -scheme Sonora -configuration Debug \
  -destination "id=$UDID" -derivedDataPath build/sim CODE_SIGNING_ALLOWED=NO -quiet
xcrun simctl install "$UDID" build/sim/Build/Products/Debug-iphonesimulator/Sonora.app

shot() {
  sleep "${2:-4}"
  xcrun simctl io "$UDID" screenshot "$OUT/$1.png"
  echo "Captura: $1"
}

launch() {
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" "$@" >/dev/null
}

# 1. Primeira abertura, biblioteca vazia.
launch
shot 01-primeira-abertura

# 2. Músicas de demonstração copiadas para a pasta do app (como pelo Finder).
DOCS="$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)/Documents"
mkdir -p "$DOCS"

cover() { # cor1 cor2 arquivo
  ffmpeg -loglevel error -y -f lavfi -i "gradients=s=600x600:c0=$1:c1=$2:x0=0:y0=0:x1=600:y1=600:d=1" \
    -frames:v 1 "$3" 2>/dev/null \
  || ffmpeg -loglevel error -y -f lavfi -i "color=c=$1:s=600x600:d=1" -frames:v 1 "$3"
}

song() { # arquivo título artista álbum faixa freq duração [capa]
  local file="$1" title="$2" artist="$3" album="$4" track="$5" f="$6" dur="$7" art="${8:-}"
  local tone="aevalsrc=(0.25*sin(2*PI*$f*t)+0.15*sin(2*PI*$f*1.25*t)+0.12*sin(2*PI*$f*1.5*t))*(0.6+0.4*sin(2*PI*2*t)):s=44100:d=$dur"
  if [[ -n "$art" ]]; then
    ffmpeg -loglevel error -y -f lavfi -i "$tone" -i "$art" -map 0:a -map 1:v \
      -c:a libmp3lame -b:a 128k -c:v mjpeg -id3v2_version 3 \
      -metadata title="$title" -metadata artist="$artist" -metadata album="$album" -metadata track="$track" \
      -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -disposition:v attached_pic \
      "$DOCS/$file.mp3"
  else
    ffmpeg -loglevel error -y -f lavfi -i "$tone" -c:a aac -b:a 128k \
      -metadata title="$title" -metadata artist="$artist" -metadata album="$album" -metadata track="$track" \
      "$DOCS/$file.m4a"
  fi
}

cover 0x1e3c72 0x2ac3c9 "$WORK/litoral.jpg"
cover 0x8e2de2 0xff4569 "$WORK/cidade.jpg"
cover 0xf7971e 0xffd200 "$WORK/sol.jpg"

song mare-1 "Brisa" "Maré Alta" "Litoral" 1 220 95 "$WORK/litoral.jpg"
song mare-2 "Areia Quente" "Maré Alta" "Litoral" 2 247 112 "$WORK/litoral.jpg"
song mare-3 "Farol" "Maré Alta" "Litoral" 3 196 87 "$WORK/litoral.jpg"
song mare-4 "Última Onda" "Maré Alta" "Litoral" 4 262 130 "$WORK/litoral.jpg"
song vaga-1 "Neon" "Os Vagalumes" "Cidade Acesa" 1 294 101 "$WORK/cidade.jpg"
song vaga-2 "Avenida" "Os Vagalumes" "Cidade Acesa" 2 330 118 "$WORK/cidade.jpg"
song vaga-3 "Madrugada" "Os Vagalumes" "Cidade Acesa" 3 175 142 "$WORK/cidade.jpg"
song sol-1 "Girassol" "Banda Solar" "Meio-Dia" 1 349 99 "$WORK/sol.jpg"
song sol-2 "Verão Sem Fim" "Banda Solar" "Meio-Dia" 2 392 107 "$WORK/sol.jpg"
song lia-1 "Céu de Abril" "Lia Moraes" "Estações" 1 208 124
song lia-2 "Folhas" "Lia Moraes" "Estações" 2 233 96
song lia-3 "Garoa" "Lia Moraes" "Estações" 3 185 111

# 3. Abrir de novo: o app encontra as músicas e importa sozinho.
launch
shot 02-biblioteca 8

# 4. Player em tela cheia.
launch -demoPlay YES
shot 03-player 6

# 5. Equalizador com o preset "Rock" ativo.
xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" eqEnabled -bool true
xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" eqGains \
  "<array>$(for g in 5 4 3 1 -1 -1 1 3 4 5; do printf '<real>%s</real>' "$g"; done)</array>"
launch -demoTab 3
shot 04-equalizador

# 6. Playlists e buscar.
launch -demoTab 1
shot 05-playlists
launch -demoTab 2
shot 06-buscar

# 7. Modo escuro.
xcrun simctl ui "$UDID" appearance dark
launch -demoPlay YES
shot 07-player-escuro 6

# Diagnóstico: relatórios de falha e log do app, se houver.
mkdir -p "$OUT/logs"
cp ~/Library/Logs/DiagnosticReports/Sonora* "$OUT/logs/" 2>/dev/null || true
xcrun simctl spawn "$UDID" log show --last 10m --style compact \
  --predicate 'process == "Sonora"' > "$OUT/logs/sonora.log" 2>&1 || true
system_profiler SPAudioDataType > "$OUT/logs/audio-devices.txt" 2>&1 || true

echo "Capturas salvas em $OUT"
