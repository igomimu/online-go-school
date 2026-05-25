import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
const versionFilePath = path.join(publicDir, 'version.json');

// gitコミットハッシュの取得を試みる
let gitHash = 'unknown';
try {
  gitHash = execSync('git rev-parse HEAD').toString().trim();
} catch (e) {
  // gitが使えない、あるいはリポジトリ外の場合
  gitHash = 'no-git-' + Date.now();
}

const versionData = {
  version: gitHash,
  buildTime: new Date().toISOString(),
};

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));
console.log(`[VERSION] Generated version.json with version: ${gitHash}`);
