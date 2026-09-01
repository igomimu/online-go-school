import type { GameSession } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomRtc';
import type { Student } from '../../types/classroom';
import { anyIdentityMatchesPlayer, studentIdentityCandidates } from '../../utils/identityUtils';
import GameThumbnail from '../GameThumbnail';
import { displayRank, DEFAULT_RANK_DISPLAY, type RankDisplay } from '../../types/classroom';
import { isTimeoutResult } from '../../utils/scoring';

interface BoardThumbnailGridProps {
  games: GameSession[];
  students: Student[];
  participants: ParticipantInfo[];
  onSelectGame: (gameId: string) => void;
  onResumeGame?: (gameId: string) => void;
  /** 棋力の見せ方（教室ごと） */
  rankDisplay?: RankDisplay;
}

// IGC風の空碁盤スロット
function EmptyBoardSlot({ isConnected }: { isConnected: boolean }) {
  const size = 19;
  const cellSize = 8;
  const totalSize = size * cellSize;

  return (
    <div style={{ opacity: isConnected ? 1 : 0.5 }}>
      <svg width="100%" viewBox={`0 0 ${totalSize} ${totalSize}`} style={{ border: '1px solid var(--color-line)', display: 'block' }}>
        <rect width={totalSize} height={totalSize} fill="#DCB35C" />
        {Array.from({ length: size }).map((_, i) => (
          <g key={i}>
            <line
              x1={cellSize / 2} y1={i * cellSize + cellSize / 2}
              x2={totalSize - cellSize / 2} y2={i * cellSize + cellSize / 2}
              stroke="#b08020" strokeWidth={0.5}
            />
            <line
              x1={i * cellSize + cellSize / 2} y1={cellSize / 2}
              x2={i * cellSize + cellSize / 2} y2={totalSize - cellSize / 2}
              stroke="#b08020" strokeWidth={0.5}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function BoardThumbnailGrid({
  games,
  students,
  participants,
  onSelectGame,
  onResumeGame,
  rankDisplay = DEFAULT_RANK_DISPLAY,
}: BoardThumbnailGridProps) {
  const connectedIdentities = new Set(participants.map(p => p.identity));

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
      {students.map(student => {
        const candidates = studentIdentityCandidates(student);
        const isConnected = candidates.some(identity => connectedIdentities.has(identity));
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

        // IGC風ラベル: 名前(Rxx)
        const label = `${student.name}(${displayRank(student, rankDisplay) || '?'})`;

        return (
          // 行の途中で切れた状態でスクロールが止まらないよう、各盤の上端に吸着させる
          <div key={student.id} data-testid={`board-slot-${student.id}`} style={{ scrollSnapAlign: 'start' }}>
            {/* ラベル */}
            <div
              style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: 'var(--color-ink)',
                marginBottom: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {label}
            </div>

            {/* 碁盤 */}
            {game ? (
              <div data-testid={`open-board-${student.id}`} onClick={() => onSelectGame(game.id)} style={{ cursor: 'pointer' }}>
                <GameThumbnail game={game} onClick={() => onSelectGame(game.id)} students={students} onResume={onResumeGame} allowTimeoutResume />
              </div>
            ) : (
              <EmptyBoardSlot isConnected={isConnected} />
            )}
          </div>
        );
      })}

      {students.length === 0 && (
        <div style={{ gridColumn: 'span 5', textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
          教室を選択してください
        </div>
      )}
    </div>
  );
}
