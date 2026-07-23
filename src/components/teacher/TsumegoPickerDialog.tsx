import { useState } from 'react';
import { X, Shuffle, Send } from 'lucide-react';
import GoBoard from '../GoBoard';
import type { Problem } from '../../types/problem';
import { fetchRandomTsumegoProblem } from '../../utils/tsumegoApi';
import { tsumegoRowToProblem } from '../../utils/tsumegoConvert';

interface TsumegoPickerDialogProps {
  onAssign: (problem: Problem) => void;
  onClose: () => void;
}

const LEVEL_OPTIONS = [
  '15K', '14K', '13K', '12K', '11K', '10K', '9K', '8K', '7K', '6K', '5K', '4K', '3K', '2K', '1K',
  '1D', '2D', '3D', '4D', '5D', '6D', '7D',
];

const BOARD_SIZE_OPTIONS = [19, 13, 9];

export default function TsumegoPickerDialog({ onAssign, onClose }: TsumegoPickerDialogProps) {
  const [level, setLevel] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState(19);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Problem | null>(null);

  const drawProblem = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const row = await fetchRandomTsumegoProblem({ level: level ?? undefined, boardSize });
      if (!row) {
        setError('条件に合う詰碁が見つかりませんでした。レベルや盤サイズを変えてお試しください。');
        return;
      }
      setPreview(tsumegoRowToProblem(row));
    } catch (err) {
      setError(err instanceof Error ? err.message : '詰碁の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = () => {
    if (!preview) return;
    onAssign(preview);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="glass-panel p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">詰碁データベースから配信</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">レベル</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setLevel(null)}
              className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                level === null
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              指定なし
            </button>
            {LEVEL_OPTIONS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                  level === l
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">盤サイズ</label>
          <div className="flex gap-1.5">
            {BOARD_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => setBoardSize(size)}
                className={`px-3 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                  boardSize === size
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {size}路
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={drawProblem}
          disabled={loading}
          className="premium-button w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          <Shuffle className="w-4 h-4" />
          {loading ? '取得中...' : 'ランダムに1問取得'}
        </button>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300 font-semibold">{preview.title}</span>
              <span className="text-zinc-500">{preview.correctColor === 'BLACK' ? '黒' : '白'}先</span>
            </div>
            <div className="glass-panel flex justify-center items-center p-2">
              <GoBoard
                boardState={preview.initialBoard}
                boardSize={preview.boardSize}
                viewRange={preview.viewRange}
                maxHeight="40vh"
                readOnly
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={drawProblem}
                disabled={loading}
                className="secondary-button flex-1 flex items-center justify-center gap-2 text-sm"
              >
                <Shuffle className="w-4 h-4" /> 引き直す
              </button>
              <button
                onClick={handleAssign}
                className="premium-button flex-1 flex items-center justify-center gap-2 text-sm"
              >
                <Send className="w-4 h-4" /> この問題を配信
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
