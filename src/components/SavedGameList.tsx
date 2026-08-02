import { useState } from 'react';
import { Trash2, Search } from 'lucide-react';
import type { SavedGame } from '../types/game';
import type { Student } from '../types/classroom';
import { loadSavedGames, deleteGame } from '../utils/savedGames';
import { getDisplayName } from '../utils/identityUtils';

interface SavedGameListProps {
  onSelectGame: (game: SavedGame) => void;
  /** 対局者の表示名を引くための名簿。DB には identity（sid:1010 等）が入っているため必須 */
  students?: Student[];
}

export default function SavedGameList({ onSelectGame, students = [] }: SavedGameListProps) {
  const [games, setGames] = useState<SavedGame[]>(() => loadSavedGames());

  const handleDelete = (id: string) => {
    if (!confirm('この棋譜を削除しますか？')) return;
    deleteGame(id);
    setGames(prev => prev.filter(g => g.id !== id));
  };

  if (games.length === 0) {
    return (
      <div className="py-4 text-sm text-nibi">
        保存された棋譜はありません
      </div>
    );
  }

  return (
    <div className="max-h-60 space-y-2 overflow-y-auto">
      {games.map(game => (
        <div
          key={game.id}
          className="flex items-center justify-between rounded-lg bg-sumi-high px-3 py-2 text-sm"
        >
          <button
            onClick={() => onSelectGame(game)}
            className="flex-1 text-left transition-colors hover:text-kaya"
          >
            <div className="font-medium">
              {getDisplayName(game.blackPlayer, students)} vs {getDisplayName(game.whitePlayer, students)}
            </div>
            <div className="tabular text-xs text-nibi">
              {game.date} | {game.boardSize}路 | {game.result}
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSelectGame(game)}
              className="p-1 text-nibi hover:text-kaya"
              title="検討する"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(game.id)}
              className="p-1 text-nibi hover:text-shu"
              title="削除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
