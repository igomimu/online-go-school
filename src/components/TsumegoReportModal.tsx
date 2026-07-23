import { useState } from 'react';
import { X } from 'lucide-react';
import { reportTsumegoProblem } from '../utils/tsumegoApi';

interface TsumegoReportModalProps {
  problemId: string;
  sourceId?: number;
  onClose: () => void;
}

export default function TsumegoReportModal({ problemId, sourceId, onClose }: TsumegoReportModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (sourceId === undefined) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportTsumegoProblem({ problemId, sourceId, reason });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="glass-panel p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold">この問題を報告</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        {sourceId !== undefined && (
          <p className="text-xs text-zinc-500 mb-3">問題 #{sourceId}</p>
        )}

        {done ? (
          <div className="text-center py-4">
            <p className="text-zinc-300">報告を受け付けました。</p>
            <p className="text-xs text-zinc-500 mt-1">確認して修正します。</p>
            <button onClick={onClose} className="premium-button w-full mt-4 text-sm">
              とじる
            </button>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">気になった点（任意）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 正解手順が成立しない／表示範囲がおかしい"
              rows={3}
              maxLength={500}
              className="w-full resize-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} disabled={submitting} className="secondary-button flex-1 text-sm">
                キャンセル
              </button>
              <button onClick={submit} disabled={submitting} className="premium-button flex-1 text-sm">
                {submitting ? '送信中...' : '報告する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
