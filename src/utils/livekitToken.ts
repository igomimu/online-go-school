export interface TokenOptions {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  canPublish?: boolean;
  canPublishData?: boolean;
  canSubscribe?: boolean;
  useServerToken?: boolean;
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function strToBase64Url(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

async function generateTokenClient(opts: TokenOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = JSON.stringify({ alg: 'HS256' });
  const payload = JSON.stringify({
    video: {
      room: opts.roomName,
      roomJoin: true,
      canPublish: opts.canPublish ?? true,
      canPublishData: opts.canPublishData ?? true,
      canSubscribe: opts.canSubscribe ?? true,
    },
    iss: opts.apiKey,
    sub: opts.identity,
    nbf: 0,
    exp: now + 6 * 3600,
  });

  const headerB64 = strToBase64Url(header);
  const payloadB64 = strToBase64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyData = new TextEncoder().encode(opts.apiSecret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signingInput));

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function generateTokenServer(identity: string, roomName: string): Promise<string> {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, roomName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Token generation failed');
  }

  const data = await res.json();
  return data.token;
}

export async function fetchToken(opts: TokenOptions): Promise<string> {
  if (opts.useServerToken) {
    return generateTokenServer(opts.identity, opts.roomName);
  }
  return generateTokenClient(opts);
}
