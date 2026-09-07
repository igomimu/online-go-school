import type { BoardState, StoneColor } from '../components/GoBoard';

// === 対局セッション ===
export interface GameClock {
  timeSystem?: 'STANDARD' | 'NHK'; // 省略時は従来の持ち時間＋秒読み
  mainTimeSeconds: number;     // 持ち時間（秒）
  byoyomiSeconds: number;      // 秒読み（秒）
  byoyomiPeriods: number;      // 秒読み回数
  considerationSeconds?: number; // NHK杯方式の考慮時間（1回60秒）
  blackTimeLeft: number;       // 黒残り時間（秒）
  whiteTimeLeft: number;       // 白残り時間（秒）
  blackByoyomiLeft: number;    // 黒秒読み残り回数
  whiteByoyomiLeft: number;    // 白秒読み残り回数
  blackInByoyomi?: boolean;    // 黒が秒読みに入っているか（持ち時間切れ）
  whiteInByoyomi?: boolean;    // 白が秒読みに入っているか
  blackInConsideration?: boolean; // 黒がNHK杯方式の考慮時間中か
  whiteInConsideration?: boolean; // 白がNHK杯方式の考慮時間中か
  lastTickTime: number | null; // 最後のtick時刻（ms）
}

export interface GameSession {
  id: string;
  blackPlayer: string;     // identity
  whitePlayer: string;
  boardSize: number;        // 7〜19の奇数路盤
  handicap: number;         // 0-9
  komi: number;             // 6.5等
  status: 'playing' | 'scoring' | 'finished' | 'interrupted';
  boardState: BoardState;
  currentColor: StoneColor;
  moveNumber: number;
  moveHistory: GameMove[];
  blackCaptures: number;
  whiteCaptures: number;
  result?: string;          // "B+R", "W+3.5"等
  lastBoardHash?: string;   // コウ検出用
  clock?: GameClock;        // 対局時計（なければ時間無制限）
  scoringDeadStones?: string[]; // 整地モード: 死石座標 "x,y" (1-indexed)
}

export interface GameMove {
  x: number;
  y: number;
  color: StoneColor;
}

// === 保存棋譜 ===
export interface SavedGame {
  id: string;
  date: string;
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  handicap: number;
  komi: number;
  result: string;
  sgf: string;
  /**
   * 対応する進行中テーブルの状態。履歴だけでは「再開できる中断局か」が分からないため添える。
   * 中断局も棋譜履歴の一件として扱う（2026-08-27）。undefined は突き合わせをしていない場合。
   */
  liveStatus?: 'playing' | 'scoring' | 'finished' | 'interrupted';
  /**
   * この棋譜の出どころ。
   * live=アプリで打った対局 / upload=SGFファイルの持込 / manual=盤に並べて入力。
   * 持込と対局の記録が混ざると勝敗の見え方が狂うので、一覧では印で分ける。
   */
  source?: GameRecordSource;
  /** 持込棋譜を入れた人の identity。自分が入れたものだけ消せるようにするために使う */
  createdBy?: string;
}

/** 棋譜の出どころ。DB の go_school_games.source と同じ値 */
export type GameRecordSource = 'live' | 'upload' | 'manual';

// === 音声制御 ===
export interface AudioPermissions {
  [identity: string]: {
    canHear: boolean;
    micAllowed: boolean;
    cameraAllowed: boolean;
  };
}

// === 画面状態 ===
export type ViewMode = 'lobby' | 'game' | 'review' | 'lecture' | 'problem' | 'record';

