#!/bin/bash
# Keep-alive watchdog for mini-services

# Start trace-stream
(cd /home/z/my-project/mini-services/trace-stream && while true; do
  bun index.ts 2>&1 | tee -a /home/z/my-project/mini-services/trace-stream/trace-stream.log
  echo "[watchdog] trace-stream died, restarting in 2s..." >> /home/z/my-project/mini-services/trace-stream/trace-stream.log
  sleep 2
done) &
TPID=$!
echo "Trace stream watchdog PID: $TPID"

# Start agent-fleet
(cd /home/z/my-project/mini-services/agent-fleet && while true; do
  bun index.ts 2>&1 | tee -a /home/z/my-project/mini-services/agent-fleet/agent-fleet.log
  echo "[watchdog] agent-fleet died, restarting in 2s..." >> /home/z/my-project/mini-services/agent-fleet/agent-fleet.log
  sleep 2
done) &
APID=$!
echo "Agent fleet watchdog PID: $APID"

echo "Both services started with watchdogs"
