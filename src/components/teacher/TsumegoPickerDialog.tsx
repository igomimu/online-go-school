import { useState } from 'react';
import { X, Shuffle, Send, Trophy, Sparkles } from 'lucide-react';
import GoBoard from '../GoBoard';
import type { Problem } from '../../types/problem';
import { fetchRandomTsumegoProblem } from '../../utils/tsumegoApi';
import { tsumegoRowToProblem } from '../../utils/tsumegoConvert';
import { createEmptyBoard } from '../../utils/gameLogic';

/** 出題先の候補（接続中の生徒） */
export interface TsumegoRecipient {
  identity: string;
  name: string;
  /** 対局中。外し忘れを防ぐために札を出すだけで、既定で外しはしない */
  playing?: boolean;
}

interface TsumegoPickerDialogProps {
  /** targets: 出題先の identity（null=全員） */
  onAssign: (problem: Problem, targets: string[] | null) => void;
  onClose: () => void;
  /**
   * 渡したときだけ出題先を選ばせる（講師ホームの「詰碁出題」）。
   * 検討盤で開くときは配る相手を検討の参加者が決めるので渡さない。
   */
  recipients?: TsumegoRecipient[];
}

const LEVEL_OPTIONS = [
  '15K', '14K', '13K', '12K', '11K', '10K', '9K', '8K', '7K', '6K', '5K', '4K', '3K', '2K', '1K',
  '1D', '2D', '3D', '4D', '5D', '6D', '7D',
];

const BOARD_SIZE_OPTIONS = [19, 13, 9];

/** ライフ＝まちがえてよい回数。0になるとその問題は終わり（三村さん 2026-09-19） */
const LIFE_OPTIONS = [1, 2, 3, 4, 5];
const DEFAULT_LIVES = 3;

