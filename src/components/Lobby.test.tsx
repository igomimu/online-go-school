import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Lobby from './Lobby';
import { createEmptyBoard } from '../utils/gameLogic';
import type { GameSession } from '../types/game';
import type { ParticipantInfo } from '../utils/classroomLiveKit';

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
});
