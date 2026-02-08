import { useState, useEffect } from 'react';
import { Trash2, Search } from 'lucide-react';
import type { SavedGame } from '../types/game';
import { loadSavedGames, deleteGame } from '../utils/savedGames';

interface SavedGameListProps {
  onSelectGame: (game: SavedGame) => void;
}

export default function SavedGameList({ onSelectGame }: SavedGameListProps) {
  const [games, setGames] = useState<SavedGame[]>([]);

  useEffect(() => {
    setGames(loadSavedGames());
  }, []);

  const handleDelete = (id: string) => {
    if (!confirm('この棋譜を削除しますか？')) return;
    deleteGame(id);
    setGames(prev => prev.filter(g => g.id !== id));
  };

  if (games.length === 0) {
    return (
      <div className="text-zinc-500 text-sm text-center py-4">
        保存された棋譜はありません
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {games.map(game => (
        <div
          key={game.id}
          className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm"
        >
          <button
            onClick={() => onSelectGame(game)}
            className="flex-1 text-left hover:text-blue-400 transition-colors"
          >
            <div className="font-medium">
              {game.blackPlayer} vs {game.whitePlayer}
            </div>
            <div className="text-xs text-zinc-500">
              {game.date} | {game.boardSize}路 | {game.result}
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSelectGame(game)}
              className="p-1 text-zinc-500 hover:text-blue-400"
              title="検討する"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(game.id)}
              className="p-1 text-zinc-500 hover:text-red-400"
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
