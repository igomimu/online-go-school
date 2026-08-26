import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { classroomIdFromRoomName } from './realtimeKit.js';

/**
 * 先生が教室に入っていることを記録する。
 *
 * これまでは映像基盤に「先生が居ますか」と問い合わせていたが、RealtimeKit は
 * 先生が繋いでからセッションが見えるまで約10秒かかる。その間 生徒は
 * 「先生がまだ教室を開いていません」と言われて待たされ、先生は既に居るのに
 * 来ていないと誤解される（2026-08-26 実授業）。
 *
 * 先生自身が入った時点で書けば、待ち時間はゼロになる。
 * 基盤に依存しないので、LiveKit へ戻したときもそのまま効く。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_DOJO_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { roomName } = req.body || {};
  if (!roomName || typeof roomName !== 'string') {
    return res.status(400).json({ error: 'roomName is required' });
  }

  // 先生だけが書ける。生徒に書かれると門番の意味がなくなる
  const authHeader = (req.headers['authorization'] as string) ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }
  const jwt = authHeader.slice('Bearer '.length).trim();

  let isTeacher = false;
  if (jwt === serviceRoleKey) {
    isTeacher = true; // E2E・保守
  } else {
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: userResult, error } = await anonClient.auth.getUser(jwt);
    if (error || !userResult?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    isTeacher = userResult.user.user_metadata?.app_role === 'teacher';
  }
  if (!isTeacher) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const classroomId = classroomIdFromRoomName(roomName);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error: updateErr } = await supabase
    .from('go_school_classrooms')
    .update({ teacher_present_at: req.method === 'DELETE' ? null : new Date().toISOString() })
    .eq('id', classroomId);

  if (updateErr) {
    console.error('[presence] 更新に失敗:', updateErr.message);
    return res.status(500).json({ error: '在室の記録に失敗しました' });
  }

  return res.status(200).json({ ok: true });
}
