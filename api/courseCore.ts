/**
 * 講座の販売と視聴（online.mimura15.jp/course/）のサーバー側の共通部品。
 * tasks/course-sales-plan.md
 *
 * - 決済は個人の Stripe（1回払い）。テスト／本番は鍵で決まる（sk_test_… / rk_live_…）
 * - 視聴リンクの鍵 = HMAC(COURSE_TOKEN_SECRET, 購入の識別子)。DB にはその SHA-256 だけを置く。
 *   決済後の画面（course-claim）と webhook（course-webhook）のどちらが先に来ても同じ鍵になる
 * - 動画は Cloudflare R2。再生のたびに数時間で切れる署名付き URL を出す
 */
import crypto from 'crypto';
import Stripe from 'stripe';
import { AwsClient } from 'aws4fetch';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** 戻り先とメールのリンクの元。呼ばれた時に読む（手元のサーバーは部品を読み込んだ後に環境変数を足すため） */
export function siteUrl(): string {
  return (process.env.COURSE_SITE_URL ?? 'https://online.mimura15.jp').replace(/\/$/, '');
}
const VIDEO_URL_SECONDS = 4 * 60 * 60;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が設定されていない`);
  return v;
}

export function stripe(): Stripe {
  return new Stripe(need('STRIPE_COURSE_SECRET_KEY'));
}

export function db(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL ?? need('VITE_DOJO_SUPABASE_URL'),
    need('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

/** 視聴リンクの鍵。同じ識別子からは必ず同じ鍵になる */
export function accessToken(seed: string): string {
  return crypto.createHmac('sha256', need('COURSE_TOKEN_SECRET')).update(seed).digest('base64url');
}

export function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function viewUrl(token: string): string {
  return `${siteUrl()}/course/?t=${encodeURIComponent(token)}`;
}

export interface Product {
  id: string;
  title: string;
  subtitle: string | null;
  price_jpy: number;
  video_key: string | null;
  minutes: number | null;
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await db()
    .from('course_products')
    .select('id,title,subtitle,price_jpy,video_key,minutes')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * 支払い済みの Checkout Session から購入を記録し、視聴リンクの鍵を返す。
 * 何度呼んでも購入は1件のまま（stripe_session_id が unique）。メールは1回だけ送る。
 */
export async function recordPurchase(session: Stripe.Checkout.Session): Promise<{ token: string; productId: string }> {
  if (session.payment_status !== 'paid') throw new Error('支払いが完了していない');
  const productId = session.metadata?.course_product_id;
  const email = session.customer_details?.email ?? session.customer_email;
  if (!productId || !email) throw new Error('講座またはメールアドレスが分からない');

  const token = accessToken(`stripe:${session.id}`);
  const supabase = db();
  const { error } = await supabase.from('course_purchases').upsert(
    {
      product_id: productId,
      email: email.toLowerCase(),
      access_token_hash: tokenHash(token),
      stripe_session_id: session.id,
      source: session.livemode ? 'stripe_live' : 'stripe_test',
      amount_jpy: session.amount_total,
    },
    { onConflict: 'stripe_session_id', ignoreDuplicates: true },
  );
  if (error) throw error;

  await sendAccessMailOnce(session.id, email, productId, token);
  return { token, productId };
}

/** 視聴リンクのメール。送ったら email_sent_at を立て、二重に送らない */
async function sendAccessMailOnce(sessionId: string, email: string, productId: string, token: string) {
  const supabase = db();
  // 先に印を付けた者だけが送る（決済後の画面と webhook が同時に来ても1通）
  const { data: claimed, error } = await supabase
    .from('course_purchases')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('stripe_session_id', sessionId)
    .is('email_sent_at', null)
    .select('id');
  if (error) throw error;
  if (!claimed || claimed.length === 0) return;

  const product = await getProduct(productId);
  try {
    await sendAccessMail(email, product?.title ?? '石の形講座', token);
  } catch (err) {
    // 送れなかったら印を戻す（次の呼び出しでもう一度送る）
    await supabase.from('course_purchases').update({ email_sent_at: null }).eq('stripe_session_id', sessionId);
    throw err;
  }
}

export async function sendAccessMail(email: string, title: string, token: string) {
  const url = viewUrl(token);
  const text = [
    `三村九段の石の形講座「${title}」をご購入いただき、ありがとうございます。`,
    '',
    '下のリンクから、いつでも何度でも視聴できます。',
    url,
    '',
    'このリンクはあなた専用です。ブックマークしておいてください。',
    '見られないときは、このメールに返信してください。',
    '',
    '三村智保',
  ].join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${need('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: '三村智保 <info@mimura15.jp>',
      reply_to: 'info@mimura15.jp',
      to: [email],
      subject: `石の形講座「${title}」視聴リンク`,
      text,
    }),
  });
  if (!res.ok) throw new Error(`メール送信に失敗: ${res.status} ${await res.text()}`);
}

/** R2 の動画を数時間だけ見られる URL */
export async function signedVideoUrl(key: string): Promise<string> {
  const r2 = new AwsClient({
    accessKeyId: need('R2_ACCESS_KEY_ID'),
    secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  });
  const url = new URL(`${need('R2_ENDPOINT').replace(/\/$/, '')}/${need('R2_BUCKET')}/${encodeURIComponent(key)}`);
  url.searchParams.set('X-Amz-Expires', String(VIDEO_URL_SECONDS));
  const signed = await r2.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url;
}
