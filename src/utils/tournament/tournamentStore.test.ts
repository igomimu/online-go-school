import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Tournament } from '../../types/tournament';

// go_school_tournaments の代わりに、テストの中だけの表を使う
const table = new Map<string, { id: string; classroom_id: string; data: Tournament }>();
const failNext = { upsert: false };
vi.mock('../liveGameApi', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: async (_col: string, classroomId: string) => ({
          data: [...table.values()].filter(r => r.classroom_id === classroomId),
          error: null,
        }),
      }),
      upsert: async (rows: Array<{ id: string; classroom_id: string; data: Tournament }>) => {
        if (failNext.upsert) { failNext.upsert = false; return { error: new Error('offline') }; }
        rows.forEach(r => table.set(r.id, r));
        return { error: null };
      },
      delete: () => ({
        eq: async (_col: string, id: string) => { table.delete(id); return { error: null }; },
      }),
    }),
  }),
}));

import { getTournaments, getTournament, saveTournament, deleteTournament, loadTournaments } from './tournamentStore';

const sampleTournament: Tournament = {
  id: 't-1',
  classroomId: 'c-1',
  name: 'テスト大会',
  type: 'single_elimination',
  status: 'setup',
  participants: [],
  matches: [],
  currentRound: 1,
  totalRounds: 2,
  settings: { boardSize: 19, autoHandicap: true },
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
};

describe('tournamentStore.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    table.clear();
  });

  it('保存するとアカウントと端末の両方に入る', async () => {
    await saveTournament(sampleTournament);
    expect(getTournament('t-1')).toEqual(sampleTournament);
    expect(table.get('t-1')?.data).toEqual(sampleTournament);
    expect(table.get('t-1')?.classroom_id).toBe('c-1');
  });

  it('別の端末（キャッシュ無し）でもアカウントから読める', async () => {
    await saveTournament(sampleTournament);
    localStorage.clear();
    const list = await loadTournaments('c-1');
    expect(list.map(t => t.id)).toEqual(['t-1']);
    expect(getTournaments('c-1').map(t => t.id)).toEqual(['t-1']);
  });

  it('以前の版で端末にだけ作った大会は、読み込み時にアカウントへ移す', async () => {
    localStorage.setItem('go-school-tournaments', JSON.stringify([sampleTournament]));
    const list = await loadTournaments('c-1');
    expect(list.map(t => t.id)).toEqual(['t-1']);
    expect(table.has('t-1')).toBe(true);
  });

  it('別教室の大会は出さない', async () => {
    await saveTournament(sampleTournament);
    expect(getTournaments('other-room')).toEqual([]);
    expect(await loadTournaments('other-room')).toEqual([]);
  });

  it('アカウントへ保存できなくても端末には残し、失敗を返す', async () => {
    failNext.upsert = true;
    await expect(saveTournament(sampleTournament)).rejects.toThrow('offline');
    expect(getTournament('t-1')).toEqual(sampleTournament);
  });

  it('削除ができる', async () => {
    await saveTournament(sampleTournament);
    await deleteTournament('t-1');
    expect(getTournament('t-1')).toBeNull();
    expect(table.has('t-1')).toBe(false);
  });
});
