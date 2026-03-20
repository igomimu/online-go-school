// KataGo AI analysis types

export interface AiSettings {
  serverUrl: string;       // KataGo API server URL
  maxVisits: number;       // Analysis depth (visits)
  enabled: boolean;
}

export interface AiTopMove {
  move: string;            // GTP format: "D4", "Q16", "pass"
  winrate: number;         // 0-100%
  scoreLead: number;       // Score lead from current player's perspective
  visits: number;
  pv: string[];            // Principal variation (GTP moves)
}

export interface AiAnalysisResult {
  winrate: number;         // Current position winrate (0-100%)
  scoreLead: number;       // Score lead
  topMoves: AiTopMove[];   // Top candidate moves
  ownership?: number[];    // Board ownership values (-1 to 1)
  analysisTime?: number;   // Server-side analysis time in seconds
}

export interface AiAnalysisRequest {
  moves: [string, string][];    // [["B","D4"],["W","Q16"],...]
  boardSize: number;
  komi: number;
  maxVisits: number;
  initialStones?: [string, string][];  // Handicap stones
}
