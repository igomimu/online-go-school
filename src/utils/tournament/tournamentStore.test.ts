import { describe, it, expect, beforeEach } from 'vitest';
import { getTournaments, getTournament, saveTournament, deleteTournament } from './tournamentStore';
import type { Tournament } from '../../types/tournament';

describe('tournamentStore.ts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('保存と取得ができる', () => {
    saveTournament(sampleTournament);
    const loaded = getTournament('t-1');
    expect(loaded).toEqual(sampleTournament);

    const list = getTournaments('c-1');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('t-1');
  });

  it('別教室の大会はフィルタされる', () => {
    saveTournament(sampleTournament);
    const listOther = getTournaments('other-room');
    expect(listOther.length).toBe(0);
  });

  it('削除ができる', () => {
    saveTournament(sampleTournament);
    deleteTournament('t-1');
    expect(getTournament('t-1')).toBeNull();
  });
});
