import { useEffect, useState } from 'react';
import type { TournamentParticipant } from '../../types/tournament';

interface TournamentCelebrationProps {
  winner: TournamentParticipant;
  tournamentName: string;
  onClose: () => void;
}

export default function TournamentCelebration({
  winner,
  tournamentName,
  onClose,
}: TournamentCelebrationProps) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; size: number }[]>([]);

  useEffect(() => {
    // 祝賀パーティクル（紙吹雪）を生成
    const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
    const p = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 6,
    }));
    setParticles(p);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      {/* 紙吹雪背景 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map(pt => (
          <div
            key={pt.id}
            className="absolute rounded-sm animate-bounce opacity-80"
            style={{
              left: `${pt.x}%`,
              top: `${pt.y}%`,
              width: `${pt.size}px`,
              height: `${pt.size}px`,
              backgroundColor: pt.color,
              animationDuration: `${1.5 + (pt.id % 5) * 0.4}s`,
              transform: `rotate(${pt.id * 15}deg)`,
            }}
          />
        ))}
      </div>

      <div className="relative bg-white dark:bg-stone-900 border-2 border-amber-400 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center z-10">
        <div className="text-5xl mb-3">🏆</div>
        <div className="text-amber-500 font-bold tracking-wider text-sm uppercase mb-1">
          Tournament Champion
        </div>
        <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-2">
          {tournamentName}
        </h2>
        <div className="my-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
          <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">優勝</div>
          <div className="text-2xl font-extrabold text-stone-900 dark:text-amber-300">
            {winner.name}
          </div>
          <div className="text-sm font-medium text-stone-600 dark:text-stone-400 mt-1">
            {winner.rank}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow transition-colors"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
