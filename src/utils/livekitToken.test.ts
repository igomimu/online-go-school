import { describe, it, expect, vi, beforeEach } from 'vitest';

// getSupabase をモックして、auth.getSession の戻りを差し替え可能にする
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock('./liveGameApi', () => ({
  getSupabase: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

import { fetchToken } from './livekitToken';

describe('livekitToken / fetchToken', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // デフォルトはセッションなし
    getSessionMock.mockResolvedValue({ data: { session: null } });
  });

  function stubFetchOk(token = 'server-token-123') {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token }),
    });
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  }

  it('POST /api/token を呼び、返ってきた token を返す', async () => {
    const mockFetch = stubFetchOk('tok-abc');

    const token = await fetchToken({ roomName: 'go-CLS001', identity: 'sid:123' });

    expect(token).toBe('tok-abc');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/token');
    expect(init.method).toBe('POST');
  });

  it('body に identity / roomName / token を含める', async () => {
    const mockFetch = stubFetchOk();

    await fetchToken({ roomName: 'go-CLS001', identity: 'sid:123', token: 'one-time-xyz' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.identity).toBe('sid:123');
    expect(body.roomName).toBe('go-CLS001');
    expect(body.token).toBe('one-time-xyz');
  });

  it('Supabase セッションがあれば Authorization: Bearer を付与する', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'jwt-abc' } },
    });
    const mockFetch = stubFetchOk();

    await fetchToken({ roomName: 'room', identity: 'user' });

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-abc');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('セッションが無ければ Authorization ヘッダーを付けない', async () => {
    const mockFetch = stubFetchOk();

    await fetchToken({ roomName: 'room', identity: 'user' });

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('サーバーがエラーを返したら error メッセージで例外を投げる', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'Forbidden: Unauthorized to join this room' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchToken({ roomName: 'room', identity: 'user' }),
    ).rejects.toThrow('Forbidden: Unauthorized to join this room');
  });

  it('error フィールドが無いエラー時は既定メッセージで投げる', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('no body')),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchToken({ roomName: 'room', identity: 'user' }),
    ).rejects.toThrow('Internal Server Error');
  });
});
