import http from 'http';
import { parse } from 'url';
import fs from 'fs';
import path from 'path';
import handler from '../api/token';

// .env ファイルの手動ロード
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
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
  console.warn('Failed to load .env file:', e);
}

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
