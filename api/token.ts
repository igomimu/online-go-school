import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { identityBelongsToStudent } from './tokenAuth.js';
import {
  isTeacherInMeeting,
  issueParticipantToken,
  readRealtimeKitConfig,
  resolveMeetingId,
  TEACHER_IDENTITY,
} from './realtimeKit.js';

/**
 * どちらの基盤で教室を開くか。フロント側の VITE_RTC_PROVIDER と揃える。
 * 既定は livekit。切り替えは Vercel の環境変数で行う。
 */
function rtcProvider(): 'livekit' | 'realtimekit' {
  return (process.env.RTC_PROVIDER ?? '').toLowerCase() === 'realtimekit'
    ? 'realtimekit'
    : 'livekit';
}

/**
 * その教室に先生が入っているか、LiveKit に聞く。
 *
 * 生徒だけで教室を使えないようにするための門番。IGC（ネット囲碁学園）も同じ作りで、
 * 生徒が先生不在の部屋に繋いだままにならないので、LiveKit の参加者分も無駄に減らない。
 */
async function isTeacherInRoom(
  roomName: string,
  host: string,
  apiKey: string,
  apiSecret: string,
): Promise<boolean> {
  const svc = new RoomServiceClient(host, apiKey, apiSecret);

  // 🔴 先に部屋の有無を見る。LiveKit Cloud は存在しない部屋に listParticipants すると
  // TwirpError(not_found) を投げるが、自前サーバー（開発・E2E用）は空リストを返す。
  // listParticipants だけで判断すると、本番でだけ例外→素通しになる。
  const rooms = await svc.listRooms([roomName]);
  if (rooms.length === 0) return false;

  try {
    const participants = await svc.listParticipants(roomName);
    return participants.some(p => p.identity.replace(/^sid:/, '') === TEACHER_IDENTITY);
  } catch (err) {
    // 部屋を見てから聞くまでの間に空になって消えた
    if (isNotFound(err)) return false;
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'not_found';
}

// SHA-256 ハッシュ化ヘルパー
function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const provider = rtcProvider();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const supabaseUrl = process.env.VITE_DOJO_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const rtkConfig = provider === 'realtimekit' ? readRealtimeKitConfig() : null;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (provider === 'livekit' && (!apiKey || !apiSecret)) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (provider === 'realtimekit' && !rtkConfig) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { token: rawToken, identity, roomName, username } = req.body || {};

  if (!identity || !roomName) {
    return res.status(400).json({ error: 'identity and roomName are required' });
  }

  const authHeader = (req.headers['authorization'] as string) ?? '';
  let authorized = false;
  // 生徒の要求だけ「先生が居るか」を見る。先生と service_role（E2E・保守）は素通し。
  let requesterIsStudent = false;

  // 一時トークンは1回きりなので、ここではまだ使用済みにしない。
  // 先生が居なくて 409 を返す場合に焼いてしまうと、先生が入ってからの入り直しができなくなる。
  // 実際に消費するのは、先生の在室まで確かめてトークンを発行すると決まってから。
  let pendingJoinTokenHash: string | null = null;

  // 1. パスA: rawToken (一時トークン) がある場合
  if (rawToken) {
    const tokenHash = sha256(rawToken);
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowStr = new Date().toISOString();

    const { data: joinToken, error: readErr } = await supabase
      .from('go_school_join_tokens')
      .select('student_id, online_classroom_id')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', nowStr)
      .maybeSingle();

    if (readErr) {
      console.error('[token-auth] DB read error:', readErr.message);
      return res.status(500).json({ error: 'Database verification failed' });
    }

    if (joinToken) {
      const expectedRoom = `go-${joinToken.online_classroom_id}`;
      const studentUuid = joinToken.student_id;
      
      const isRoomValid = roomName === expectedRoom;
      const isIdentityValid = identityBelongsToStudent(identity, studentUuid);

      if (isRoomValid && isIdentityValid) {
        authorized = true;
        requesterIsStudent = true;
        pendingJoinTokenHash = tokenHash;
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
          // 生徒は自身の classroom_id に対応するルーム、かつ自身のIDと完全一致する identity のみ許可
          const expectedRoom = `go-${studentClassroomId}`;
          if (roomName === expectedRoom && identityBelongsToStudent(identity, studentId)) {
            authorized = true;
            requesterIsStudent = true;
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

  // RealtimeKit は教室ごとに meeting を持つ。先生の在室確認にも要るので先に引く。
  let meetingId = '';
  if (rtkConfig) {
    try {
      meetingId = await resolveMeetingId(rtkConfig, supabaseUrl, serviceRoleKey, roomName);
    } catch (err) {
      console.error('[token-auth] meeting resolve failed:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: '教室を用意できませんでした' });
    }
  }

  // 先生が教室を開いていないうちは、生徒にトークンを渡さない。
  // 繋がせてから切るのではなく最初から繋がせないので、参加者分を1分も使わない。
  if (requesterIsStudent) {
    try {
      let teacherPresent: boolean;
      if (rtkConfig) {
        teacherPresent = await isTeacherInMeeting(rtkConfig, meetingId);
      } else {
        const livekitHost = (process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || '')
          .replace(/^ws/, 'http');
        if (!livekitHost) {
          return res.status(500).json({ error: 'Server configuration error' });
        }
        teacherPresent = await isTeacherInRoom(roomName, livekitHost, apiKey!, apiSecret!);
      }
      if (!teacherPresent) {
        return res.status(409).json({
          error: '先生がまだ教室を開いていません',
          reason: 'teacher_absent',
        });
      }
    } catch (err) {
      // 基盤に聞けなかったときは通す。門番が壊れて授業が止まる方が害が大きい。
      console.error('[token-auth] teacher presence check failed:', err instanceof Error ? err.message : err);
    }
  }

  // ここまで来たら実際に入れる。一時トークンをここで使用済みにする。
  // `is('used_at', null)` を残しているので、同時に2回来ても片方しか通らない。
  if (pendingJoinTokenHash) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: consumed, error: consumeErr } = await supabase
      .from('go_school_join_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token_hash', pendingJoinTokenHash)
      .is('used_at', null)
      .select('student_id')
      .maybeSingle();

    if (consumeErr) {
      console.error('[token-auth] DB update error:', consumeErr.message);
      return res.status(500).json({ error: 'Database verification failed' });
    }
    if (!consumed) {
      // 読んでから消費するまでの間に誰かが使った
      return res.status(403).json({ error: 'Forbidden: Unauthorized to join this room' });
    }
  }

  if (rtkConfig) {
    try {
      const rtkToken = await issueParticipantToken(rtkConfig, meetingId, {
        identity,
        username,
        // 生徒でない要求は先生か保守。ホストの権限を渡す
        isTeacher: !requesterIsStudent,
      });
      return res.status(200).json({ token: rtkToken });
    } catch (err) {
      console.error('[token-auth] RealtimeKit token failed:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: '教室のトークンを発行できませんでした' });
    }
  }

  // LiveKit JWT 発行
  const token = new AccessToken(apiKey!, apiSecret!, { identity, name: username });
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
