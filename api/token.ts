import { AccessToken } from 'livekit-server-sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { identity, roomName } = req.body || {};

  if (!identity || !roomName) {
    return res.status(400).json({ error: 'identity and roomName are required' });
  }

  const token = new AccessToken(apiKey, apiSecret, { identity });
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
