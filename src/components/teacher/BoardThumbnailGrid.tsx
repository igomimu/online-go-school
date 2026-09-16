import type { GameSession } from '../../types/game';
import type { Student } from '../../types/classroom';
import { anyIdentityMatchesPlayer, studentIdentityCandidates } from '../../utils/identityUtils';
import GameThumbnail from '../GameThumbnail';
import { DEFAULT_RANK_DISPLAY, type RankDisplay } from '../../types/classroom';
import { isTimeoutResult } from '../../utils/scoring';

interface BoardThumbnailGridProps {
  games: GameSession[];
  students: Student[];
  onSelectGame: (gameId: string) => void;
  onResumeGame?: (gameId: string) => void;
  /** 棋力の見せ方（教室ごと） */
  rankDisplay?: RankDisplay;
}

interface BoardSlot {
  game: GameSession;
  /** この盤に映っている生徒の識別子（テストと自動操作の目印に使う） */
  studentIdentities: string[];
}

/**
 * 進行中の対局を「1局につき1枠」で並べる。
 *
 * 以前は生徒ひとりに1枠を割り当てていたため、生徒同士の対局は同じ盤が2枠に出ていた。
 * 講師が見たいのは局ごとの進行なので、盤は1つでよい（2026-09-16 三村さん）。
 * 並び順は名簿順のまま＝授業中に枠の位置が入れ替わらない。
 * 誰が在室しているかは右の生徒一覧の「接続」列で見る。
 */
function buildSlots(games: GameSession[], students: Student[]): BoardSlot[] {
  const slots: BoardSlot[] = [];
  const slotIndexByGameId = new Map<string, number>();

  for (const student of students) {
    const candidates = studentIdentityCandidates(student);
    const matchesStudent = (game: GameSession) =>
      anyIdentityMatchesPlayer(candidates, game.blackPlayer)
      || anyIdentityMatchesPlayer(candidates, game.whitePlayer);

    // 中断局は履歴で扱い、中央の「進行中の碁盤」には残さない。
    // 時間切れだけは授業中にすぐ再開できるよう従来どおり表示する。
    const game = games.find(g =>
      matchesStudent(g) && (g.status === 'playing' || g.status === 'scoring')
    ) ?? games.find(g =>
      matchesStudent(g) && g.status === 'finished' && isTimeoutResult(g.result)
    );
    if (!game) continue;

    const existing = slotIndexByGameId.get(game.id);
    if (existing !== undefined) {
      slots[existing].studentIdentities.push(...candidates);
      continue;
    }
    slotIndexByGameId.set(game.id, slots.length);
    slots.push({ game, studentIdentities: [...candidates] });
  }

  return slots;
}

export default function BoardThumbnailGrid({
  games,
  students,
  onSelectGame,
  onResumeGame,
  rankDisplay = DEFAULT_RANK_DISPLAY,
}: BoardThumbnailGridProps) {
  const slots = buildSlots(games, students);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 8,
        padding: 8,
        background: 'var(--color-raised)',
      }}
    >
      {slots.map(({ game, studentIdentities }) => (
        // 行の途中で切れた状態でスクロールが止まらないよう、各盤の上端に吸着させる
        <div
          key={game.id}
          data-testid={`open-board-${game.id}`}
          data-board-students={studentIdentities.join(' ')}
          onClick={() => onSelectGame(game.id)}
          style={{ scrollSnapAlign: 'start', cursor: 'pointer' }}
        >
          <GameThumbnail
            game={game}
            onClick={() => onSelectGame(game.id)}
            students={students}
            rankDisplay={rankDisplay}
            onResume={onResumeGame}
            allowTimeoutResume
          />
        </div>
      ))}

      {students.length === 0 && (
        <div style={{ gridColumn: 'span 5', textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
          教室を選択してください
        </div>
      )}

      {students.length > 0 && slots.length === 0 && (
        <div style={{ gridColumn: 'span 5', textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
          進行中の対局はありません
        </div>
      )}
    </div>
  );
}
