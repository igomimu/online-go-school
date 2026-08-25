import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherDashboard from './TeacherDashboard';
import type { SavedGame } from '../../types/game';
import type { Student } from '../../types/classroom';

const api = vi.hoisted(() => ({
  deleteSavedGame: vi.fn(async () => {}),
  deleteSavedGames: vi.fn(async (ids: string[]) => ({ deleted: ids, failed: [] as { id: string; error: string }[] })),
  loadSavedGamesForStudent: vi.fn(async () => [] as SavedGame[]),
}));

vi.mock('../../utils/liveGameApi', () => ({
  deleteSavedGame: api.deleteSavedGame,
  deleteSavedGames: api.deleteSavedGames,
  fetchActiveLiveGamesForPlayers: vi.fn(async () => []),
  finishGame: vi.fn(async () => {}),
  interruptGame: vi.fn(async () => {}),
  liveRowToSession: vi.fn(),
  getSupabase: () => ({
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }),
  }),
}));

vi.mock('../../utils/savedGames', () => ({
  loadSavedGamesForStudent: api.loadSavedGamesForStudent,
}));

vi.mock('../../hooks/useLiveBoards', () => ({
  useLiveBoards: () => ({ boards: new Map(), loading: false, error: null }),
  applyLiveBoardSnapshotsToSessions: (games: unknown) => games,
}));

const student: Student = {
  id: '11111111-1111-1111-1111-111111111111',
  name: '金子 大地',
  rank: '3級',
  internalRating: '',
  type: '',
  grade: '',
  country: '',
  studentCode: '1004',
};

const savedGame = (id: string, date: string, result = 'B+R'): SavedGame => ({
  id,
  date,
  blackPlayer: `sid:${student.id}`,
  whitePlayer: '三村九段',
  boardSize: 19,
  handicap: 0,
  komi: 6.5,
  result,
  sgf: '(;GM[1]SZ[19])',
});

function renderDashboard() {
  return render(
    <TeacherDashboard
      participants={[]}
      localIdentity="teacher"
      students={[student]}
      classrooms={[]}
      studentTypes={[]}
      selectedClassroomId={null}
      onSelectClassroom={vi.fn()}
      games={[]}
      audioPermissions={{ canHear: new Set(), canSpeak: new Set() } as never}
      onToggleHear={vi.fn()}
      onToggleMic={vi.fn()}
      chatMessages={[]}
      onChatSend={vi.fn()}
      videoElements={new Map()}
      studentJoinInfo=""
      onCreateGame={vi.fn()}
      onStartLecture={vi.fn()}
      onLoadSgf={vi.fn()}
      onDisconnect={vi.fn()}
      onReconnect={vi.fn()}
      isReconnecting={false}
      onOpenStudentManager={vi.fn()}
      onReloadData={vi.fn()}
      onReloadGames={vi.fn()}
      onCreateGames={vi.fn()}
      onSelectSavedGame={vi.fn()}
      onOpenTeacherGameWindow={vi.fn()}
    />,
  );
}

async function openHistory() {
  renderDashboard();
  fireEvent.click(screen.getByText('履歴'));
  await waitFor(() => expect(screen.getByText(/棋譜履歴 -/)).toBeInTheDocument());
}

describe('TeacherDashboard 棋譜履歴の一括削除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.loadSavedGamesForStudent.mockResolvedValue([
      savedGame('g1', '2026-08-01'),
      savedGame('g2', '2026-08-02'),
      savedGame('g3', '2026-08-03', '中断'),
    ]);
  });

  it('選んだ棋譜だけをまとめて削除し、一覧から消す', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openHistory();

    fireEvent.click(screen.getByLabelText('2026-08-01の棋譜を選ぶ'));
    fireEvent.click(screen.getByLabelText('2026-08-02の棋譜を選ぶ'));
    expect(screen.getByText('選んだ2件を削除')).toBeEnabled();

    fireEvent.click(screen.getByText('選んだ2件を削除'));

    await waitFor(() => expect(api.deleteSavedGames).toHaveBeenCalledWith(['g1', 'g2'], expect.any(Function)));
    await waitFor(() => expect(screen.queryByLabelText('2026-08-01の棋譜を選ぶ')).not.toBeInTheDocument());
    expect(screen.getByLabelText('2026-08-03の棋譜を選ぶ')).toBeInTheDocument();
  });

  it('「すべて選ぶ」で全件を選び、中断局が含まれることを断りに書く', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openHistory();

    fireEvent.click(screen.getByLabelText('すべての棋譜を選ぶ'));
    fireEvent.click(screen.getByText('選んだ3件を削除'));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('選択した3件の棋譜を削除しますか？'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('中断局が1局あります'));
    expect(api.deleteSavedGames).not.toHaveBeenCalled();
  });

  it('何も選んでいなければ削除ボタンは押せない', async () => {
    await openHistory();
    expect(screen.getByText('選んだ0件を削除')).toBeDisabled();
  });

  it('消せなかった棋譜は選んだまま残す', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    api.deleteSavedGames.mockResolvedValueOnce({ deleted: ['g1'], failed: [{ id: 'g2', error: 'Forbidden' }] });
    await openHistory();

    fireEvent.click(screen.getByLabelText('すべての棋譜を選ぶ'));
    fireEvent.click(screen.getByText('選んだ3件を削除'));

    await waitFor(() => expect(screen.getByText('選んだ1件を削除')).toBeInTheDocument());
    expect(screen.getByLabelText('2026-08-02の棋譜を選ぶ')).toBeChecked();
    expect(screen.getByLabelText('2026-08-03の棋譜を選ぶ')).not.toBeChecked();
  });
});
