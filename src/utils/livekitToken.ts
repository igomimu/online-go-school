import { SignJWT } from 'jose';

export interface TokenOptions {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  canPublish?: boolean;
  canPublishData?: boolean;
  canSubscribe?: boolean;
}

export async function generateToken(opts: TokenOptions): Promise<string> {
  const secret = new TextEncoder().encode(opts.apiSecret);

  const token = await new SignJWT({
    video: {
      room: opts.roomName,
      roomJoin: true,
      canPublish: opts.canPublish ?? true,
      canPublishData: opts.canPublishData ?? true,
      canSubscribe: opts.canSubscribe ?? true,
    },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(opts.apiKey)
    .setSubject(opts.identity)
    .setExpirationTime('6h')
    .setNotBefore('0s')
    .sign(secret);

  return token;
}