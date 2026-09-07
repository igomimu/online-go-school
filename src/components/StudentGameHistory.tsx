import { useEffect, useState } from 'react';
import { BookOpen, FilePlus2 } from 'lucide-react';
import type { SavedGame } from '../types/game';
import type { Student } from '../types/classroom';
import { loadSavedGamesForStudent } from '../utils/savedGames';
import { getDisplayName } from '../utils/identityUtils';

interface StudentGameHistoryProps {
  studentId: string;
  studentName: string;
  students?: Student[];
  onSelectGame: (game: SavedGame) => void;
  /** 棋譜作成（SGFの読み込み・盤に入力して保存）を開く */
  onCreateRecord?: () => void;
}

export default function StudentGameHistory({
  studentId,
  studentName,
  students = [],
  onSelectGame,
  onCreateRecord,
}: StudentGameHistoryProps) {
  const [games, setGames] = useState<SavedGame[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadSavedGamesForStudent(studentName, studentId)
      .then((loaded) => {
        if (!cancelled) setGames(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setGames([]);
        }
      });

    return () => { cancelled = true; };
  }, [studentId, studentName]);

  return (
    <div className="glass-panel p-5 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-accent-text" aria-hidden="true" />
        <h3 className="heading-section">自分の棋譜履歴</h3>
        {onCreateRecord && (
          <button
            type="button"
            data-testid="open-record-create"
            onClick={onCreateRecord}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-line"
            title="自分の打った碁を入力して保存する（SGFの読み込みもここから）"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            棋譜作成
          </button>
        )}
      </div>

      {games === null ? (
        <p className="text-sm text-muted">棋譜を読み込んでいます…</p>
      ) : failed ? (
        <p className="text-sm text-alert-text">棋譜履歴を読み込めませんでした。時間をおいて開き直してください。</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">保存された棋譜はまだありません。</p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {games.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => onSelectGame(game)}
              className="block w-full rounded-lg border border-line bg-raised px-3 py-2 text-left text-sm transition-colors duration-150 hover:border-accent/50 hover:text-accent-text"
            >
              <span className="block font-medium">
                {getDisplayName(game.blackPlayer, students)} vs {getDisplayName(game.whitePlayer, students)}
                {/* 中断局も棋譜履歴の一件。生徒は並べ直せるが、再開は講師が行う（2026-08-27） */}
                {game.liveStatus === 'interrupted' && (
                  <span className="ml-2 rounded border border-line px-1 text-xs font-normal text-accent-text">
                    中断中
                  </span>
                )}
              </span>
              <span className="tabular block text-xs text-muted">
                {game.date} ・ {game.boardSize}路 ・ {game.result || '結果未入力'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
