import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameBoard from './GameBoard';
import { createEmptyBoard } from '../utils/gameLogic';
import type { GameSession } from '../types/game';
import type { Student } from '../types/classroom';
import { useLiveGame } from '../hooks/useLiveGame';

// useLiveGame フックをモック化
vi.mock('../hooks/useLiveGame', () => {
  return {
    useLiveGame: vi.fn(),
  };
});

function createMockGame(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'game-1',
    blackPlayer: 'たろう',
    whitePlayer: 'はなこ',
    boardSize: 9,
    handicap: 0,
    komi: 6.5,
    status: 'playing',
    boardState: createEmptyBoard(9),
    currentColor: 'BLACK',
    moveNumber: 0,
    moveHistory: [],
    blackCaptures: 0,
    whiteCaptures: 0,
    ...overrides,
  };
}

describe('GameBoard', () => {
  const mockSubmitMove = vi.fn();
  const mockSubmitPass = vi.fn();
  const mockSubmitResign = vi.fn();
  const mockSetDeadStones = vi.fn();
  const mockFinishWithResult = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  function setupMock(overrides: any = {}) {
    const rawGame = overrides.game !== undefined ? overrides.game : createMockGame();
    
    const blackPlayerName = rawGame ? (rawGame.black_player || rawGame.blackPlayer) : '';
    const whitePlayerName = rawGame ? (rawGame.white_player || rawGame.whitePlayer) : '';
    const boardSize = rawGame ? (rawGame.board_size || rawGame.boardSize || 9) : 9;
    const scoringDeadStones = rawGame ? (rawGame.scoring_dead_stones || rawGame.scoringDeadStones || []) : [];

    const isBlack = blackPlayerName === 'たろう';
    const isWhite = whitePlayerName === 'たろう';
    const isParticipant = isBlack || isWhite;
    const myColor = isBlack ? 'BLACK' : isWhite ? 'WHITE' : null;
    const isMyTurn = isParticipant && myColor === (rawGame ? rawGame.currentColor : 'BLACK');

    const mockGameRow = rawGame ? {
      id: rawGame.id,
      black_player: blackPlayerName,
      white_player: whitePlayerName,
      board_size: boardSize,
      handicap: rawGame.handicap,
      komi: rawGame.komi,
      status: rawGame.status,
      scoring_dead_stones: scoringDeadStones,
      result: rawGame.result,
    } : null;

    const mockResult = {
      game: mockGameRow,
      boardState: rawGame ? (rawGame.boardState || rawGame.board_state || createEmptyBoard(boardSize)) : createEmptyBoard(boardSize),
      currentColor: rawGame ? rawGame.currentColor : 'BLACK',
      moveNumber: rawGame ? (rawGame.moveNumber !== undefined ? rawGame.moveNumber : rawGame.move_number || 0) : 0,
      blackCaptures: rawGame ? (rawGame.blackCaptures !== undefined ? rawGame.blackCaptures : rawGame.black_captures || 0) : 0,
      whiteCaptures: rawGame ? (rawGame.whiteCaptures !== undefined ? rawGame.whiteCaptures : rawGame.white_captures || 0) : 0,
      lastMove: null,
      moves: [],
      myColor,
      isParticipant,
      isMyTurn,
      loading: false,
      error: null,
      submitMove: mockSubmitMove,
      submitPass: mockSubmitPass,
      submitResign: mockSubmitResign,
      enterScoring: vi.fn(),
      setDeadStones: mockSetDeadStones,
      finishWithResult: mockFinishWithResult,
      ...overrides,
    };

    if (overrides.game !== undefined) {
      mockResult.game = mockGameRow;
    }

    vi.mocked(useLiveGame).mockReturnValue(mockResult as any);
  }

  it('対局情報を表示する', () => {
    const game = createMockGame();
    setupMock({ game });
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
      />
    );
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByText('はなこ')).toBeInTheDocument();
    expect(screen.getByText('0手目')).toBeInTheDocument();
  });

  it('ID保存された対局者を名簿から名前表示する', () => {
    const game = createMockGame({ blackPlayer: 'sid:1002', whitePlayer: 'teacher' });
    const students: Student[] = [{
      id: '1002',
      studentCode: '1002',
      name: '太郎',
      rank: '10K',
      internalRating: '',
      type: 'ネット生',
      grade: '',
      country: '',
    }];
    setupMock({ game, myColor: null, isParticipant: false, isMyTurn: false });

    render(
      <GameBoard
        gameId="game-1"
        myIdentity="teacher"
        isTeacher
        students={students}
      />,
    );

    expect(screen.getByText('太郎')).toBeInTheDocument();
    expect(screen.getByText('三村九段')).toBeInTheDocument();
    expect(screen.queryByText('sid:1002')).not.toBeInTheDocument();
    expect(screen.queryByText('teacher')).not.toBeInTheDocument();
  });

  it('自分の番のとき「あなたの番です」を表示', () => {
    const game = createMockGame({ currentColor: 'BLACK' });
    setupMock({ game });
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
      />
    );
    expect(screen.getByText('あなたの番です')).toBeInTheDocument();
  });

  it('相手の番のとき「相手の番です」を表示', () => {
    const game = createMockGame({ currentColor: 'WHITE' });
    setupMock({ game });
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
      />
    );
    expect(screen.getByText('相手の番です')).toBeInTheDocument();
  });

  it('パスボタンが自分の番のとき表示される', () => {
    const game = createMockGame({ currentColor: 'BLACK' });
    setupMock({ game });
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
      />
    );
    const passBtn = screen.getByText('パス');
    expect(passBtn).toBeInTheDocument();
    fireEvent.click(passBtn);
    expect(mockSubmitPass).toHaveBeenCalled();
  });

  it('投了ボタンをクリック→confirmで呼ばれる', () => {
    const game = createMockGame({ currentColor: 'BLACK' });
    setupMock({ game });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
      />
    );
    fireEvent.click(screen.getByText('投了'));
    expect(mockSubmitResign).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('相手の番のときは投了ボタンを表示しない（投了は手番側のみ）', () => {
    const game = createMockGame({ currentColor: 'WHITE' }); // たろう=黒 → 手番でない
    setupMock({ game });
    render(
      <GameBoard gameId="game-1" myIdentity="たろう" />
    );
    expect(screen.queryByText('投了')).not.toBeInTheDocument();
    expect(screen.queryByText('パス')).not.toBeInTheDocument();
  });

  it('終局時は結果を表示しボタンは非表示', () => {
    const game = createMockGame({ status: 'finished', result: 'B+R' });
    setupMock({ game });
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
      />
    );
    expect(screen.getByText('終局: B+R')).toBeInTheDocument();
    expect(screen.queryByText('パス')).not.toBeInTheDocument();
    expect(screen.queryByText('投了')).not.toBeInTheDocument();
  });

  it('戻るボタンが機能する', () => {
    const game = createMockGame();
    setupMock({ game });
    const onBack = vi.fn();
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByText('閉じてホーム'));
    expect(onBack).toHaveBeenCalled();
  });

  it('取り石数を表示する', () => {
    const game = createMockGame({ blackCaptures: 3, whiteCaptures: 5 });
    setupMock({ game });
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="たろう"
      />
    );
    expect(screen.getByText('取3')).toBeInTheDocument();
    expect(screen.getByText('取5')).toBeInTheDocument();
  });

  it('観戦者には操作ボタンが表示されない', () => {
    const game = createMockGame();
    setupMock({ game, myColor: null, isParticipant: false, isMyTurn: false });
    render(
      <GameBoard
        gameId="game-1"
        myIdentity="観戦者"
      />
    );
    // 観戦者はパス・投了ボタンが出ない
    expect(screen.queryByText('パス')).not.toBeInTheDocument();
    expect(screen.queryByText('投了')).not.toBeInTheDocument();
  });

  it('プレイヤーを兼ねる先生は相手の手番では盤がロックされ着手できない', () => {
    // 先生=白番、いまは黒（生徒）の手番。手番でないので打てない。
    const game = createMockGame({ blackPlayer: '生徒', whitePlayer: '先生', currentColor: 'BLACK' });
    setupMock({ game, myColor: 'WHITE', isParticipant: true, isMyTurn: false });
    const { container } = render(
      <GameBoard gameId="game-1" myIdentity="先生" isTeacher />
    );
    // 相手の手番なのでクリック可能なセルが一つも描画されない（readOnly）
    expect(container.querySelector('[data-cell]')).toBeNull();
  });

  it('観戦中の先生（どちらの色でもない）は代打ちできない', () => {
    // 対局中の代打ちはどんな場合でも不可。先生が黒白どちらのプレイヤーでもない → 打てない。
    const game = createMockGame({ blackPlayer: '生徒A', whitePlayer: '生徒B', currentColor: 'BLACK' });
    setupMock({ game, myColor: null, isParticipant: false, isMyTurn: false });
    const { container } = render(
      <GameBoard gameId="game-1" myIdentity="先生" isTeacher />
    );
    // 盤はロックされ、クリック可能なセルが存在しない
    expect(container.querySelector('[data-cell]')).toBeNull();
  });

  it('先生は相手の手番でも描画モードで線を引けるが代打ちはしない', () => {
    const game = createMockGame({ blackPlayer: '生徒', whitePlayer: '先生', currentColor: 'BLACK' });
    setupMock({ game, myColor: 'WHITE', isParticipant: true, isMyTurn: false });
    const classroom = { broadcast: vi.fn() };
    const { container } = render(
      <GameBoard gameId="game-1" myIdentity="先生" isTeacher classroom={classroom as any} />
    );

    expect(container.querySelector('[data-cell]')).toBeNull();

    fireEvent.click(screen.getByLabelText('線を描く'));
    const cells = container.querySelectorAll('[data-cell]');
    expect(cells.length).toBe(81);

    fireEvent.mouseDown(cells[0], { buttons: 1 });
    fireEvent.mouseEnter(cells[10], { buttons: 1 });
    fireEvent.mouseUp(cells[10]);

    expect(mockSubmitMove).not.toHaveBeenCalled();
    expect(container.querySelector('line[stroke="#e53e3e"]')).toBeInTheDocument();
    expect(classroom.broadcast).toHaveBeenCalledWith({
      type: 'DRAW_UPDATE',
      payload: [{ fromX: 1, fromY: 1, toX: 2, toY: 2, type: 'line' }],
    });
  });

  it('別の対局へ切り替えると講師の一時描画をリセットする', () => {
    const game = createMockGame({ blackPlayer: '生徒', whitePlayer: '先生', currentColor: 'BLACK' });
    setupMock({ game, myColor: 'WHITE', isParticipant: true, isMyTurn: false });
    const classroom = { broadcast: vi.fn() };
    const { container, rerender } = render(
      <GameBoard gameId="game-1" myIdentity="先生" isTeacher classroom={classroom as any} />
    );

    fireEvent.click(screen.getByLabelText('線を描く'));
    const cells = container.querySelectorAll('[data-cell]');
    fireEvent.mouseDown(cells[0], { buttons: 1 });
    fireEvent.mouseEnter(cells[10], { buttons: 1 });
    fireEvent.mouseUp(cells[10]);
    expect(container.querySelector('line[stroke="#e53e3e"]')).toBeInTheDocument();

    rerender(
      <GameBoard gameId="game-2" myIdentity="先生" isTeacher classroom={classroom as any} />
    );
    expect(container.querySelector('line[stroke="#e53e3e"]')).not.toBeInTheDocument();
  });
});
