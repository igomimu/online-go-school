import type { AiAnalysisRequest, AiAnalysisResult, AiSettings } from '../types/ai';

const DEFAULT_SETTINGS: AiSettings = {
  // Pocket KataGoの1局面分析と同じ探索数
  maxVisits: 3000,
  enabled: false,
  allowStudentInteraction: false,
};

const SETTINGS_KEY = 'go-school-ai-settings';
const SETTINGS_VERSION = 2;
const ANALYSIS_TIMEOUT_MS = 20_000;

type StoredAiSettings = Partial<AiSettings> & { version?: number };

export function loadAiSettings(): AiSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredAiSettings;
      const storedVisits = typeof parsed.maxVisits === 'number' ? parsed.maxVisits : DEFAULT_SETTINGS.maxVisits;
      // v1では100/500/1000等が端末に残り、Pocket KataGoより浅いままになる。
      // 既存利用者は選択値によらず一度3000へ揃え、v2以降の本人の選択は維持する。
      const settings: AiSettings = {
        // AIのON/OFFは端末に残さない。検討・授業は毎回AIオフで始める（三村さん指定 2026-08-02）。
        // 前回ONのまま次の検討を始めると、開いた瞬間にKataGoへ解析が飛んでGPUを使ってしまう。
        enabled: DEFAULT_SETTINGS.enabled,
        maxVisits: parsed.version !== SETTINGS_VERSION ? 3000 : storedVisits,
        allowStudentInteraction: typeof parsed.allowStudentInteraction === 'boolean'
          ? parsed.allowStudentInteraction
          : DEFAULT_SETTINGS.allowStudentInteraction,
      };
      if (parsed.version !== SETTINGS_VERSION) saveAiSettings(settings);
      return settings;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveAiSettings(settings: AiSettings): void {
  // enabled は保存しない（次回の検討開始時は必ずオフ）。探索数と生徒操作許可だけ端末に残す。
  const { maxVisits, allowStudentInteraction } = settings;
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ maxVisits, allowStudentInteraction, version: SETTINGS_VERSION }),
  );
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
 * Send analysis request to KataGo API server.
 * サーバーサイドの/api/katago-analyzeプロキシ経由で呼ぶ(pokekataのサービス間API-Keyを
 * クライアントに露出させないため)。pokekataは別Supabaseプロジェクトのため
 * online-go-school側のユーザートークンでは認証できず、直接叩くと401になる。
 */
export async function analyzePosition(
  request: AiAnalysisRequest,
  signal?: AbortSignal,
): Promise<AiAnalysisResult> {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', forwardAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ANALYSIS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`/api/katago-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error('AI分析サーバーから20秒以内に応答がありませんでした');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error || `Analysis failed: ${response.status}`);
  }

  return response.json();
}
