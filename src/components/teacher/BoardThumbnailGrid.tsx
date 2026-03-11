import type { GameSession } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';
import GameThumbnail from '../GameThumbnail';

interface BoardThumbnailGridProps {
  games: GameSession[];
  students: Student[];
  participants: ParticipantInfo[];
  onSelectGame: (gameId: string) => void;
}

// 生徒スロット（対局なし時）
function EmptyBoardSlot({ student, isConnected }: { student: Student; isConnected: boolean }) {
  const size = 19;
  const cellSize = 8;
  const totalSize = size * cellSize;

  return (
    <div className={`glass-panel p-2 ${isConnected ? '' : 'opacity-40'}`}>
      <svg width={totalSize} height={totalSize} viewBox={`0 0 ${totalSize} ${totalSize}`}>
        <rect width={totalSize} height={totalSize} fill="#DCB35C" opacity={0.5} />
        {Array.from({ length: size }).map((_, i) => (
          <g key={i}>
            <line
              x1={cellSize / 2} y1={i * cellSize + cellSize / 2}
              x2={totalSize - cellSize / 2} y2={i * cellSize + cellSize / 2}
              stroke="black" strokeWidth={0.3} opacity={0.3}
            />
            <line
              x1={i * cellSize + cellSize / 2} y1={cellSize / 2}
              x2={i * cellSize + cellSize / 2} y2={totalSize - cellSize / 2}
              stroke="black" strokeWidth={0.3} opacity={0.3}
            />
          </g>
        ))}
      </svg>
      <div className="mt-1 space-y-0.5">
        <div className="text-xs font-medium truncate">
          {student.name}
          {student.internalRating && (
            <span className="text-amber-400 ml-1">({student.internalRating})</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
          {student.rank && <span className="px-1 rounded bg-amber-500/15 text-amber-400">{student.rank}</span>}
          {student.type && <span>{student.type}</span>}
          {student.grade && <span>{student.grade}</span>}
        </div>
        {student.country && (
          <div className="text-[10px] text-zinc-600 truncate">{student.country}</div>
        )}
      </div>
    </div>
  );
}

export default function BoardThumbnailGrid({
  games,
  students,
  participants,
  onSelectGame,
}: BoardThumbnailGridProps) {
  // 生徒スロット中心: 登録生徒ごとに碁盤枠を表示
  const connectedIdentities = new Set(participants.map(p => p.identity));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
      {students.map(student => {
        const isConnected = connectedIdentities.has(student.name);
        // この生徒が参加している対局を探す
        const game = games.find(g =>
          g.blackPlayer === student.name || g.whitePlayer === student.name
        );

        // IGC風ラベル: 「名前(Rxx)」
        const label = `${student.name}${student.internalRating ? `(${student.internalRating})` : ''}`;

        if (game) {
          return (
            <div key={student.id}>
              <div className="text-xs text-zinc-300 mb-0.5 truncate font-medium">{label}</div>
              <GameThumbnail
                game={game}
                onClick={() => onSelectGame(game.id)}
              />
            </div>
          );
        }

        return (
          <EmptyBoardSlot
            key={student.id}
            student={student}
            isConnected={isConnected}
          />
        );
      })}

      {students.length === 0 && (
        <div className="col-span-full text-center text-zinc-500 text-sm py-8">
          教室を選択してください
        </div>
      )}
    </div>
  );
}
