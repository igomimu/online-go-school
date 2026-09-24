export type TournamentType = 'single_elimination' | 'round_robin';

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';

export interface TournamentParticipant {
  identity: string;
  name: string;
  rank: string;
  seed?: number;
  score?: number;
}

export interface TournamentMatch {
  id: string;
  round: number; // 1, 2, 3...
  matchIndex: number; // 0, 1, 2...
  player1: TournamentParticipant | null;
  player2: TournamentParticipant | null;
  winnerId: string | null;
  resultDetail?: string; // 例: "B+R", "W+3.5", "不戦勝"
  liveGameId?: string; // 作成された live_game の ID
  handicap: number;
  komi: number;
  boardSize: number;
  // トーナメント用リンク
  nextMatchId?: string;
  nextMatchSlot?: 1 | 2;
  isBye?: boolean; // 不戦勝
}

export interface TournamentSettings {
  boardSize: number;
  autoHandicap: boolean; // 段級位差から手合割を自動判定するか
  timeSettings?: {
    mainTimeMinutes: number;
    byoyomiSeconds: number;
    byoyomiPeriods: number;
  };
}

export interface Tournament {
  id: string;
  classroomId: string;
  name: string;
  type: TournamentType;
  status: TournamentStatus;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  currentRound: number;
  totalRounds: number;
  settings: TournamentSettings;
  winnerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoundRobinStanding {
  participant: TournamentParticipant;
  played: number;
  wins: number;
  losses: number;
  rank: number; // 順位 (1位, 2位...)
  points: number;
}