// === DataChannelメッセージ ===
export type GameMessageType =
  | 'GAME_CREATED'
  | 'GAME_MOVE'
  | 'GAME_MOVE_REJECTED'
  | 'GAME_BOARD_UPDATE'
  | 'GAME_PASS'
  | 'GAME_RESIGN'
  | 'GAME_ENDED'
  | 'GAME_LIST_SYNC'
  | 'SCORING_UPDATE'
  | 'PROBLEM_ASSIGN'
  | 'PROBLEM_RESULT'
  | 'REVIEW_START'
  | 'REVIEW_END'
  | 'NIGIRI_DRAW'
  | 'REVIEW_PERMISSIONS'
  | 'REVIEW_STUDENT_MOVE'
  | 'REVIEW_STUDENT_UNDO'
  | 'REVIEW_STUDENT_NAV'
  | 'AUDIO_CONTROL'
  | 'MEDIA_CONTROL'
  | 'RANK_DISPLAY'
  | 'CHAT_MESSAGE'
  | 'GAME_UNDO_REQUEST'
  | 'GAME_UNDO_RESPONSE';

/** 授業中に講師が切り替える棋力の見せ方。生徒の画面もこれに合わせる */
export interface RankDisplayPayload {
  value: import('./classroom').RankDisplay;
}

export interface GameCreatedPayload {
  game: GameSession;
}

/** ニギリ（黒白決め）。押した時点で結果ごと対局者へ送り、向こうでも同じ間合いで止める */
export interface NigiriDrawPayload {
  blackPlayer: string;
  whitePlayer: string;
}

/** 検討中に盤へ打てる生徒（先生が生徒ごとに許可する。既定は誰も打てない） */
export interface ReviewPermissionsPayload {
  allowed: string[];
}

/** 許可された生徒の着手。実際に打つのは先生側で、生徒は自分の盤に置かない */
export interface ReviewStudentMovePayload {
  x: number;
  y: number;
}

/**
 * 許可された生徒からの「1手戻す」。着手と同じで、実際に戻すのは先生側。
 * 並べ間違いのたびに先生の手が止まるのを防ぐためのもの（2026-09-07 三村さん）。
 */
export type ReviewStudentUndoPayload = Record<string, never>;

/**
 * 許可された生徒からの「◯手目へ」。手順の何番目かを絶対値で送る。
 * 「1手進む」のような差分だと、往復の間に先生が動かしたときにずれる。
 */
export interface ReviewStudentNavPayload {
  index: number;
}

export interface GameMovePayload {
  gameId: string;
  x: number;
  y: number;
  color: StoneColor;
  moveNumber?: number;
}

/**
 * 送った手がサーバーに保存できなかったことの通知。
 * RTC で先に配った仮の石を、相手の盤からも消してもらうために使う
 * （2026-09-07 Codex レビュー #2）。
 */
export interface GameMoveRejectedPayload {
  gameId: string;
  moveNumber: number;
}

export interface GameBoardUpdatePayload {
  gameId: string;
  boardState: BoardState;
  currentColor: StoneColor;
  moveNumber: number;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove?: GameMove;
}

export interface GamePassPayload {
  gameId: string;
  color: StoneColor;
  moveNumber?: number;
}

export interface GameResignPayload {
  gameId: string;
  color: StoneColor;
}

// バナー表示・盤面反映の即時通知。DBのDELETE realtimeが届かない場合の保険として、
// 受信側でも targetMoveNumber を使って直接 moves から除去する（idempotent、二重適用しても無害）。
export interface GameUndoRequestPayload {
  gameId: string;
  requestedBy: string;
  requestedColor: StoneColor;
  targetMoveNumber: number;
}

export interface GameUndoResponsePayload {
  gameId: string;
  accepted: boolean;
  targetMoveNumber: number;
}

export interface GameEndedPayload {
  gameId: string;
  result: string;
}

export interface GameListSyncPayload {
  games: GameSession[];
}

export interface ReviewStartPayload {
  sgf: string;
  boardSize: number;
  targetStudents: string[];  // 空配列 = 全員
}

export interface ScoringUpdatePayload {
  gameId: string;
  deadStones: string[];   // "x,y" (1-indexed)
  status: 'scoring';
}

// 検討終了の合図。ペイロードは不要（空オブジェクト）。
export type ReviewEndPayload = Record<string, never>;

export interface AudioControlPayload {
  canHear: boolean;
}

export interface MediaControlPayload {
  micAllowed: boolean;
  cameraAllowed: boolean;
}
