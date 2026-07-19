import http from 'http';
import { parse } from 'url';
import fs from 'fs';
import path from 'path';
import handler from '../api/token';

function loadEnvFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const envConfig = fs.readFileSync(filePath, 'utf-8');
      envConfig.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      });
    }
  } catch (e) {
    console.warn(`Failed to load env file ${filePath}:`, e);
  }
}

// .env (VITE_ prefixed, frontend vars)
loadEnvFile(path.resolve(process.cwd(), '.env'));
// .env.local (dev/E2E専用LiveKit接続先。.env より優先、Viteの読み込み順に合わせる)
loadEnvFile(path.resolve(process.cwd(), '.env.local'));
// ~/.secrets/supabase-dojo-service.env (SUPABASE_SERVICE_ROLE_KEY for server-side use)
loadEnvFile(path.join(process.env.HOME || '', '.secrets', 'supabase-dojo-service.env'));

// --- dev 専用 env エイリアス ---
// 本番(Vercel)では LIVEKIT_API_KEY 等の「VITE_ 接頭辞なし」サーバー側名を直接設定する。
// 一方 dev の .env はフロント(vite)用に VITE_ 接頭辞付きしか持たないため、
// api/token.ts が読むサーバー側名へここで橋渡しする（本番コードは無改変のまま）。
// 本番(Vercel)では VITE_ 接頭辞なしの変数名をそのまま使う。
// dev の .env はフロント向けに VITE_ 接頭辞付きのため、ここで橋渡しする。
process.env.LIVEKIT_API_KEY ||= process.env.VITE_LIVEKIT_API_KEY;
process.env.LIVEKIT_API_SECRET ||= process.env.VITE_LIVEKIT_API_SECRET;
process.env.SUPABASE_URL ||= process.env.VITE_DOJO_SUPABASE_URL;
// SUPABASE_SERVICE_ROLE_KEY は ~/.secrets/supabase-dojo-service.env から取得済み
// VITE_DOJO_SUPABASE_KEY は publishable key なので service_role の代替にはならない
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_DOJO_SUPABASE_KEY;

const server = http.createServer(async (req, res) => {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = parse(req.url || '', true);
  if (parsedUrl.pathname === '/api/token') {
    // req.body をパースする簡易ミドルウェア
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const parsedBody = body ? JSON.parse(body) : {};
        // VercelRequest/VercelResponse モックオブジェクトの構築
        const vercelReq = Object.assign(req, {
          body: parsedBody,
          query: parsedUrl.query,
          cookies: {},
        }) as any;

        const vercelRes = Object.assign(res, {
          status: (statusCode: number) => {
            res.statusCode = statusCode;
            return vercelRes;
          },
          json: (data: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return vercelRes;
          },
          send: (data: any) => {
            res.end(data);
            return vercelRes;
          }
        }) as any;

        await handler(vercelReq, vercelRes);
      } catch (err: any) {
        console.error('[API Server Error]:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
      }
    });
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

const PORT = 5176;
server.listen(PORT, () => {
  console.log(`[API Server] Running on http://localhost:${PORT}`);
});
