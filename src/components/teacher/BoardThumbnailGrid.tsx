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

export default function BoardThumbnailGrid({
  games,
  onSelectGame,
}: BoardThumbnailGridProps) {
  const playingGames = games.filter(g => g.status === 'playing');
  const finishedGames = games.filter(g => g.status === 'finished');

  if (games.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm p-8">
        対局がありません
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 進行中 */}
      {playingGames.length > 0 && (
        <div>
          <h4 className="text-xs text-zinc-400 font-medium mb-2">
            進行中 ({playingGames.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
            {playingGames.map(game => (
              <GameThumbnail
                key={game.id}
                game={game}
                onClick={() => onSelectGame(game.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 終了 */}
      {finishedGames.length > 0 && (
        <div>
          <h4 className="text-xs text-zinc-400 font-medium mb-2">
            終了 ({finishedGames.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
            {finishedGames.map(game => (
              <GameThumbnail
                key={game.id}
                game={game}
                onClick={() => onSelectGame(game.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
