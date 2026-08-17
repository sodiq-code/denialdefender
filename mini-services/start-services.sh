#!/bin/bash
# Keep-alive watchdog for mini-services
# GEMINI_API_KEY can be set via environment or .env file in agent-fleet/

# Load .env if it exists
if [ -f /home/z/my-project/mini-services/agent-fleet/.env ]; then
  export $(grep -v '^#' /home/z/my-project/mini-services/agent-fleet/.env | xargs)
  echo "Loaded GEMINI_API_KEY from .env ($(echo $GEMINI_API_KEY | head -c 10)...)"
fi

# Start trace-stream
(cd /home/z/my-project/mini-services/trace-stream && while true; do
  bun index.ts 2>&1 | tee -a /home/z/my-project/mini-services/trace-stream/trace-stream.log
  echo "[watchdog] trace-stream died, restarting in 2s..." >> /home/z/my-project/mini-services/trace-stream/trace-stream.log
  sleep 2
done) &
TPID=$!
echo "Trace stream watchdog PID: $TPID"

# Start agent-fleet (with GEMINI_API_KEY from .env or environment)
(cd /home/z/my-project/mini-services/agent-fleet && while true; do
  GEMINI_API_KEY="$GEMINI_API_KEY" GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash}" bun index.ts 2>&1 | tee -a /home/z/my-project/mini-services/agent-fleet/agent-fleet.log
  echo "[watchdog] agent-fleet died, restarting in 2s..." >> /home/z/my-project/mini-services/agent-fleet/agent-fleet.log
  sleep 2
done) &
APID=$!
echo "Agent fleet watchdog PID: $APID"

echo "Both services started with watchdogs"
