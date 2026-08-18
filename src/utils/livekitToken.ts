import { getSupabase } from './liveGameApi';

/**
 * 先生がまだ教室を開いていないので生徒が入れない、という状態。
 * 認証の失敗（Forbidden）とは別物なので、生徒には「待てば入れる」と伝えたい。
 */
export class TeacherAbsentError extends Error {
  constructor(message = '先生がまだ教室を開いていません') {
    super(message);
    this.name = 'TeacherAbsentError';
  }
}

export interface TokenOptions {
  roomName: string;
  identity: string;
  token?: string; // dojo-app から渡される一時参加トークン
  username?: string; // 表示用の実名
}

export async function fetchToken(opts: TokenOptions): Promise<string> {
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData?.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  const res = await fetch('/api/token', {
    method: 'POST',
    headers,
    body: JSON.stringify({ 
      identity: opts.identity, 
      roomName: opts.roomName,
      token: opts.token,
      username: opts.username,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 409 && err.reason === 'teacher_absent') {
      throw new TeacherAbsentError(err.error);
    }
    throw new Error(err.error || 'Token generation failed');
  }

  const data = await res.json();
  return data.token;
}
