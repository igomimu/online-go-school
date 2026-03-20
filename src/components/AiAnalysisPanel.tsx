import type { AiAnalysisResult, AiSettings } from '../types/ai';
import { fromGtpCoord } from '../utils/katagoClient';
import { Brain, Loader2, AlertCircle, Settings2 } from 'lucide-react';

interface AiAnalysisPanelProps {
  result: AiAnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  settings: AiSettings;
  onUpdateSettings: (settings: Partial<AiSettings>) => void;
  boardSize: number;
  onHighlightMove?: (x: number, y: number) => void;
}

export default function AiAnalysisPanel({
  result,
  isLoading,
  error,
  settings,
  onUpdateSettings,
  boardSize,
  onHighlightMove,
}: AiAnalysisPanelProps) {
  return (
    <div className="glass-panel p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-sm">AI分析</h3>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
            className={`px-2 py-0.5 text-xs rounded ${
              settings.enabled
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-white/5 text-zinc-500'
            }`}
          >
            {settings.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {!settings.enabled && (
        <div className="text-xs text-zinc-600">AI分析を有効にするとKataGoで局面を分析します</div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {settings.enabled && result && (
        <>
          {/* Winrate bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">勝率</span>
              <span className="font-mono font-bold text-white">{result.winrate}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-zinc-700 to-zinc-400 rounded-full transition-all"
                style={{ width: `${result.winrate}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-600">
              <span>黒 {result.winrate.toFixed(1)}%</span>
              <span>白 {(100 - result.winrate).toFixed(1)}%</span>
            </div>
          </div>

          {/* Score */}
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">形勢</span>
            <span className="font-mono font-bold text-white">
              {result.scoreLead > 0 ? `B+${result.scoreLead.toFixed(1)}` : `W+${Math.abs(result.scoreLead).toFixed(1)}`}
            </span>
          </div>

          {/* Top moves */}
          {result.topMoves.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-400">候補手</div>
              <div className="space-y-0.5">
                {result.topMoves.slice(0, 5).map((move, i) => {
                  const coord = fromGtpCoord(move.move, boardSize);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs hover:bg-white/5 px-1 py-0.5 rounded cursor-pointer"
                      onClick={() => coord && onHighlightMove?.(coord.x, coord.y)}
                    >
                      <span className="w-4 text-center text-zinc-600">{i + 1}</span>
                      <span className="font-mono font-bold text-white w-8">{move.move}</span>
                      <span className="text-zinc-400">{move.winrate}%</span>
                      <span className="text-zinc-600">{move.scoreLead > 0 ? '+' : ''}{move.scoreLead}</span>
                      <span className="text-zinc-700 ml-auto">{move.visits}v</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.analysisTime !== undefined && (
            <div className="text-xs text-zinc-700 text-right">{result.analysisTime}秒</div>
          )}
        </>
      )}

      {/* Settings */}
      {settings.enabled && (
        <details className="text-xs">
          <summary className="text-zinc-600 cursor-pointer flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> 設定
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <label className="text-zinc-500">サーバーURL</label>
              <input
                type="text"
                value={settings.serverUrl}
                onChange={e => onUpdateSettings({ serverUrl: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-zinc-500">分析精度 (visits)</label>
              <select
                value={settings.maxVisits}
                onChange={e => onUpdateSettings({ maxVisits: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs"
              >
                <option value={100}>100 (速い)</option>
                <option value={500}>500</option>
                <option value={1000}>1000 (標準)</option>
                <option value={2000}>2000 (精密)</option>
                <option value={5000}>5000 (高精度)</option>
              </select>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