/** 1問ごとの制限時間（分）。null=なし */
const TIME_LIMIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function TsumegoPickerDialog({ onAssign, onClose, recipients }: TsumegoPickerDialogProps) {
  // 出題形式: 格付け出題（生徒各自の実力連動）or 指定の1問
  const [deliveryMode, setDeliveryMode] = useState<'rating' | 'specific'>('specific');
  const [level, setLevel] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState(19);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Problem | null>(null);
  // 既定は全員。対局中の生徒など、出さない生徒だけを外す（三村さん 2026-09-19）
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [lives, setLives] = useState(DEFAULT_LIVES);
  const [timeLimitMin, setTimeLimitMin] = useState<number | null>(null);

  const selectedRecipients = recipients?.filter(r => !excluded.has(r.identity)) ?? [];
  const noneSelected = !!recipients && selectedRecipients.length === 0;

  const toggleRecipient = (identity: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  };

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
    if (noneSelected) return;
    const targets = recipients && excluded.size > 0
      ? selectedRecipients.map(r => r.identity)
      : null;

    if (deliveryMode === 'rating') {
      // 格付け連動モード出題
      const ratingProblem: Problem = {
        id: `rating-${Date.now()}`,
        title: '詰碁 格付けチャレンジ',
        boardSize: 19,
        initialBoard: createEmptyBoard(19),
        correctColor: 'BLACK',
        sgfTree: { children: [] },
        createdAt: new Date().toISOString(),
        lives,
        ...(timeLimitMin ? { timeLimitSec: timeLimitMin * 60 } : {}),
        ratingMode: true,
      };
      onAssign(ratingProblem, targets);
      onClose();
      return;
    }

    if (!preview) return;
    // 誰も外していなければ「全員」。後から入った生徒にも出題が届く
    onAssign(
      recipients
        ? { ...preview, lives, ...(timeLimitMin ? { timeLimitSec: timeLimitMin * 60 } : {}) }
        : preview,
      targets,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="glass-panel p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{recipients ? '詰碁出題' : '詰碁データベースから配信'}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 出題形式の切り替え（講師ホームから配る場合のみ格付け連動を選べる） */}
        {recipients && (
          <div className="flex rounded-lg p-1 bg-ink/5 border border-line">
            <button
              type="button"
              data-testid="delivery-mode-rating"
              onClick={() => setDeliveryMode('rating')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all ${
                deliveryMode === 'rating'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Trophy className="w-4 h-4 fill-current" />
              格付け連動出題（生徒各自の実力に合わせる）
            </button>
            <button
              type="button"
              data-testid="delivery-mode-specific"
              onClick={() => setDeliveryMode('specific')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all ${
                deliveryMode === 'specific'
                  ? 'bg-accent border-accent text-accent-ink shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              指定した1問を出題
            </button>
          </div>
        )}

        {/* 格付けモードの説明 */}
        {deliveryMode === 'rating' && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300 text-sm">
              <Trophy className="w-4 h-4 fill-amber-500 text-amber-500" />
              生徒各自の格付けに合わせた問題が届きます
            </div>
            <p className="text-muted-foreground leading-relaxed">
              接続中の生徒それぞれに、現在保持している格（石ころ棋士〜伝説の棋士）に応じた問題が自動で出題されます。
              正解・不正解で各生徒の格付けゲージが増減し、昇格・降格します。
            </p>
          </div>
        )}

        {deliveryMode === 'specific' && (
          <>
            <div>
              <label className="block text-sm text-muted mb-1.5">レベル</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setLevel(null)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                    level === null
                      ? 'bg-accent border-accent text-accent-ink'
                      : 'bg-ink/5 border-line text-muted hover:text-ink'
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
                        ? 'bg-accent border-accent text-accent-ink'
                        : 'bg-ink/5 border-line text-muted hover:text-ink'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted mb-1.5">盤サイズ</label>
              <div className="flex gap-1.5">
                {BOARD_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    onClick={() => setBoardSize(size)}
                    className={`px-3 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                      boardSize === size
                        ? 'bg-accent border-accent text-accent-ink'
                        : 'bg-ink/5 border-line text-muted hover:text-ink'
                    }`}
                  >
                    {size}路
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {recipients && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="block text-sm text-muted">
                出題する生徒（{selectedRecipients.length}/{recipients.length}名）
              </label>
              {excluded.size > 0 && (
                <button
                  onClick={() => setExcluded(new Set())}
                  className="text-xs text-muted hover:text-ink underline"
                >
                  全員に戻す
                </button>
              )}
            </div>
            {recipients.length === 0 ? (
              <div className="text-sm text-muted">接続中の生徒がいません</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map(r => {
                  const on = !excluded.has(r.identity);
                  return (
                    <button
                      key={r.identity}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      data-testid={`tsumego-recipient-${r.identity}`}
                      onClick={() => toggleRecipient(r.identity)}
                      title={on ? '出題する（押すと外す）' : '出題しない（押すと戻す）'}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                        on
                          ? 'bg-accent border-accent text-accent-ink'
                          : 'bg-ink/5 border-line text-muted line-through'
                      }`}
                    >
                      {r.name}
                      {r.playing && <span className="font-normal no-underline opacity-80">・対局中</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {recipients && (
          <div>
            <label className="block text-sm text-muted mb-1.5">ライフ（まちがえてよい回数）</label>
            <div className="flex gap-1.5">
              {LIFE_OPTIONS.map((n) => (
                <button
                  key={n}
                  data-testid={`tsumego-lives-${n}`}
                  onClick={() => setLives(n)}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                    lives === n
                      ? 'bg-accent border-accent text-accent-ink'
                      : 'bg-ink/5 border-line text-muted hover:text-ink'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {recipients && (
          <div>
            <label className="block text-sm text-muted mb-1.5">制限時間（1問ごと）</label>
            <div className="flex flex-wrap gap-1.5">
              {[null, ...TIME_LIMIT_OPTIONS].map((m) => (
                <button
                  key={m ?? 'none'}
                  data-testid={`tsumego-time-${m ?? 'none'}`}
                  onClick={() => setTimeLimitMin(m)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors duration-150 ${
                    timeLimitMin === m
                      ? 'bg-accent border-accent text-accent-ink'
                      : 'bg-ink/5 border-line text-muted hover:text-ink'
                  }`}
                >
                  {m === null ? 'なし' : `${m}分`}
                </button>
              ))}
            </div>
          </div>
        )}

        {deliveryMode === 'rating' ? (
          <div className="pt-2">
            <button
              onClick={handleAssign}
              disabled={noneSelected}
              className="premium-button w-full flex items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-50"
              data-testid="assign-rating-problems-btn"
            >
              <Trophy className="w-4 h-4 fill-current text-amber-500" />
              {recipients ? `格付け詰碁を一斉配信（${selectedRecipients.length}名）` : '格付け詰碁を配信'}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={drawProblem}
              disabled={loading}
              className="premium-button w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <Shuffle className="w-4 h-4" />
              {loading ? '取得中...' : 'ランダムに1問取得'}
            </button>

            {error && (
              <div className="text-sm text-alert-text bg-alert/10 border border-alert/25 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {preview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink font-semibold">{preview.title}</span>
                  <span className="text-muted">{preview.correctColor === 'BLACK' ? '黒' : '白'}先</span>
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
                    disabled={noneSelected}
                    className="premium-button flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {recipients ? `この問題を出題（${selectedRecipients.length}名）` : 'この問題を配信'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
