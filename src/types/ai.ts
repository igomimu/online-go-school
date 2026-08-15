// KataGo AI analysis types

export interface AiSettings {
  maxVisits: number;       // Analysis depth (visits)
  enabled: boolean;
  allowStudentInteraction: boolean;
}

export interface AiTopMove {
  move: string;            // GTP format: "D4", "Q16", "pass"
  winrate: number;         // Black winrate (0-100%) after client normalization
  scoreLead: number;       // Black score lead after client normalization
  visits: number;
  pv: string[];            // Principal variation (GTP moves)
}

export interface AiAnalysisResult {
  winrate: number;         // Black winrate (0-100%)
  scoreLead: number;       // Black score lead
  topMoves: AiTopMove[];   // Top candidate moves
  ownership?: number[];    // Board ownership values (-1 to 1)
  analysisTime?: number;   // Server-side analysis time in seconds
}

// 先生端末で実行した解析を生徒端末へ配信するための軽量スナップショット。
// ownership は大きいため同期時には省略し、候補手とPVだけを共有する。
export interface AiAnalysisSyncPayload {
  enabled: boolean;
  nodeId: string | null;
  result: AiAnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  // 講師がマウスを置いている候補順位。生徒盤へ同じPVを表示する。
  hoveredCandidateRank: number | null;
  allowStudentInteraction: boolean;
  // 盤上に候補手を出すかどうか（AIは動かしたまま、盤の表示だけ消せる）。
  // 講師が消したら生徒の盤からも消える。未指定は表示（古い端末との互換）。
  showCandidates?: boolean;
}

export interface AiAnalysisRequest {
  moves: [string, string][];    // [["B","D4"],["W","Q16"],...]
  boardSize: number;
  komi: number;
  maxVisits: number;
  initialStones?: [string, string][];  // Handicap stones
}
