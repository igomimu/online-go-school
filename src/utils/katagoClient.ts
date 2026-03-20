import type { AiAnalysisRequest, AiAnalysisResult, AiSettings } from '../types/ai';

const DEFAULT_SETTINGS: AiSettings = {
  serverUrl: 'http://localhost:5177',
  maxVisits: 1000,
  enabled: false,
};

const SETTINGS_KEY = 'go-school-ai-settings';

export function loadAiSettings(): AiSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Convert board coordinates (1-indexed) to GTP format
 * GTP: A1 is bottom-left, letters skip I, numbers go up
 */
export function toGtpCoord(x: number, y: number, boardSize: number): string {
  // GTP: column letters A-T (skip I), row numbers 1-19 from bottom
  const col = x >= 9 ? String.fromCharCode(64 + x + 1) : String.fromCharCode(64 + x); // Skip 'I'
  const row = boardSize - y + 1;
  return `${col}${row}`;
}

/**
 * Convert GTP coordinate to board coordinates (1-indexed)
 */
export function fromGtpCoord(gtp: string, boardSize: number): { x: number; y: number } | null {
  if (!gtp || gtp === 'pass') return null;
  const col = gtp[0].toUpperCase();
  const row = parseInt(gtp.slice(1));
  if (isNaN(row)) return null;

  let x = col.charCodeAt(0) - 64; // A=1, B=2, ...
  if (col >= 'J') x--; // Skip I

  const y = boardSize - row + 1;
  return { x, y };
}

/**
 * Convert game moves to KataGo API format
 */
export function convertMovesToKatago(
  moves: { x: number; y: number; color: 'BLACK' | 'WHITE' }[],
  boardSize: number,
): [string, string][] {
  return moves.map(m => {
    const color = m.color === 'BLACK' ? 'B' : 'W';
    if (m.x === 0 && m.y === 0) return [color, 'pass'] as [string, string];
    return [color, toGtpCoord(m.x, m.y, boardSize)] as [string, string];
  });
}

/**
 * Send analysis request to KataGo API server
 */
export async function analyzePosition(
  request: AiAnalysisRequest,
  serverUrl: string,
  signal?: AbortSignal,
): Promise<AiAnalysisResult> {
  const response = await fetch(`${serverUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error || `Analysis failed: ${response.status}`);
  }

  return response.json();
}
