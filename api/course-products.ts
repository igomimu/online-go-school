/** 講座の一覧（誰でも見られる情報だけ） */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './courseCore.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
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
