import type { GameSession } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';
import { makeStudentIdentity } from '../../utils/identityUtils';
import GameThumbnail from '../GameThumbnail';

interface BoardThumbnailGridProps {
  games: GameSession[];
  students: Student[];
  participants: ParticipantInfo[];
  onSelectGame: (gameId: string) => void;
}

// IGC風の空碁盤スロット
function EmptyBoardSlot({ isConnected }: { isConnected: boolean }) {
  const size = 19;
  const cellSize = 8;
  const totalSize = size * cellSize;

  return (
    <div style={{ opacity: isConnected ? 1 : 0.5 }}>
      <svg width="100%" viewBox={`0 0 ${totalSize} ${totalSize}`} style={{ border: '1px solid #999', display: 'block' }}>
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
}: BoardThumbnailGridProps) {
  const connectedIdentities = new Set(participants.map(p => p.identity));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 8,
        padding: 8,
        background: '#d0d0c8',
      }}
    >
      {students.map(student => {
        const studentIdentity = makeStudentIdentity(student.id);
        const isConnected = connectedIdentities.has(studentIdentity) || connectedIdentities.has(student.name);
        const game = games.find(g =>
          g.blackPlayer === studentIdentity || g.whitePlayer === studentIdentity ||
          g.blackPlayer === student.name || g.whitePlayer === student.name
        );

        // IGC風ラベル: 名前(Rxx)
        const label = `${student.name}(${student.internalRating || student.rank || '?'})`;

        return (
          <div key={student.id}>
            {/* ラベル */}
            <div
              style={{
                fontSize: 12,
                fontFamily: 'MS Gothic, monospace',
                fontWeight: 'bold',
                color: '#333',
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
              <div onClick={() => onSelectGame(game.id)} style={{ cursor: 'pointer' }}>
                <GameThumbnail game={game} onClick={() => onSelectGame(game.id)} />
              </div>
            ) : (
              <EmptyBoardSlot isConnected={isConnected} />
            )}
          </div>
        );
      })}

      {students.length === 0 && (
        <div style={{ gridColumn: 'span 5', textAlign: 'center', padding: 32, color: '#666' }}>
          教室を選択してください
        </div>
      )}
    </div>
  );
}
