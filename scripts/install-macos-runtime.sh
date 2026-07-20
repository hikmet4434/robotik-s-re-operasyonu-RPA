#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
TSX_CLI="$ROOT_DIR/node_modules/tsx/dist/cli.mjs"
SUPPORT_DIR="$HOME/Library/Application Support/OtoFlow"
LOG_DIR="$HOME/Library/Logs/OtoFlow"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
TOKEN_FILE="$SUPPORT_DIR/agent-token"
SERVER_LABEL="com.otoflow.runtime"
AGENT_LABEL="com.otoflow.agent"

if [[ ! -x "$NODE_BIN" || ! -f "$TSX_CLI" ]]; then
  echo "Önce proje bağımlılıklarını kurun: npm install"
  exit 1
fi

mkdir -p "$SUPPORT_DIR" "$LOG_DIR" "$LAUNCH_DIR" "$ROOT_DIR/data"
chmod 700 "$SUPPORT_DIR"
if [[ ! -s "$TOKEN_FILE" ]]; then
  umask 077
  printf '%s\n' "$(openssl rand -hex 32)" > "$TOKEN_FILE"
fi
AGENT_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"

launchctl bootout "gui/$UID/$SERVER_LABEL" 2>/dev/null || true
launchctl bootout "gui/$UID/$AGENT_LABEL" 2>/dev/null || true
sleep 0.5

create_plist() {
  local plist="$1"
  local label="$2"
  local log_name="$3"
  shift 3
  rm -f "$plist"
  /usr/libexec/PlistBuddy -c "Add :Label string $label" "$plist"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments array" "$plist"
  local index=0
  for argument in "$@"; do
    /usr/libexec/PlistBuddy -c "Add :ProgramArguments:$index string $argument" "$plist"
    index=$((index + 1))
  done
  /usr/libexec/PlistBuddy -c "Add :WorkingDirectory string $ROOT_DIR" "$plist"
  /usr/libexec/PlistBuddy -c "Add :RunAtLoad bool true" "$plist"
  /usr/libexec/PlistBuddy -c "Add :KeepAlive bool true" "$plist"
  /usr/libexec/PlistBuddy -c "Add :ProcessType string Interactive" "$plist"
  /usr/libexec/PlistBuddy -c "Add :StandardOutPath string $LOG_DIR/$log_name.log" "$plist"
  /usr/libexec/PlistBuddy -c "Add :StandardErrorPath string $LOG_DIR/$log_name-error.log" "$plist"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables dict" "$plist"
  chmod 600 "$plist"
}

SERVER_PLIST="$LAUNCH_DIR/$SERVER_LABEL.plist"
create_plist "$SERVER_PLIST" "$SERVER_LABEL" "runtime" "$NODE_BIN" "$TSX_CLI" "$ROOT_DIR/src/server/index.ts"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:NODE_ENV string production" "$SERVER_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:PORT string 4100" "$SERVER_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:SAAS_DATABASE_PATH string $ROOT_DIR/data/otoflow-saas.sqlite" "$SERVER_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:DATABASE_PATH string $ROOT_DIR/data/otoflow.sqlite" "$SERVER_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OTOFLOW_AGENT_TOKEN string $AGENT_TOKEN" "$SERVER_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:CORS_ORIGINS string https://otoflow-ai-rpa.hiktan.chatgpt.site" "$SERVER_PLIST"

AGENT_PLIST="$LAUNCH_DIR/$AGENT_LABEL.plist"
create_plist "$AGENT_PLIST" "$AGENT_LABEL" "agent" "$NODE_BIN" "$ROOT_DIR/agents/local-agent/src/index.js"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OTOFLOW_API_BASE string http://127.0.0.1:4100" "$AGENT_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OTOFLOW_AGENT_TOKEN string $AGENT_TOKEN" "$AGENT_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OTOFLOW_ALLOWED_PATHS string $HOME/Documents,$HOME/Downloads,$HOME/Desktop" "$AGENT_PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OTOFLOW_UI_ORIGINS string http://localhost:5173,http://127.0.0.1:5173,http://localhost:4100,http://127.0.0.1:4100,https://otoflow-ai-rpa.hiktan.chatgpt.site" "$AGENT_PLIST"

launchctl bootstrap "gui/$UID" "$SERVER_PLIST"
launchctl bootstrap "gui/$UID" "$AGENT_PLIST"
launchctl kickstart -k "gui/$UID/$SERVER_LABEL"
launchctl kickstart -k "gui/$UID/$AGENT_LABEL"

echo "OtoFlow çalışma motoru ve Bilgisayar Ajanı arka planda başlatıldı."
