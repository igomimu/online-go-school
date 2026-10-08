/**
 * Stripe からの通知（checkout.session.completed）。決済後の画面を閉じられても、購入の記録とメールが残るように。
 * 署名の確かめに生の本文が要るので bodyParser を切る
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { recordPurchase, stripe } from './_courseCore.js';

export const config = { api: { bodyParser: false } };

async function rawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await rawBody(req),
      String(req.headers['stripe-signature'] ?? ''),
      process.env.STRIPE_COURSE_WEBHOOK_SECRET ?? '',
    );
  } catch (err) {
    console.error('course-webhook 署名', err);
    return res.status(400).send('bad signature');
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.course_product_id && session.payment_status === 'paid') {
      await recordPurchase(session);
    }
  }
  return res.json({ received: true });
}
