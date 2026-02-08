import { useState } from 'react';
import { X } from 'lucide-react';

interface GameCreationDialogProps {
  students: string[];  // 利用可能な生徒名一覧
  teacherName: string;
  onClose: () => void;
  onCreate: (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
  }) => void;
}

const BOARD_SIZES = [19, 13, 9];

export default function GameCreationDialog({
  students,
  teacherName,
  onClose,
  onCreate,
}: GameCreationDialogProps) {
  // 「先生」も含めたプレイヤー候補
  const allPlayers = [teacherName, ...students];

  const [blackPlayer, setBlackPlayer] = useState(students[0] || teacherName);
  const [whitePlayer, setWhitePlayer] = useState(students.length > 1 ? students[1] : teacherName);
  const [boardSize, setBoardSize] = useState(19);
  const [handicap, setHandicap] = useState(0);
  const [komi, setKomi] = useState(6.5);

  const handleSubmit = () => {
    if (blackPlayer === whitePlayer) return;
    onCreate({ blackPlayer, whitePlayer, boardSize, handicap, komi });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="glass-panel p-6 w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">対局作成</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 黒番 */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">黒番</label>
          <select
            value={blackPlayer}
            onChange={e => setBlackPlayer(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {allPlayers.map(p => (
              <option key={p} value={p}>{p}{p === teacherName ? '（先生）' : ''}</option>
            ))}
          </select>
        </div>

        {/* 白番 */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">白番</label>
          <select
            value={whitePlayer}
            onChange={e => setWhitePlayer(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {allPlayers.map(p => (
              <option key={p} value={p}>{p}{p === teacherName ? '（先生）' : ''}</option>
            ))}
          </select>
        </div>

        {blackPlayer === whitePlayer && (
          <p className="text-red-400 text-sm">黒と白に同じプレイヤーは選べません</p>
        )}

        {/* 碁盤サイズ */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">碁盤サイズ</label>
          <div className="flex gap-2">
            {BOARD_SIZES.map(size => (
              <button
                key={size}
                onClick={() => setBoardSize(size)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  boardSize === size
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {size}路
              </button>
            ))}
          </div>
        </div>

        {/* 置石 */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">置石: {handicap}</label>
          <input
            type="range"
            min={0}
            max={9}
            value={handicap}
            onChange={e => {
              const h = parseInt(e.target.value);
              setHandicap(h);
              if (h >= 2) setKomi(0.5);
              else setKomi(6.5);
            }}
            className="w-full"
          />
        </div>

        {/* コミ */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">コミ</label>
          <input
            type="number"
            value={komi}
            step={0.5}
            onChange={e => setKomi(parseFloat(e.target.value) || 0)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={blackPlayer === whitePlayer}
          className="premium-button w-full disabled:opacity-30"
        >
          対局開始
        </button>
      </div>
    </div>
  );
}
