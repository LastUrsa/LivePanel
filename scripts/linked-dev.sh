#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ps_script="$(wslpath -w "$script_dir/linked-dev.ps1")"
repo_root="$(cd "$script_dir/.." && pwd)"
suite_root="$(dirname "$repo_root")"

build="none"
root_win='C:\Temp\StarsongLinkedDev'
explicit_no_sync=0

args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[$i]}" in
    -Build|--build)
      if (( i + 1 < ${#args[@]} )); then
        build="${args[$((i + 1))]}"
      fi
      ;;
    -Build:*|-Build=*|--build=*)
      build="${args[$i]#*=}"
      build="${build#*:}"
      ;;
    -Root|--root)
      if (( i + 1 < ${#args[@]} )); then
        root_win="${args[$((i + 1))]}"
      fi
      ;;
    -Root:*|-Root=*|--root=*)
      root_win="${args[$i]#*=}"
      root_win="${root_win#*:}"
      ;;
    -NoSync|--no-sync)
      explicit_no_sync=1
      ;;
  esac
done

root_wsl="$(wslpath -u "$root_win")"
src_root="$root_wsl/src"

resolve_build_list() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
  if [[ -z "$value" || "$value" == "none" ]]; then
    printf ''
    return
  fi
  if [[ "$value" == "all" ]]; then
    printf 'livepanel streamsignal tidereader tuberswitch'
    return
  fi
  printf '%s' "$value" | tr ',' ' '
}

sync_app() {
  local app="$1"
  local display="$2"
  local source="$suite_root/$display"
  local dest="$src_root/$display"
  if [[ ! -d "$source" ]]; then
    echo "Skipping sync for $display; source not found: $source"
    return
  fi
  mkdir -p "$dest"
  echo
  echo "==> Sync $display"
  rsync -rt --delete \
    --no-perms \
    --no-owner \
    --no-group \
    --exclude .git \
    --exclude .agents \
    --exclude .codex \
    --exclude build \
    --exclude node_modules \
    --exclude dist \
    --exclude coverage \
    --exclude TestResults \
    --exclude bin \
    --exclude obj \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '*.db' \
    --exclude '*.sqlite' \
    --exclude '*.sqlite3' \
    --exclude '*.pem' \
    --exclude '*.key' \
    --exclude '*.pfx' \
    --exclude '*.p12' \
    --exclude '*.crt' \
    --exclude '*.log' \
    "$source/" "$dest/"

  if [[ -d "$source/build/bin" ]]; then
    mkdir -p "$dest/build/bin"
    rsync -rt --delete --no-perms --no-owner --no-group "$source/build/bin/" "$dest/build/bin/"
  fi
  if [[ -f "$source/build/appicon.png" ]]; then
    mkdir -p "$dest/build"
    cp -a "$source/build/appicon.png" "$dest/build/appicon.png"
  fi
  if [[ -f "$source/build/windows/icon.ico" ]]; then
    mkdir -p "$dest/build/windows"
    cp -a "$source/build/windows/icon.ico" "$dest/build/windows/icon.ico"
  fi
}

mirror_has_output() {
  local display="$1"
  local dest="$src_root/$display"
  case "$display" in
    TideReader)
      [[ -f "$dest/artifacts/publish/win-x64-livepanel-dev/TideReader.Desktop.exe" ]]
      ;;
    LivePanel|StreamSignal|TuberSwitch)
      [[ -d "$dest/build/bin" ]]
      ;;
    *)
      [[ -d "$dest" ]]
      ;;
  esac
}

if (( explicit_no_sync == 0 )); then
  build_list=" $(resolve_build_list "$build") "
  for app_display in LivePanel StreamSignal TideReader TuberSwitch; do
    app="$(printf '%s' "$app_display" | tr '[:upper:]' '[:lower:]')"
    if [[ "$build_list" == *" $app "* || ! -d "$src_root/$app_display" ]] || ! mirror_has_output "$app_display"; then
      sync_app "$app" "$app_display"
    fi
  done
fi

ps_args=("$@")
if (( explicit_no_sync == 0 )); then
  ps_args+=("-NoSync")
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ps_script" "${ps_args[@]}"
