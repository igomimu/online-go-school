import type { VercelRequest, VercelResponse } from '@vercel/node';

// pokekata(KataGo HTTPブリッジ)への検討分析プロキシ。
// online-go-schoolとpokekataは別Supabaseプロジェクトのためユーザートークンを
// 共有できず、pokekata側のサービス間API-KeyをサーバーサイドのみでAuthorizationし
// クライアントにキーを一切渡さない(client-side fetchでキーが露出するのを防ぐ)。

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KATAGO_API_KEY;
  const serverUrl = process.env.KATAGO_SERVER_URL || 'http://localhost:5177';

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: KATAGO_API_KEY not set' });
  }

  try {
    const upstream = await fetch(`${serverUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const data = await upstream.json().catch(() => ({ error: `HTTP ${upstream.status}` }));
    return res.status(upstream.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream request failed';
    return res.status(502).json({ error: `KataGoサーバーに接続できません: ${message}` });
  }
}
