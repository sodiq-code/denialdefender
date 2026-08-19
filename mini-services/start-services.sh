#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# DenialDefender — Mini-services watchdog
# ══════════════════════════════════════════════════════════════════════════════
# Starts trace-stream (port 3003) and agent-fleet (port 3004) in the background
# with auto-restart on crash. Writes PIDs and logs to disk.
#
# Usage:
#   bash mini-services/start-services.sh
#   bash mini-services/start-services.sh --stop
#
# Designed for the DenialDefender sandbox. Ports are hardcoded in each service.
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRACE_DIR="${PROJECT_ROOT}/mini-services/trace-stream"
AGENT_DIR="${PROJECT_ROOT}/mini-services/agent-fleet"
PID_DIR="${PROJECT_ROOT}/mini-services/.pids"
LOG_DIR="${PROJECT_ROOT}/mini-services/.logs"

mkdir -p "${PID_DIR}" "${LOG_DIR}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

# ── Stop mode ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--stop" ]]; then
  echo "Stopping mini-services..."
  for name in trace-stream agent-fleet; do
    pidfile="${PID_DIR}/${name}.pid"
    if [[ -f "${pidfile}" ]]; then
      pid=$(cat "${pidfile}")
      if kill -0 "${pid}" 2>/dev/null; then
        kill "${pid}" 2>/dev/null || true
        sleep 1
        kill -9 "${pid}" 2>/dev/null || true
        log "Stopped ${name} (pid ${pid})"
      else
        warn "${name} pid ${pid} not running"
      fi
      rm -f "${pidfile}"
    fi
  done
  exit 0
fi

# ── Ensure deps installed ─────────────────────────────────────────────────────
install_deps() {
  local dir="$1"
  if [[ ! -d "${dir}/node_modules" ]]; then
    echo "  Installing deps for $(basename "${dir}")..."
    (cd "${dir}" && bun install --silent) >/dev/null 2>&1 || warn "bun install failed in ${dir}"
  fi
}
install_deps "${TRACE_DIR}"
install_deps "${AGENT_DIR}"

# ── Start trace-stream watchdog ────────────────────────────────────────────────
start_watchdog() {
  local name="$1" dir="$2"
  local pidfile="${PID_DIR}/${name}.pid"
  local logfile="${LOG_DIR}/${name}.log"

  # Kill existing watchdog if any
  if [[ -f "${pidfile}" ]] && kill -0 "$(cat "${pidfile}")" 2>/dev/null; then
    warn "${name} already running (pid $(cat "${pidfile}")) — killing first"
    kill "$(cat "${pidfile}")" 2>/dev/null || true
    sleep 1
    kill -9 "$(cat "${pidfile}")" 2>/dev/null || true
  fi

  (
    cd "${dir}"
    while true; do
      echo "[watchdog] starting ${name} at $(date -u +%FT%TZ)" >> "${logfile}"
      bun run dev >> "${logfile}" 2>&1
      echo "[watchdog] ${name} exited with $? — restarting in 2s" >> "${logfile}"
      sleep 2
    done
  ) &
  local wpid=$!
  echo "${wpid}" > "${pidfile}"
  log "${name} watchdog started (pid ${wpid}) → ${logfile}"
}

start_watchdog "trace-stream" "${TRACE_DIR}"
start_watchdog "agent-fleet" "${AGENT_DIR}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DenialDefender mini-services started"
echo "  • trace-stream  → http://localhost:3003/  (health)"
echo "  • agent-fleet   → http://localhost:3004/health"
echo ""
echo "  Logs: ${LOG_DIR}/"
echo "  PIDs: ${PID_DIR}/"
echo ""
echo "  Stop: bash mini-services/start-services.sh --stop"
echo "═══════════════════════════════════════════════════════════════"
