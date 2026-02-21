import { describe, it, expect, vi } from 'vitest';
import { fetchToken } from './livekitToken';

describe('livekitToken', () => {
  // === クライアント側トークン生成 ===
  describe('fetchToken (client)', () => {
    it('JWT形式のトークンを生成する', async () => {
      const token = await fetchToken({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        roomName: 'test-room',
        identity: '三村先生',
      });

      // JWT: header.payload.signature
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('ヘッダーにHS256が含まれる', async () => {
      const token = await fetchToken({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        roomName: 'test-room',
        identity: '三村先生',
      });

      const header = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      expect(header.alg).toBe('HS256');
    });

    it('ペイロードにroom, identity, apiKeyが含まれる', async () => {
      const token = await fetchToken({
        apiKey: 'my-api-key',
        apiSecret: 'my-secret',
        roomName: 'go-lesson',
        identity: 'teacher1',
      });

      const payloadB64 = token.split('.')[1];
      // base64url → base64 → decode
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(padded));

      expect(payload.iss).toBe('my-api-key');
      expect(payload.sub).toBe('teacher1');
      expect(payload.video.room).toBe('go-lesson');
      expect(payload.video.roomJoin).toBe(true);
    });

    it('デフォルトで全権限がtrue', async () => {
      const token = await fetchToken({
        apiKey: 'key',
        apiSecret: 'secret',
        roomName: 'room',
        identity: 'user',
      });

      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.video.canPublish).toBe(true);
      expect(payload.video.canPublishData).toBe(true);
      expect(payload.video.canSubscribe).toBe(true);
    });

    it('権限をカスタマイズできる', async () => {
      const token = await fetchToken({
        apiKey: 'key',
        apiSecret: 'secret',
        roomName: 'room',
        identity: 'student',
        canPublish: false,
        canPublishData: true,
        canSubscribe: true,
      });

      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.video.canPublish).toBe(false);
    });

    it('有効期限が6時間先に設定される', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await fetchToken({
        apiKey: 'key',
        apiSecret: 'secret',
        roomName: 'room',
        identity: 'user',
      });

      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const sixHours = 6 * 3600;
      expect(payload.exp).toBeGreaterThanOrEqual(now + sixHours - 2);
      expect(payload.exp).toBeLessThanOrEqual(now + sixHours + 2);
    });

    it('同じ入力から同じ署名が生成される（決定的）', async () => {
      const opts = {
        apiKey: 'key',
        apiSecret: 'secret',
        roomName: 'room',
        identity: 'user',
      };

      const token1 = await fetchToken(opts);
      const token2 = await fetchToken(opts);

      // タイムスタンプが同じ秒内なら同じ署名
      const sig1 = token1.split('.')[2];
      const sig2 = token2.split('.')[2];
      expect(sig1).toBe(sig2);
    });
  });

  // === サーバー側トークン生成 ===
  describe('fetchToken (server)', () => {
    it('useServerToken: trueでfetchを呼ぶ', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: 'server-token-123' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const token = await fetchToken({
        apiKey: '',
        apiSecret: '',
        roomName: 'room',
        identity: 'user',
        useServerToken: true,
      });

      expect(token).toBe('server-token-123');
      expect(mockFetch).toHaveBeenCalledWith('/api/token', expect.objectContaining({
        method: 'POST',
      }));

      vi.unstubAllGlobals();
    });

    it('サーバーエラー時に例外を投げる', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Token failed' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(fetchToken({
        apiKey: '',
        apiSecret: '',
        roomName: 'room',
        identity: 'user',
        useServerToken: true,
      })).rejects.toThrow('Token failed');

      vi.unstubAllGlobals();
    });
  });
});
