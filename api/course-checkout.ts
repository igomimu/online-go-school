/** 「購入する」→ Stripe の決済画面（1回払い）を作って URL を返す */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProduct, siteUrl, stripe } from './courseCore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
