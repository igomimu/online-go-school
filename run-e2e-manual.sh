#!/bin/bash
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm use 22
fi

if [ -f "$HOME/.secrets/online-go-school-teacher.env" ]; then
    echo "[e2e] Sourcing teacher secrets..."
    export $(cat "$HOME/.secrets/online-go-school-teacher.env" | grep -v '^#' | xargs)
fi

echo "[e2e] Cleaning up old processes..."
pkill -f "vite"
pkill -f "dev-api-server"
sleep 1

echo "[e2e] Booting local servers..."
bash run-dev-servers.sh
if [ $? -ne 0 ]; then
    echo "[e2e] Failed to start servers. Check logs."
    echo "--- vite.log ---"
    cat vite.log
    echo "--- api.log ---"
    cat api.log
    exit 1
fi

echo "[e2e] Running Playwright E2E tests..."
if [ $# -eq 0 ]; then
  echo "[e2e] Running core E2E tests (excluding security)..."
  # e2e/security.spec.ts 以外のすべての spec.ts ファイルを実行
  CORE_TESTS=$(ls e2e/*.spec.ts | grep -v security.spec.ts)
  BASE_URL=http://localhost:3000 CI=true npx playwright test --workers=1 $CORE_TESTS
  TEST_RESULT=$?
  
  if [ $TEST_RESULT -eq 0 ]; then
    echo "[e2e] Sleeping 120 seconds to restore Supabase Auth rate limits..."
    sleep 120
    echo "[e2e] Running security E2E tests..."
    BASE_URL=http://localhost:3000 CI=true npx playwright test --workers=1 e2e/security.spec.ts
    TEST_RESULT=$?
  fi
else
  BASE_URL=http://localhost:3000 CI=true npm run test:e2e -- --workers=1 "$@"
  TEST_RESULT=$?
fi

echo "[e2e] Cleaning up background servers..."
pkill -f "vite"
pkill -f "dev-api-server"

exit $TEST_RESULT
