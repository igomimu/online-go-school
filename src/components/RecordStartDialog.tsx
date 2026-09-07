import { useEffect, useRef, useState } from 'react';
import { X, FileUp, Grid3x3, RotateCcw } from 'lucide-react';
import type { RecordDraft } from '../utils/recordDraft';

interface RecordStartDialogProps {
  /** 空の盤から並べ始める */
  onStartEmpty: (boardSize: number) => void;
  /** SGFファイルを読んでから直す */
  onOpenSgf: (sgf: string) => void;
  /** 前回並べかけの下書き（授業に切り替わって中断したもの） */
  draft?: RecordDraft | null;
  onResumeDraft?: () => void;
  onDiscardDraft?: () => void;
  onClose: () => void;
}

const BOARD_SIZES = [19, 13, 9] as const;

/**
 * 「棋譜作成」の入口（2026-09-07 三村さん）。
 *
 * 空の盤に入力しても、SGFを読んでから直しても、行き先は同じ棋譜作成の盤。
 * 入口を1つにしておきたい、という三村さんの指示に沿って、選ぶのはここだけにする。
 */
export default function RecordStartDialog({
  onStartEmpty,
  onOpenSgf,
  draft = null,
  onResumeDraft,
  onDiscardDraft,
  onClose,
}: RecordStartDialogProps) {
  const [boardSize, setBoardSize] = useState<number>(19);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setError('ファイルを読めませんでした。もう一度選んでください。');
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) onOpenSgf(content);
      else setError('中身が空のファイルでした。');
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="record-start-dialog"
    >
      <div
        className="glass-panel w-full max-w-md space-y-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="heading-section">棋譜作成</h2>
          <button type="button" aria-label="閉じる" onClick={onClose} className="text-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted">
          自分の打った碁を盤に入力して保存します。作った棋譜は棋譜履歴に残り、検討で開けます。
        </p>

        {draft && onResumeDraft && (
          <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/10 p-3">
            <p className="text-sm text-ink">前回、途中まで入力した棋譜があります。</p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="record-resume-draft"
                onClick={onResumeDraft}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ground"
              >
                <RotateCcw className="h-4 w-4" /> 続きから入力する
              </button>
              {onDiscardDraft && (
                <button
                  type="button"
                  data-testid="record-discard-draft"
                  onClick={onDiscardDraft}
                  className="rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-ink"
                >
                  捨てる
                </button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Grid3x3 className="h-4 w-4" /> 空の盤に入力する
          </div>
          <div className="flex gap-2">
            {BOARD_SIZES.map(size => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={boardSize === size}
                data-testid={`record-size-${size}`}
                onClick={() => setBoardSize(size)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors duration-150 ${
                  boardSize === size
                    ? 'border-accent bg-accent/15 font-semibold text-accent-text'
                    : 'border-line bg-raised text-ink hover:bg-line'
                }`}
              >
                {size}路
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="record-start-empty"
            onClick={() => onStartEmpty(boardSize)}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ground"
          >
            この盤で始める
          </button>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <FileUp className="h-4 w-4" /> SGFファイルから読む
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sgf"
            onChange={handleFile}
            className="hidden"
            data-testid="record-sgf-input"
          />
          <button
            type="button"
            data-testid="record-open-sgf"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-md border border-line bg-raised px-3 py-2 text-sm text-ink hover:bg-line"
          >
            SGFファイルを選ぶ
          </button>
          <p className="text-xs text-muted">
            幽玄の間・野狐などで打った碁のSGFを読み込めます。読んだあと盤で直してから保存できます。
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-alert/25 bg-alert/10 px-3 py-2 text-sm text-alert-text">{error}</p>
        )}
      </div>
    </div>
  );
}
