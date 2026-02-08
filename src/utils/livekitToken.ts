import HmacSHA256 from 'crypto-js/hmac-sha256';
import Base64 from 'crypto-js/enc-base64';

export interface TokenOptions {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  canPublish?: boolean;
  canPublishData?: boolean;
  canSubscribe?: boolean;
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function wordArrayToBase64Url(wordArray: CryptoJS.lib.WordArray): string {
  return Base64.stringify(wordArray).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateToken(opts: TokenOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    video: {
      room: opts.roomName,
      roomJoin: true,
      canPublish: opts.canPublish ?? true,
      canPublishData: opts.canPublishData ?? true,
      canSubscribe: opts.canSubscribe ?? true,
    },
    iss: opts.apiKey,
    sub: opts.identity,
    nbf: now,
    exp: now + 6 * 3600,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = HmacSHA256(signingInput, opts.apiSecret);

  return `${signingInput}.${wordArrayToBase64Url(signature)}`;
}
