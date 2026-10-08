/** 視聴リンクの鍵 → その人が買った講座と、数時間で切れる動画 URL */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, signedVideoUrl, tokenHash } from './courseCore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
