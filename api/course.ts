/**
 * 講座の販売と視聴（online.mimura15.jp/course/）の窓口。?action= で振り分ける。
 * Vercel 無料プランは1回の書き出しで関数12個までなので、4つを1つにまとめた（通知だけ course-webhook）。
 *   products … 講座の一覧（誰でも見られる情報だけ）
 *   checkout … 「購入する」→ Stripe の決済画面（1回払い）を作って URL を返す（POST）
 *   claim    … 決済後の画面から。支払い済みを Stripe に確かめて購入を記録し、視聴リンクの鍵を返す
 *   access   … 視聴リンクの鍵 → その人が買った講座と、数時間で切れる動画 URL
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, getProduct, recordPurchase, signedVideoUrl, siteUrl, stripe, tokenHash } from './_courseCore.js';

async function products(_req: VercelRequest, res: VercelResponse) {
  const { data, error } = await db()
    .from('course_products')
    .select('id,title,subtitle,price_jpy,minutes,video_key')
    .eq('active', true)
    .order('sort_order');
  if (error) return res.status(500).json({ error: '講座の一覧を読めませんでした' });
  res.setHeader('Cache-Control', 's-maxage=60');
  return res.json({
    products: (data ?? []).map(({ video_key, ...p }) => ({ ...p, available: Boolean(video_key) })),
  });
}

async function checkout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const productId = String((req.body as { productId?: unknown } | undefined)?.productId ?? '');
  const product = await getProduct(productId);
  if (!product || !product.video_key) return res.status(404).json({ error: 'この講座はまだ購入できません' });

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    locale: 'ja',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'jpy',
        unit_amount: product.price_jpy,
        product_data: { name: `三村九段の石の形講座 ${product.title}` },
      },
    }],
    metadata: { course_product_id: product.id },
    payment_intent_data: { metadata: { course_product_id: product.id } },
    success_url: `${siteUrl()}/course/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/course/?canceled=${product.id}`,
  });
  return res.json({ url: session.url });
}

async function claim(req: VercelRequest, res: VercelResponse) {
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

async function access(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.t ?? '');
  if (token.length < 20) return res.status(400).json({ error: 'リンクが正しくありません' });
  const supabase = db();
  const { data: own } = await supabase
    .from('course_purchases')
    .select('email')
    .eq('access_token_hash', tokenHash(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (!own) return res.status(404).json({ error: 'このリンクは使えません。購入時のメールのリンクを開いてください' });
  // 開いた日時を残す（Systeme から移した購入者が新しいページを開いたかを確かめる）。失敗しても視聴は止めない
  await supabase.from('course_purchases').update({ last_viewed_at: new Date().toISOString() })
    .eq('access_token_hash', tokenHash(token)).then(() => undefined, () => undefined);

  // 同じメールアドレスで買った講座はまとめて見せる（2本買った人がリンクを2つ持たなくていいように）
  const { data: rows, error } = await supabase
    .from('course_purchases')
    .select('product_id, course_products(id,title,subtitle,minutes,video_key,sort_order)')
    .eq('email', own.email)   // 保存時に小文字へそろえてある。ilike だと _ や % が任意の文字扱いになる
    .is('revoked_at', null);
  if (error) return res.status(500).json({ error: '講座を読めませんでした' });

  type Row = { course_products: { id: string; title: string; subtitle: string | null; minutes: number | null; video_key: string | null; sort_order: number } | null };
  const seen = new Set<string>();
  const courses = [];
  for (const r of (rows ?? []) as unknown as Row[]) {
    const p = r.course_products;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    courses.push({
      id: p.id, title: p.title, subtitle: p.subtitle, minutes: p.minutes, sort: p.sort_order,
      videoUrl: p.video_key ? await signedVideoUrl(p.video_key) : null,
    });
  }
  courses.sort((a, b) => a.sort - b.sort);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ courses });
}

const ACTIONS = { products, checkout, claim, access } as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action ?? '') as keyof typeof ACTIONS;
  const run = ACTIONS[action];
  if (!run) return res.status(404).json({ error: 'Not Found' });
  return run(req, res);
}
