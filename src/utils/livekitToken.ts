import { getSupabase } from './liveGameApi';

export interface TokenOptions {
  roomName: string;
  identity: string;
  token?: string; // dojo-app から渡される一時参加トークン
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
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Token generation failed');
  }

  const data = await res.json();
  return data.token;
}
