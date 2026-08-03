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
  onCandidateHover?: (rank: number | null) => void;
  readOnly?: boolean;
  allowCandidateInteraction?: boolean;
}

export default function AiAnalysisPanel({
  result,
  isLoading,
  error,
  settings,
  onUpdateSettings,
  boardSize,
  onHighlightMove,
  onCandidateHover,
  readOnly = false,
  allowCandidateInteraction = false,
}: AiAnalysisPanelProps) {
  const canInteractWithCandidates = !readOnly || allowCandidateInteraction;
  return (
    <div className="glass-panel p-4 sm:p-5 space-y-4" data-testid="ai-analysis-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-kaya" />
          <h3 className="font-bold text-sm">AI分析</h3>
          {settings.enabled && isLoading && <Loader2 className="w-4 h-4 animate-spin text-kaya" aria-label="AI解析中" />}
        </div>
        <div className="flex items-center gap-2">
          {/* 生徒側にAIのON/OFF表示は出さない（操作できないものを見せない）。
              AIの入切は講師の判断で、生徒には解析結果だけが届く。 */}
          {readOnly ? null : (
            <button
              type="button"
              data-testid="ai-toggle"
              aria-pressed={settings.enabled}
              onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
              className={`px-3 py-1 text-xs font-bold rounded-md border transition-colors duration-150 ${
                settings.enabled
                  ? 'bg-kaya/15 border-kaya/40 text-kaya hover:bg-kaya/25'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
              }`}
            >
              {settings.enabled ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      </div>

      {!settings.enabled && (
        <div className="text-sm text-zinc-500">OFFです。ONにすると局面を自動解析します。</div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-shu-light bg-shu/10 px-2 py-1 rounded">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {settings.enabled && result && (
        <>
          {/* Winrate bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-zinc-300">黒 {result.winrate.toFixed(1)}%</span>
              <span className="font-semibold text-zinc-300">白 {(100 - result.winrate).toFixed(1)}%</span>
            </div>
            {/* 勝率バーは石の色そのままで読ませる。左（黒の取り分）が墨、残りが蛤の白。 */}
            <div className="h-3 bg-kinari rounded-full overflow-hidden border border-sumi-line">
              <div
                className="h-full bg-sumi transition-all duration-300"
                style={{ width: `${result.winrate}%` }}
              />
            </div>
          </div>

          {/* Score */}
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">目数差</span>
            <span className="font-mono font-bold text-base text-white">
              {result.scoreLead > 0 ? `B+${result.scoreLead.toFixed(1)}` : `W+${Math.abs(result.scoreLead).toFixed(1)}`}
            </span>
          </div>

          {/* Top moves */}
          {result.topMoves.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-400">候補手（マウスを置くと予想手順を表示）</div>
              <div className="space-y-1">
                {result.topMoves.slice(0, 5).map((move, i) => {
                  const coord = fromGtpCoord(move.move, boardSize);
                  // 盤上の候補手マーカーと同じ色。Pocket KataGo と揃えてあるので
                  // 無彩色化の対象外（1位=水色・2位=緑・3位以降=黄、GoBoard.tsx と対）。
                  const candidateColor = i === 0 ? 'bg-sky-400' : i === 1 ? 'bg-green-500' : 'bg-yellow-400';
                  return (
                    <div
                      key={i}
                      data-testid={`ai-move-${i}`}
                      className={`grid grid-cols-[1.25rem_2.75rem_1fr_1fr_auto] items-center gap-2 text-xs px-2 py-2 rounded-md transition-colors duration-150 ${
                        canInteractWithCandidates ? 'hover:bg-white/10 cursor-pointer' : 'cursor-default'
                      }`}
                      onMouseEnter={canInteractWithCandidates ? () => onCandidateHover?.(i) : undefined}
                      onMouseLeave={canInteractWithCandidates ? () => onCandidateHover?.(null) : undefined}
                      onClick={canInteractWithCandidates ? () => coord && onHighlightMove?.(coord.x, coord.y) : undefined}
                    >
                      <span className={`w-5 h-5 rounded-full ${candidateColor} text-zinc-950 font-bold flex items-center justify-center`}>{i + 1}</span>
                      <span className="font-mono font-bold text-white">{move.move}</span>
                      <span className="text-zinc-300">{move.winrate.toFixed(1)}%</span>
                      <span className="text-zinc-400">{move.scoreLead >= 0 ? '+' : ''}{move.scoreLead.toFixed(1)}目</span>
                      <span className="text-zinc-600">{move.visits}v</span>
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
      {settings.enabled && !readOnly && (
        <details className="text-xs">
          <summary className="text-zinc-600 cursor-pointer flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> 設定
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <label className="text-zinc-500">分析精度 (visits)</label>
              <select
                value={settings.maxVisits}
                onChange={e => onUpdateSettings({ maxVisits: Number(e.target.value) })}
                className="w-full bg-white/5 text-white border border-white/10 rounded px-2 py-1 text-xs"
              >
                <option value={100} className="bg-zinc-800 text-white">100 (速い)</option>
                <option value={500} className="bg-zinc-800 text-white">500</option>
                <option value={1000} className="bg-zinc-800 text-white">1000 (軽量)</option>
                <option value={2000} className="bg-zinc-800 text-white">2000</option>
                <option value={3000} className="bg-zinc-800 text-white">3000 (Pocket KataGo標準)</option>
                <option value={5000} className="bg-zinc-800 text-white">5000 (高精度)</option>
              </select>
            </div>
            <label className="flex items-start gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.allowStudentInteraction}
                onChange={e => onUpdateSettings({ allowStudentInteraction: e.target.checked })}
                className="mt-0.5 accent-kaya"
              />
              <span>
                <span className="block text-zinc-300">生徒の候補手操作を許可</span>
                <span className="block text-zinc-600 mt-0.5">OFF時は講師が示した手順だけを表示します</span>
              </span>
            </label>
          </div>
        </details>
      )}
    </div>
  );
}
