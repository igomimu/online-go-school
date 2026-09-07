import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Student } from '../types/classroom';
import { makeStudentIdentity } from '../utils/identityUtils';
import { todaySgfDate } from '../utils/sgfExport';

export interface RecordSaveValues {
  date: string;
  blackPlayer: string;
  whitePlayer: string;
  result: string;
  komi: number;
  handicap: number;
}

interface RecordSaveDialogProps {
  role: 'TEACHER' | 'STUDENT';
  /** 名簿。先生が対局者を選ぶために使う */
  students?: Student[];
  /** 生徒自身の identity（sid:1010）。この値で保存すると自分の棋譜履歴に並ぶ */
  myIdentity?: string;
  myName?: string;
  boardSize: number;
  /** SGFを読んだときの初期値（PB/PW/DT/RE/KM/HA） */
  initial?: Partial<RecordSaveValues>;
  saving?: boolean;
  error?: string | null;
  onSave: (values: RecordSaveValues) => void;
  onClose: () => void;
}

const HANDICAP_OPTIONS = [0, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const OTHER = '__other__';

const fieldClass = 'w-full rounded-md border border-field-line bg-ink/5 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none';

/**
 * 並べた棋譜・読み込んだ棋譜を「誰の碁か」まで決めて保存する窓（2026-09-07 三村さん）。
 *
 * 生徒は自分の色を選ぶだけにする。自分側は identity で保存しないと
 * 「自分の棋譜履歴」（loadSavedGamesForStudent）に出てこないので、ここは選ばせない。
 */
export default function RecordSaveDialog({
  role,
  students = [],
  myIdentity = '',
  myName = '',
  boardSize,
  initial,
  saving = false,
  error = null,
  onSave,
  onClose,
}: RecordSaveDialogProps) {
  const [date, setDate] = useState(initial?.date || todaySgfDate());
  const [result, setResult] = useState(initial?.result ?? '');
  const [komi, setKomi] = useState(String(initial?.komi ?? 6.5));
  const [handicap, setHandicap] = useState(initial?.handicap ?? 0);

  // 生徒用
  const [myColor, setMyColor] = useState<'BLACK' | 'WHITE'>('BLACK');
  const [opponentName, setOpponentName] = useState(initial?.whitePlayer ?? '');

  // 先生用
  const rosterOptions = useMemo(
    () => students.map(s => ({ value: makeStudentIdentity(s.id), label: s.name })),
    [students],
  );
  const [blackChoice, setBlackChoice] = useState(OTHER);
  const [whiteChoice, setWhiteChoice] = useState(OTHER);
  const [blackText, setBlackText] = useState(initial?.blackPlayer ?? '');
  const [whiteText, setWhiteText] = useState(initial?.whitePlayer ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const blackPlayer = role === 'STUDENT'
    ? (myColor === 'BLACK' ? myIdentity : opponentName.trim())
    : (blackChoice === OTHER ? blackText.trim() : blackChoice);
  const whitePlayer = role === 'STUDENT'
    ? (myColor === 'WHITE' ? myIdentity : opponentName.trim())
    : (whiteChoice === OTHER ? whiteText.trim() : whiteChoice);

  const komiValue = Number(komi);
  const canSave = !saving && !!blackPlayer && !!whitePlayer && !!date && Number.isFinite(komiValue);

  const submit = () => {
    if (!canSave) return;
    onSave({ date, blackPlayer, whitePlayer, result: result.trim(), komi: komiValue, handicap });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="record-save-dialog"
    >
      <div
        className="glass-panel max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="heading-section">棋譜を保存する</h2>
          <button type="button" aria-label="閉じる" onClick={onClose} className="text-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        {role === 'STUDENT' ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-sm text-muted">自分の色</span>
              <div className="flex gap-2">
                {(['BLACK', 'WHITE'] as const).map(color => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={myColor === color}
                    data-testid={`record-my-color-${color}`}
                    onClick={() => setMyColor(color)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors duration-150 ${
                      myColor === color
                        ? 'border-accent bg-accent/15 font-semibold text-accent-text'
                        : 'border-line bg-raised text-ink hover:bg-line'
                    }`}
                  >
                    {color === 'BLACK' ? '黒番' : '白番'}（{myName || 'じぶん'}）
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-muted">相手の名前</span>
              <input
                data-testid="record-opponent-name"
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                placeholder="例: たろう / 幽玄の間の相手"
                className={fieldClass}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            {([
              { label: '黒番', choice: blackChoice, setChoice: setBlackChoice, text: blackText, setText: setBlackText, key: 'black' },
              { label: '白番', choice: whiteChoice, setChoice: setWhiteChoice, text: whiteText, setText: setWhiteText, key: 'white' },
            ] as const).map(field => (
              <div key={field.key} className="space-y-1">
                <span className="text-sm text-muted">{field.label}</span>
                <select
                  data-testid={`record-${field.key}-select`}
                  value={field.choice}
                  onChange={(e) => field.setChoice(e.target.value)}
                  className={fieldClass}
                >
                  <option value={OTHER}>名簿以外（名前を入力）</option>
                  {rosterOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {field.choice === OTHER && (
                  <input
                    data-testid={`record-${field.key}-name`}
                    value={field.text}
                    onChange={(e) => field.setText(e.target.value)}
                    placeholder="対局者の名前"
                    className={fieldClass}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm text-muted">対局日</span>
            <input
              data-testid="record-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="2026-09-07"
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-muted">コミ</span>
            <input
              data-testid="record-komi"
              inputMode="decimal"
              value={komi}
              onChange={(e) => setKomi(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-muted">置石</span>
            <select
              data-testid="record-handicap"
              value={handicap}
              onChange={(e) => setHandicap(Number(e.target.value))}
              className={fieldClass}
            >
              {HANDICAP_OPTIONS.map(h => (
                <option key={h} value={h}>{h === 0 ? '互先' : `${h}子`}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-muted">結果（空でも可）</span>
            <input
              data-testid="record-result"
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="例: 黒中押し勝ち"
              className={fieldClass}
            />
          </label>
        </div>

        <p className="text-xs text-muted">{boardSize}路盤として保存します。</p>

        {error && (
          <p className="rounded-lg border border-alert/25 bg-alert/10 px-3 py-2 text-sm text-alert-text" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-ink"
          >
            やめる
          </button>
          <button
            type="button"
            data-testid="record-save-submit"
            onClick={submit}
            disabled={!canSave}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
