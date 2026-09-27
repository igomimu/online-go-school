import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { Tournament } from '../../types/tournament';

const fetchLiveGameResults = vi.fn();
vi.mock('../../utils/liveGameApi', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
  fetchLiveGameResults: (...a: unknown[]) => fetchLiveGameResults(...a),
}));

import TournamentManagerDialog from './TournamentManagerDialog';
import { createNewTournament } from '../../utils/tournament/pairing';
import { getTournament } from '../../utils/tournament/tournamentStore';

function seed(overrides: Partial<Parameters<typeof createNewTournament>[0]['settings']> = {}): Tournament {
  const t = createNewTournament({
    id: 't1',
    classroomId: 'c1',
    name: 'テスト大会',
    type: 'round_robin',
    participants: [
      { identity: 'a', name: 'A', rank: '1級', seed: 1 },
      { identity: 'b', name: 'B', rank: '1級', seed: 2 },
    ],
    settings: { boardSize: 19, autoHandicap: false, ...overrides },
  });
  localStorage.setItem('go-school-tournaments', JSON.stringify([t]));
  return t;
}

function renderDialog(onCreateGames = vi.fn(async (pairs: unknown[]) => pairs.map((_, i) => `game-${i + 1}`)), liveGames: { id: string; status: string }[] = []) {
  const utils = render(
    <TournamentManagerDialog
      classroomId="c1"
      isTeacher
      students={[]}
      connectedIdentities={[]}
      liveGames={liveGames}
      onClose={() => {}}
      onSelectGame={() => {}}
      onCreateGames={onCreateGames}
    />,
  );
  return { ...utils, onCreateGames };
}

beforeEach(() => {
  localStorage.clear();
  fetchLiveGameResults.mockReset();
  fetchLiveGameResults.mockResolvedValue([]);
});

describe('TournamentManagerDialog の対局作成', () => {
  it('一括作成は、ランクに数えない・生徒の sid 形式・大会の持ち時間で作り、作れた対局の ID を結び付ける', async () => {
    seed({ timeControl: { mainMinutes: 10, byoyomiEnabled: true, byoyomiSeconds: 30, byoyomiPeriods: 3 } });
    const { onCreateGames } = renderDialog();

    fireEvent.click(screen.getByText(/ラウンド別対局/));
    await act(async () => { fireEvent.click(screen.getByText(/第1回戦の全対局を一括作成/)); });

    expect(onCreateGames).toHaveBeenCalledTimes(1);
    const pairs = onCreateGames.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ blackPlayer: 'sid:a', whitePlayer: 'sid:b', ratingExcluded: true });
    expect(pairs[0].clock).toBeTruthy();

    await waitFor(() => expect(getTournament('t1')?.matches[0].liveGameId).toBe('game-1'));
    expect(screen.getByText('対局を見る')).toBeInTheDocument();
  });

  it('作れなかった対局は結び付けず、知らせる', async () => {
    seed();
    renderDialog(vi.fn(async () => [null]));
    fireEvent.click(screen.getByText(/ラウンド別対局/));
    await act(async () => { fireEvent.click(screen.getByText(/第1回戦の全対局を一括作成/)); });

    expect(await screen.findByText(/1局を作れませんでした/)).toBeInTheDocument();
    expect(getTournament('t1')?.matches[0].liveGameId).toBeUndefined();
  });
});

describe('TournamentManagerDialog の勝敗の自動反映', () => {
  it('結び付いた対局が終局していたら、勝者と結果を入れる', async () => {
    const t = seed();
    t.matches[0].liveGameId = 'g1';
    t.status = 'in_progress';
    localStorage.setItem('go-school-tournaments', JSON.stringify([t]));
    fetchLiveGameResults.mockResolvedValue([
      { id: 'g1', status: 'finished', result: 'W+R', black_player: 'sid:a', white_player: 'sid:b' },
    ]);

    renderDialog();
    await waitFor(() => expect(getTournament('t1')?.matches[0].winnerId).toBe('b'));
    expect(getTournament('t1')?.matches[0].resultDetail).toBe('白中押し勝ち');
    expect(fetchLiveGameResults).toHaveBeenCalledWith(['g1']);
  });

  it('取消など勝敗の無い終局は結び付きを外し、作り直せるようにする', async () => {
    const t = seed();
    t.matches[0].liveGameId = 'g1';
    localStorage.setItem('go-school-tournaments', JSON.stringify([t]));
    fetchLiveGameResults.mockResolvedValue([
      { id: 'g1', status: 'finished', result: '取消', black_player: 'sid:a', white_player: 'sid:b' },
    ]);

    renderDialog();
    await waitFor(() => expect(getTournament('t1')?.matches[0].liveGameId).toBeUndefined());
    expect(getTournament('t1')?.matches[0].winnerId).toBeNull();
  });

  it('以前の版の仮の ID（created_...）は問い合わせない', async () => {
    const t = seed();
    t.matches[0].liveGameId = 'created_123';
    localStorage.setItem('go-school-tournaments', JSON.stringify([t]));
    renderDialog();
    await act(async () => {});
    expect(fetchLiveGameResults).not.toHaveBeenCalled();
  });
});
