import { useState, useCallback, useRef } from 'react';
import type { GameSession, GameMove, GameMovePayload, GameBoardUpdatePayload } from '../types/game';
import type { ClassroomLiveKit, ClassroomMessage } from '../utils/classroomLiveKit';
import type { StoneColor } from '../components/GoBoard';
import { createEmptyBoard, checkCapture, isLegalMove, boardHash } from '../utils/gameLogic';
import { getHandicapStones } from '../utils/handicapStones';
import { exportGameToSgf, todaySgfDate } from '../utils/sgfExport';
import { saveGame } from '../utils/savedGames';

// 先生用：対局管理ロジック
export function useGameManager(classroomRef: React.RefObject<ClassroomLiveKit | null>) {
  const [games, setGames] = useState<GameSession[]>([]);
  const gamesRef = useRef<GameSession[]>([]);

  // gamesRefを同期
  const updateGames = useCallback((updater: (prev: GameSession[]) => GameSession[]) => {
    setGames(prev => {
      const next = updater(prev);
      gamesRef.current = next;
      return next;
    });
  }, []);

  // 対局作成
  const createGame = useCallback((opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
  }) => {
    const { blackPlayer, whitePlayer, boardSize, handicap, komi } = opts;

    let initialBoard = createEmptyBoard(boardSize);

    // 置石配置
    if (handicap >= 2) {
      const stones = getHandicapStones(boardSize, handicap);
      stones.forEach(s => {
        initialBoard[s.y - 1][s.x - 1] = { color: 'BLACK' };
      });
    }

    const game: GameSession = {
      id: Math.random().toString(36).substr(2, 9),
      blackPlayer,
      whitePlayer,
      boardSize,
      handicap,
      komi,
      status: 'playing',
      boardState: initialBoard,
      currentColor: handicap >= 2 ? 'WHITE' : 'BLACK',
      moveNumber: 0,
      moveHistory: [],
      blackCaptures: 0,
      whiteCaptures: 0,
    };

    updateGames(prev => [...prev, game]);

    // 全員に通知
    classroomRef.current?.broadcast({
      type: 'GAME_CREATED',
      payload: { game },
    });

    return game;
  }, [classroomRef, updateGames]);

  // 着手処理（先生がバリデーション）
  const handleMove = useCallback((gameId: string, x: number, y: number, color: StoneColor) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game || game.status !== 'playing') return;
    if (game.currentColor !== color) return;

    if (!isLegalMove(game.boardState, x, y, color, game.boardSize, game.lastBoardHash)) {
      return;
    }

    // 着手実行
    const newBoard = game.boardState.map(row => row.map(cell => cell ? { ...cell } : null));
    newBoard[y - 1][x - 1] = { color, number: game.moveNumber + 1 };

    const { board: capturedBoard, capturedCount } = checkCapture(newBoard, x, y, color, game.boardSize);

    const prevHash = boardHash(game.boardState);
    const move: GameMove = { x, y, color };

    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return {
        ...g,
        boardState: capturedBoard,
        currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
        moveNumber: g.moveNumber + 1,
        moveHistory: [...g.moveHistory, move],
        blackCaptures: g.blackCaptures + (color === 'BLACK' ? capturedCount : 0),
        whiteCaptures: g.whiteCaptures + (color === 'WHITE' ? capturedCount : 0),
        lastBoardHash: prevHash,
      };
    }));

    // 全員に盤面更新通知
    const updatePayload: GameBoardUpdatePayload = {
      gameId,
      boardState: capturedBoard,
      currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
      moveNumber: game.moveNumber + 1,
      blackCaptures: game.blackCaptures + (color === 'BLACK' ? capturedCount : 0),
      whiteCaptures: game.whiteCaptures + (color === 'WHITE' ? capturedCount : 0),
      lastMove: move,
    };

    classroomRef.current?.broadcast({
      type: 'GAME_BOARD_UPDATE',
      payload: updatePayload,
    });
  }, [classroomRef, updateGames]);

  // パス処理
  const handlePass = useCallback((gameId: string, color: StoneColor) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game || game.status !== 'playing') return;
    if (game.currentColor !== color) return;

    const passMove: GameMove = { x: 0, y: 0, color };

    // 連続パスで終局
    const lastMove = game.moveHistory[game.moveHistory.length - 1];
    const isDoublePass = lastMove && lastMove.x === 0 && lastMove.y === 0;

    if (isDoublePass) {
      // 終局
      endGame(gameId, '双方パス');
      return;
    }

    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return {
        ...g,
        currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
        moveNumber: g.moveNumber + 1,
        moveHistory: [...g.moveHistory, passMove],
      };
    }));

    classroomRef.current?.broadcast({
      type: 'GAME_BOARD_UPDATE',
      payload: {
        gameId,
        boardState: game.boardState,
        currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
        moveNumber: game.moveNumber + 1,
        blackCaptures: game.blackCaptures,
        whiteCaptures: game.whiteCaptures,
        lastMove: passMove,
      } as GameBoardUpdatePayload,
    });
  }, [classroomRef, updateGames]);

  // 投了処理
  const handleResign = useCallback((gameId: string, color: StoneColor) => {
    const winner = color === 'BLACK' ? 'W' : 'B';
    endGame(gameId, `${winner}+R`);
  }, []);

  // 対局終了
  const endGame = useCallback((gameId: string, result: string) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game) return;

    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return { ...g, status: 'finished', result };
    }));

    // SGF保存
    const sgf = exportGameToSgf({
      boardSize: game.boardSize,
      handicap: game.handicap,
      komi: game.komi,
      blackPlayer: game.blackPlayer,
      whitePlayer: game.whitePlayer,
      result,
      moves: game.moveHistory,
      date: todaySgfDate(),
    });

    saveGame({
      id: game.id,
      date: todaySgfDate(),
      blackPlayer: game.blackPlayer,
      whitePlayer: game.whitePlayer,
      boardSize: game.boardSize,
      handicap: game.handicap,
      komi: game.komi,
      result,
      sgf,
    });

    classroomRef.current?.broadcast({
      type: 'GAME_ENDED',
      payload: { gameId, result },
    });
  }, [classroomRef, updateGames]);

  // メッセージハンドラ（生徒からの着手を受信）
  const handleGameMessage = useCallback((msg: ClassroomMessage, sender?: string) => {
    if (msg.type === 'GAME_MOVE' && sender) {
      const p = msg.payload as GameMovePayload;
      // 送信者が対局参加者か確認
      const game = gamesRef.current.find(g => g.id === p.gameId);
      if (!game) return;

      const isBlack = game.blackPlayer === sender;
      const isWhite = game.whitePlayer === sender;
      if (!isBlack && !isWhite) return;

      const expectedColor = isBlack ? 'BLACK' : 'WHITE';
      if (expectedColor !== p.color) return;

      handleMove(p.gameId, p.x, p.y, p.color);
    } else if (msg.type === 'GAME_PASS' && sender) {
      const p = msg.payload as { gameId: string; color: StoneColor };
      handlePass(p.gameId, p.color);
    } else if (msg.type === 'GAME_RESIGN' && sender) {
      const p = msg.payload as { gameId: string; color: StoneColor };
      handleResign(p.gameId, p.color);
    }
  }, [handleMove, handlePass, handleResign]);

  // 新規参加者に全対局一覧を送信
  const syncGamesToParticipant = useCallback((identity: string) => {
    classroomRef.current?.sendTo({
      type: 'GAME_LIST_SYNC',
      payload: { games: gamesRef.current },
    }, [identity]);
  }, [classroomRef]);

  return {
    games,
    createGame,
    handleMove,
    handlePass,
    handleResign,
    endGame,
    handleGameMessage,
    syncGamesToParticipant,
  };
}
