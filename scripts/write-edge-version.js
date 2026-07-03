import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const versionFilePath = path.join(__dirname, '../supabase/functions/_shared/build_version.ts');

function resolveVersion() {
  if (process.env.EDGE_BUILD_VERSION) return process.env.EDGE_BUILD_VERSION;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return `no-git-${Date.now()}`;
  }
}

const version = resolveVersion();
fs.writeFileSync(
  versionFilePath,
  `export const EDGE_BUILD_VERSION = ${JSON.stringify(version)}\n`,
);
console.log(`[EDGE_VERSION] Wrote ${path.relative(path.join(__dirname, '..'), versionFilePath)}: ${version}`);
