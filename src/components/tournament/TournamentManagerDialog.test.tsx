import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import TournamentManagerDialog from './TournamentManagerDialog';
import { createNewTournament } from '../../utils/tournament/pairing';
import { saveTournament } from '../../utils/tournament/tournamentStore';

beforeEach(() => localStorage.clear());

describe('TournamentManagerDialog の対局作成', () => {
  it('大会の対局は道場ランクに数えない（ratingExcluded: true を明示して作る）', () => {
    saveTournament(createNewTournament({
      id: 't1',
      classroomId: 'c1',
      name: 'テスト大会',
      type: 'round_robin',
      participants: [
        { identity: 'sid:a', name: 'A', rank: '1級', seed: 1 },
        { identity: 'sid:b', name: 'B', rank: '1級', seed: 2 },
      ],
      settings: { boardSize: 19, autoHandicap: false },
    }));
    const onCreateGames = vi.fn();

    render(
      <TournamentManagerDialog
        classroomId="c1"
        isTeacher
        students={[]}
        connectedIdentities={[]}
        onClose={() => {}}
        onCreateGames={onCreateGames}
      />,
    );
    fireEvent.click(screen.getByText(/ラウンド別対局/));
    fireEvent.click(screen.getByText(/第1回戦の全対局を一括作成/));

    expect(onCreateGames).toHaveBeenCalledTimes(1);
    const pairs = onCreateGames.mock.calls[0][0] as Array<{ ratingExcluded: boolean }>;
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every(p => p.ratingExcluded === true)).toBe(true);
  });
});
