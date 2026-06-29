import { AccessToken } from 'livekit-server-sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// SHA-256 ハッシュ化ヘルパー
function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const supabaseUrl = process.env.VITE_DOJO_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!apiKey || !apiSecret || !supabaseUrl || !serviceRoleKey || !anonKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { token: rawToken, identity, roomName, username } = req.body || {};

  if (!identity || !roomName) {
    return res.status(400).json({ error: 'identity and roomName are required' });
  }

  const authHeader = (req.headers['authorization'] as string) ?? '';
  let authorized = false;

  // 1. パスA: rawToken (一時トークン) がある場合
  if (rawToken) {
    const tokenHash = sha256(rawToken);
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowStr = new Date().toISOString();

    const { data: joinToken, error: updateErr } = await supabase
      .from('go_school_join_tokens')
      .update({ used_at: nowStr })
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', nowStr)
      .select('student_id, online_classroom_id')
      .maybeSingle();

    if (updateErr) {
      console.error('[token-auth] DB update error:', updateErr.message);
      return res.status(500).json({ error: 'Database verification failed' });
    }

    if (joinToken) {
      const expectedRoom = `go-${joinToken.online_classroom_id}`;
      const studentUuid = joinToken.student_id;
      
      const isRoomValid = roomName === expectedRoom;
      const isIdentityValid = identity.includes(studentUuid);

      if (isRoomValid && isIdentityValid) {
        authorized = true;
      } else {
        console.warn(`[token-auth] Token authorization mismatch. expectedRoom: ${expectedRoom}, actualRoom: ${roomName}, studentUuid: ${studentUuid}, identity: ${identity}`);
      }
    }
  } 
  // 2. パスB: Authorization ヘッダー (Supabase JWT セッション) がある場合
  else if (authHeader.startsWith('Bearer ')) {
    const jwt = authHeader.slice('Bearer '.length).trim();
    if (jwt === serviceRoleKey) {
      authorized = true; // service_role 経由は許可
    } else if (jwt) {
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data: userResult, error: userErr } = await anonClient.auth.getUser(jwt);
      if (!userErr && userResult?.user) {
        const user = userResult.user;
        const meta = user.user_metadata ?? {};
        const role = meta.app_role;

        if (role === 'teacher') {
          authorized = true; // 先生は全てのルームへのアクセスを許可
        } else if (role === 'student') {
          const studentClassroomId = meta.classroom_id;
          const studentId = meta.student_id;
          // 生徒は自身の classroom_id に対応するルーム、かつ自身のIDを含む identity のみ許可
          const expectedRoom = `go-${studentClassroomId}`;
          if (roomName === expectedRoom && identity.includes(studentId)) {
            authorized = true;
          }
        }
      }
    }
  }

  // 認証情報も一時トークンもないリクエストは拒否する。
  // （以前は dual-auth 移行期間として authorized=true にしていたが、
  //  先生・生徒とも Supabase セッション（app_role claim）または dojo-app 一時トークンで
  //  認証されるようになったため、無認証フォールバックを撤去した。2026-06-09）
  if (!authorized) {
    return res.status(403).json({ error: 'Forbidden: Unauthorized to join this room' });
  }

  // LiveKit JWT 発行
  const token = new AccessToken(apiKey, apiSecret, { identity, name: username });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  const jwt = await token.toJwt();
  return res.status(200).json({ token: jwt });
}
