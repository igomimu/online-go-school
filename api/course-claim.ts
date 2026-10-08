/** 決済後の画面から呼ぶ。支払い済みを Stripe に確かめて購入を記録し、視聴リンクの鍵を返す */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { recordPurchase, stripe } from './courseCore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sessionId = String(req.query.session_id ?? '');
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return res.status(400).json({ error: '決済の番号が正しくありません' });
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') return res.status(402).json({ error: '支払いがまだ完了していません' });
    const { token } = await recordPurchase(session);
    return res.json({ token });
  } catch (err) {
    console.error('course-claim', err);
    return res.status(500).json({ error: '購入の確認に失敗しました。このメールアドレスに視聴リンクが届かない場合はご連絡ください' });
  }
}
