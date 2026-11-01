#!/usr/bin/env bash
# Install mcp-forge as a user-level skill for every AI coding agent found on this machine.
#   bash install.sh            # agents whose config dir exists, plus ~/.agents/skills
#   bash install.sh --all      # every known location
#   bash install.sh --dry-run  # show what would happen
#   bash install.sh --uninstall
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="mcp-forge"
ALL=0 DRY=0 UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --all) ALL=1 ;;
    --dry-run) DRY=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# agent label | agent config dir (detection) | skills dir
TARGETS=(
  "universal (.agents)|$HOME/.agents|$HOME/.agents/skills"
  "Claude Code|$HOME/.claude|$HOME/.claude/skills"
  "Codex|$HOME/.codex|$HOME/.codex/skills"
  "Gemini CLI|$HOME/.gemini|$HOME/.gemini/skills"
  "GitHub Copilot|$HOME/.copilot|$HOME/.copilot/skills"
  "Cursor|$HOME/.cursor|$HOME/.cursor/skills"
)

run() { if [ "$DRY" = 1 ]; then echo "  would run: $*"; else "$@"; fi; }

count=0
for entry in "${TARGETS[@]}"; do
  IFS='|' read -r label detect dir <<<"$entry"
  if [ "$ALL" = 0 ] && [ "$label" != "universal (.agents)" ] && [ ! -d "$detect" ]; then
    continue
  fi
  dest="$dir/$NAME"
  if [ "$UNINSTALL" = 1 ]; then
    if [ -e "$dest" ] || [ -L "$dest" ]; then
      echo "remove  $label: $dest"; run rm -rf "$dest"; count=$((count + 1))
    fi
    continue
  fi
  if [ "$(cd "$SRC" && pwd -P)" = "$( [ -d "$dest" ] && cd "$dest" && pwd -P)" ]; then
    echo "skip    $label: $dest is the source"; continue
  fi
  echo "install $label: $dest"
  run mkdir -p "$dir"
  run rm -rf "$dest"
  run cp -R "$SRC" "$dest"
  run rm -rf "$dest/tests/__pycache__" "$dest/scripts/__pycache__"
  count=$((count + 1))
done

if [ "$UNINSTALL" = 1 ]; then echo "removed from $count location(s)"; exit 0; fi
echo "installed in $count location(s). Restart your agent, then ask: \"crie um MCP para ...\""
command -v python3 >/dev/null || echo "warning: python3 not found — forge.py needs Python 3.9+" >&2
