import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 引数の取得
const args = process.argv.slice(2);
const baseUrl = args[0] || process.env.BASE_URL;

if (!baseUrl) {
  console.error('Error: Please provide BASE_URL as the first argument or set the BASE_URL environment variable.');
  console.error('Usage: node scripts/verify-deploy.js <BASE_URL> [EXPECTED_VERSION]');
  process.exit(1);
}

// 期待するバージョンの決定 (省略された場合はローカルの git HEAD コミットハッシュ)
let expectedVersion = args[1];
if (!expectedVersion) {
  try {
    expectedVersion = execSync('git rev-parse HEAD').toString().trim();
    console.log(`[VERIFY] Expected version defaulted to local Git HEAD: ${expectedVersion}`);
  } catch (e) {
    console.error('Error: Could not determine expected version from Git and no argument was provided.');
    process.exit(1);
  }
}

console.log(`[VERIFY] Starting deployment verification loop...`);
console.log(`[VERIFY] Target URL: ${baseUrl}`);
console.log(`[VERIFY] Expected Version: ${expectedVersion}`);

const maxAttempts = 40; // 10分間 (15秒 * 40)
const intervalMs = 15000;

async function fetchVersion(url) {
  const versionUrl = `${url.replace(/\/$/, '')}/version.json`;
  try {
    const res = await fetch(versionUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function runE2ETests() {
  console.log(`\n======================================================`);
  console.log(`[VERIFY] 🚀 Launching Playwright E2E Tests on ${baseUrl}...`);
  console.log(`======================================================\n`);

  return new Promise((resolve) => {
    const playwrightProcess = spawn('npx', ['playwright', 'test'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        NODE_ENV: 'production'
      },
      stdio: 'inherit',
      shell: true
    });

    playwrightProcess.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

async function startPolling() {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[VERIFY] Attempt ${attempt}/${maxAttempts}: Fetching version.json...`);
    const versionData = await fetchVersion(baseUrl);

    if (versionData) {
      console.log(`[VERIFY] Found version: ${versionData.version} (Built at: ${versionData.buildTime})`);
      
      if (versionData.version === expectedVersion) {
        console.log(`[VERIFY] ✅ Match found! New version has been deployed.`);
        const testSuccess = await runE2ETests();
        if (testSuccess) {
          console.log(`[VERIFY] 🎉 ALL TESTS PASSED! Deployment verification successful.`);
          process.exit(0);
        } else {
          console.error(`[VERIFY] ❌ E2E tests failed on the new deployment.`);
          process.exit(1);
        }
      } else {
        console.log(`[VERIFY] Current version (${versionData.version}) does not match expected version (${expectedVersion}).`);
      }
    } else {
      console.log(`[VERIFY] Failed to fetch version.json (deployment might be in progress or URL is down).`);
    }

    if (attempt < maxAttempts) {
      console.log(`[VERIFY] Waiting ${intervalMs / 1000} seconds before next check...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  console.error(`[VERIFY] ❌ Timeout: New version was not detected on ${baseUrl} within 10 minutes.`);
  process.exit(1);
}

startPolling();
