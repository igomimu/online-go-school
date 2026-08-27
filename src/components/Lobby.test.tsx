import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Lobby from './Lobby';
import { createEmptyBoard } from '../utils/gameLogic';
import type { GameSession } from '../types/game';
import type { ParticipantInfo } from '../utils/classroomRtc';

const mockParticipants: ParticipantInfo[] = [
  { identity: '三村先生', isSpeaking: false, audioEnabled: true, videoEnabled: false },
  { identity: 'たろう', isSpeaking: false, audioEnabled: false, videoEnabled: false },
  { identity: 'はなこ', isSpeaking: true, audioEnabled: true, videoEnabled: false },
];

const mockGame: GameSession = {
  id: 'game-1',
  blackPlayer: 'たろう',
  whitePlayer: 'はなこ',
  boardSize: 9,
  handicap: 0,
  komi: 6.5,
  status: 'playing',
  boardState: createEmptyBoard(9),
  currentColor: 'BLACK',
  moveNumber: 5,
  moveHistory: [],
  blackCaptures: 0,
  whiteCaptures: 0,
};

describe('Lobby', () => {
  it('参加者一覧を表示する', () => {
    render(
      <Lobby
        role="TEACHER"
        participants={mockParticipants}
        localIdentity="三村先生"
        activeSpeakers={[]}
        games={[]}
        studentJoinInfo=""
        onSelectGame={vi.fn()}
        myIdentity="三村先生"
      />
    );
    expect(screen.getByText('三村先生')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByText('はなこ')).toBeInTheDocument();
    expect(screen.getByText(/参加者 \(3\)/)).toBeInTheDocument();
  });

  it('先生用ボタンが表示される', () => {
    render(
      <Lobby
        role="TEACHER"
        participants={mockParticipants}
        localIdentity="三村先生"
        activeSpeakers={[]}
        games={[]}
        studentJoinInfo=""
        onCreateGame={vi.fn()}
        onStartLecture={vi.fn()}
        onSelectGame={vi.fn()}
        myIdentity="三村先生"
      />
    );
    expect(screen.getByText('対局を作成')).toBeInTheDocument();
    expect(screen.getByText('授業モード')).toBeInTheDocument();
    expect(screen.getByText('SGF読込')).toBeInTheDocument();
  });

  it('生徒には先生用ボタンが表示されない', () => {
    render(
      <Lobby
        role="STUDENT"
        participants={mockParticipants}
        localIdentity="たろう"
        activeSpeakers={[]}
        games={[]}
        studentJoinInfo=""
        onSelectGame={vi.fn()}
        myIdentity="たろう"
      />
    );
    expect(screen.queryByText('対局を作成')).not.toBeInTheDocument();
    expect(screen.queryByText('授業モード')).not.toBeInTheDocument();
  });

  it('対局がない場合のメッセージ（先生）', () => {
    render(
      <Lobby
        role="TEACHER"
        participants={[]}
        localIdentity="三村先生"
        activeSpeakers={[]}
        games={[]}
        studentJoinInfo=""
        onCreateGame={vi.fn()}
        onSelectGame={vi.fn()}
        myIdentity="三村先生"
      />
    );
    expect(screen.getByText('「対局を作成」で生徒同士の対局を組めます')).toBeInTheDocument();
  });

  it('対局がない場合のメッセージ（生徒）', () => {
    render(
      <Lobby
        role="STUDENT"
        participants={[]}
        localIdentity="たろう"
        activeSpeakers={[]}
        games={[]}
        studentJoinInfo=""
        onSelectGame={vi.fn()}
        myIdentity="たろう"
      />
    );
    expect(screen.getByText('先生が対局を作成するのをお待ちください')).toBeInTheDocument();
  });

  it('進行中の対局を表示する', () => {
    render(
      <Lobby
        role="TEACHER"
        participants={mockParticipants}
        localIdentity="三村先生"
        activeSpeakers={[]}
        games={[mockGame]}
        studentJoinInfo=""
        onSelectGame={vi.fn()}
        myIdentity="三村先生"
      />
    );
    expect(screen.getByText('進行中の対局')).toBeInTheDocument();
  });

  it('自分が参加中の対局がハイライトされる（生徒）', () => {
    render(
      <Lobby
        role="STUDENT"
        participants={mockParticipants}
        localIdentity="たろう"
        activeSpeakers={[]}
        games={[mockGame]}
        studentJoinInfo=""
        onSelectGame={vi.fn()}
        myIdentity="たろう"
      />
    );
    // 「対局中」ラベルはサイドバーの参加者リストにも表示されるのでgetAllBy
    const inGameLabels = screen.getAllByText('対局中');
    expect(inGameLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('碁盤を開く')).toBeInTheDocument();
  });

  it('sid付きidentityと素の生徒IDが混在しても自分の対局として扱う（生徒）', () => {
    const onSelectGame = vi.fn();
    render(
      <Lobby
        role="STUDENT"
        participants={[
          { identity: 'sid:S001', isSpeaking: false, audioEnabled: true, videoEnabled: false },
        ]}
        localIdentity="sid:S001"
        activeSpeakers={[]}
        games={[{ ...mockGame, id: 'game-sid', blackPlayer: 'S001', whitePlayer: 'teacher' }]}
        studentJoinInfo=""
        onSelectGame={onSelectGame}
        myIdentity="sid:S001"
      />
    );

    fireEvent.click(screen.getByText('碁盤を開く'));
    expect(onSelectGame).toHaveBeenCalledWith('game-sid');
  });

  // 2026-08-27 仕様変更: 中断局は棋譜履歴の一件として扱う。生徒のロビーには出さず、
  // 再開は講師が生徒一覧の「棋譜履歴」から行う（三村さん指定: 再開は講師だけ）。
  it('中断対局は生徒のロビーに出さない（再開は講師が履歴から行う）', () => {
    render(
      <Lobby
        role="STUDENT"
        participants={mockParticipants}
        localIdentity="たろう"
        activeSpeakers={[]}
        games={[{ ...mockGame, status: 'interrupted', result: '中断' }]}
        studentJoinInfo=""
        onSelectGame={vi.fn()}
        onResumeGame={vi.fn()}
        myIdentity="たろう"
      />
    );

    expect(screen.queryByText('対局を再開する')).not.toBeInTheDocument();
    expect(screen.queryByText('中断された対局があります')).not.toBeInTheDocument();
  });

  it('「対局を作成」ボタンのクリック', () => {
    const onCreateGame = vi.fn();
    render(
      <Lobby
        role="TEACHER"
        participants={[]}
        localIdentity="三村先生"
        activeSpeakers={[]}
        games={[]}
        studentJoinInfo=""
        onCreateGame={onCreateGame}
        onSelectGame={vi.fn()}
        myIdentity="三村先生"
      />
    );
    fireEvent.click(screen.getByText('対局を作成'));
    expect(onCreateGame).toHaveBeenCalled();
  });

  // 押せば観戦できることは、押してみるまで分からない（2026-08-12 三村さん）
  describe('観戦の案内', () => {
    const spectateHint = '碁盤をクリックすると、ほかの人の対局を観戦できます。';

    it('打っていない生徒には観戦できることを知らせる', () => {
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          localIdentity="じろう"
          activeSpeakers={[]}
          games={[mockGame]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="じろう"
        />
      );
      expect(screen.getByText(spectateHint)).toBeInTheDocument();
    });

    it('対局中の生徒には出さない', () => {
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          localIdentity="たろう"
          activeSpeakers={[]}
          games={[mockGame]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="たろう"
        />
      );
      expect(screen.queryByText(spectateHint)).not.toBeInTheDocument();
    });

    it('先生には出さない', () => {
      render(
        <Lobby
          role="TEACHER"
          participants={mockParticipants}
          localIdentity="三村先生"
          activeSpeakers={[]}
          games={[mockGame]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="三村先生"
        />
      );
      expect(screen.queryByText(spectateHint)).not.toBeInTheDocument();
    });
  });
  describe('出入りのひとこと', () => {
    const at = new Date('2026-08-14T14:02:00');

    it('LiveKit の表示名で「◯◯さんが来ました」と出す', () => {
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          participantLog={[
            { key: 'k1', identity: 'sid:1000', name: '長野優希', kind: 'join', at },
          ]}
          localIdentity="たろう"
          activeSpeakers={[]}
          games={[]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="たろう"
        />
      );
      expect(screen.getByText(/長野優希さんが来ました/)).toBeInTheDocument();
    });

    it('出て行った人は「出ました」と出す', () => {
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          participantLog={[
            { key: 'k1', identity: 'sid:1000', name: '長野優希', kind: 'leave', at },
          ]}
          localIdentity="たろう"
          activeSpeakers={[]}
          games={[]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="たろう"
        />
      );
      expect(screen.getByText(/長野優希さんが出ました/)).toBeInTheDocument();
    });

    it('名前が引けない出入りは行ごと出さない（「不明(1000)さん」を出さない）', () => {
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          participantLog={[
            { key: 'k1', identity: 'sid:1000', name: '', kind: 'join', at },
          ]}
          localIdentity="たろう"
          activeSpeakers={[]}
          games={[]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="たろう"
        />
      );
      expect(screen.queryByText(/さんが来ました/)).not.toBeInTheDocument();
      expect(screen.queryByText(/不明/)).not.toBeInTheDocument();
    });

    it('直近3件だけ出す', () => {
      const names = ['一郎', '二郎', '三郎', '四郎'];
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          participantLog={names.map((name, i) => ({
            key: `k${i}`, identity: `sid:100${i}`, name, kind: 'join' as const, at,
          }))}
          localIdentity="たろう"
          activeSpeakers={[]}
          games={[]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="たろう"
        />
      );
      expect(screen.queryByText(/一郎さんが来ました/)).not.toBeInTheDocument();
      expect(screen.getByText(/四郎さんが来ました/)).toBeInTheDocument();
      expect(screen.getAllByText(/さんが来ました/)).toHaveLength(3);
    });
  });
  describe('棋力の見せ方', () => {
    // 教室の設定（講師が授業中に切り替える）に生徒の画面も従う
    const students = [
      { id: 'たろう', name: 'たろう', rank: '初段', internalRating: 'R12', type: 'ネット生', grade: '', country: '' },
    ];

    it('既定は段級で出す', () => {
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          localIdentity="たろう"
          activeSpeakers={[]}
          games={[]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="たろう"
          students={students}
        />
      );
      expect(screen.getByTestId('participant-rank')).toHaveTextContent('初段');
    });

    it('講師がランクを選んでいれば生徒の画面もランクで出す', () => {
      render(
        <Lobby
          role="STUDENT"
          participants={mockParticipants}
          localIdentity="たろう"
          activeSpeakers={[]}
          games={[]}
          studentJoinInfo=""
          onSelectGame={vi.fn()}
          myIdentity="たろう"
          students={students}
          rankDisplay="rating"
        />
      );
      expect(screen.getByTestId('participant-rank')).toHaveTextContent('R12');
    });
  });
});
