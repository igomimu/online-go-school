#!/bin/bash
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm use 22
fi

echo "[servers] Starting Vite on port 3000..."
node node_modules/vite/bin/vite.js --port 3000 --strictPort > vite.log 2>&1 &
VITE_PID=$!

echo "[servers] Starting API server on port 5176..."
npx tsx scripts/dev-api-server.ts > api.log 2>&1 &
API_PID=$!

echo "[servers] Servers started. VITE_PID=$VITE_PID, API_PID=$API_PID"

# ポートが空くまで待機する簡易ループ
echo "[servers] Waiting for ports to open..."
for i in {1..15}; do
    if curl -s http://localhost:3000 > /dev/null && curl -s http://localhost:5176 > /dev/null; then
        echo "[servers] Both servers are ready!"
        exit 0
    fi
    sleep 1
done

echo "[servers] Timeout waiting for servers to start. Check vite.log and api.log"
exit 1
