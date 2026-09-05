import { useCallback, useEffect, useRef, useState } from 'react';
import { X, FileUp, BookOpen, Puzzle } from 'lucide-react';
import type { Student } from '../types/classroom';
import type { SavedGame } from '../types/game';
import type { Problem } from '../types/problem';
import { loadSavedGamesForStudent } from '../utils/savedGames';
import TsumegoPickerDialog from './teacher/TsumegoPickerDialog';

interface ReviewOpenDialogProps {
  students: Student[];
  onOpenSgfText: (sgf: string) => void;
  onOpenSavedGame: (game: SavedGame) => void;
  onOpenProblem: (problem: Problem) => void;
  onClose: () => void;
}

/**
 * 検討盤から棋譜を開くための窓（2026-09-06 三村さん「共有検討画面に、棋譜を開くボタンを」）。
 *
 * これまで棋譜を開く入口は教室ホームにしかなく、検討の途中で別の棋譜へ移るには
 * 一度ホームへ戻る必要があった。検討盤は別ウィンドウなので、この窓も検討盤の中に出す
 * （ホーム側に出すと、前面の検討ウィンドウの裏に隠れて見えない）。
 */
export default function ReviewOpenDialog({
  students,
  onOpenSgfText,
  onOpenSavedGame,
  onOpenProblem,
  onClose,
}: ReviewOpenDialogProps) {
  const [studentId, setStudentId] = useState<string>('');
  const [games, setGames] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTsumego, setShowTsumego] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGames = useCallback(async (student: Student) => {
    setLoading(true);
    setError(null);
    setGames([]);
    try {
      setGames(await loadSavedGamesForStudent(student.name, student.id));
    } catch (e) {
      setError(`棋譜を読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Esc で閉じる。検討盤は別ウィンドウなので、この窓が属する document で拾う
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const doc = fileInputRef.current?.ownerDocument ?? document;
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) { onOpenSgfText(content); onClose(); }
    };
    reader.readAsText(file);
  };

  if (showTsumego) {
    return (
      <TsumegoPickerDialog
        onAssign={(problem) => { onOpenProblem(problem); onClose(); }}
        onClose={() => setShowTsumego(false)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="review-open-dialog"
    >
      <div
        className="glass-panel p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="heading-section">棋譜を開く</h2>
          <button type="button" aria-label="閉じる" onClick={onClose} className="text-muted hover:text-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 生徒の対局棋譜 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted">
            <BookOpen className="w-4 h-4" /> 生徒の対局
          </div>
          <select
            data-testid="review-open-student"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              const student = students.find(s => s.id === e.target.value);
              if (student) void loadGames(student);
              else setGames([]);
            }}
            className="w-full rounded-md border border-line bg-raised px-3 py-2 text-sm"
          >
            <option value="">生徒を選んでください</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.rank ? `（${s.rank}）` : ''}</option>
            ))}
          </select>

          {loading && <p className="text-sm text-muted">読み込み中…</p>}
          {error && (
            <p className="text-sm text-alert-text bg-alert/10 border border-alert/25 rounded-lg px-3 py-2">{error}</p>
          )}
          {!loading && !error && studentId && games.length === 0 && (
            <p className="text-sm text-muted">この生徒の棋譜はまだありません。</p>
          )}
          {games.length > 0 && (
            <ul className="divide-y divide-line border border-line rounded-lg max-h-64 overflow-y-auto">
              {games.map(game => (
                <li key={game.id}>
                  <button
                    type="button"
                    data-testid={`review-open-game-${game.id}`}
                    onClick={() => { onOpenSavedGame(game); onClose(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-raised transition-colors duration-150"
                  >
                    <span className="text-muted tabular-nums">{game.date}</span>
                    <span className="mx-2">黒 {game.blackPlayer} / 白 {game.whitePlayer}</span>
                    {game.result && <span className="text-muted">{game.result}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* SGF・詰碁 */}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <input ref={fileInputRef} type="file" accept=".sgf" onChange={handleFile} className="hidden" />
          <button
            type="button"
            data-testid="review-open-sgf"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-2 text-sm text-ink hover:bg-line transition-colors duration-150"
          >
            <FileUp className="w-4 h-4" /> SGFファイルを読む
          </button>
          <button
            type="button"
            data-testid="review-open-tsumego"
            onClick={() => setShowTsumego(true)}
            className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-2 text-sm text-ink hover:bg-line transition-colors duration-150"
          >
            <Puzzle className="w-4 h-4" /> 詰碁DBから選ぶ
          </button>
        </div>
      </div>
    </div>
  );
}
