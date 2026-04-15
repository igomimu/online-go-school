import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Student } from '../types/classroom';
import { suggestHandicap } from '../types/classroom';
import { findStudentByIdentity, getDisplayName } from '../utils/identityUtils';
import type { GameClock } from '../types/game';
import { CLOCK_PRESETS, createClock } from '../hooks/useGameClock';

interface GameCreationDialogProps {
  students: string[];  // 利用可能な生徒名一覧（LiveKit identity）
  teacherName: string;
  onClose: () => void;
  onCreate: (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock?: GameClock;
  }) => void;
  registeredStudents?: Student[];  // 登録済み生徒データ（棋力表示用）
}

const BOARD_SIZES = [19, 13, 9];

export default function GameCreationDialog({
  students,
  teacherName,
  onClose,
  onCreate,
  registeredStudents = [],
}: GameCreationDialogProps) {
  // 「先生」も含めたプレイヤー候補
  const allPlayers = [teacherName, ...students];

  const [blackPlayer, setBlackPlayer] = useState(students[0] || teacherName);
  const [whitePlayer, setWhitePlayer] = useState(students.length > 1 ? students[1] : teacherName);
  const [boardSize, setBoardSize] = useState(19);
  const [handicap, setHandicap] = useState(0);
  const [komi, setKomi] = useState(6.5);
  const [clockPreset, setClockPreset] = useState(0); // index into CLOCK_PRESETS

  // ダイアログ開口後に生徒が参加したケースへの保険:
  // 初期値が teacherName 固定のままで students propが埋まった瞬間、自動で生徒を選択し直す。
  // ユーザーが既に選択済みの値は上書きしない。
  useEffect(() => {
    if (students.length > 0 && blackPlayer === teacherName && whitePlayer === teacherName) {
      setBlackPlayer(students[0]);
      if (students.length > 1) setWhitePlayer(students[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, teacherName]);

  // identity から登録生徒を検索
  const getRank = (identity: string): string => {
    return findStudentByIdentity(identity, registeredStudents)?.rank || '';
  };

  // identity → 表示名
  const displayName = (identity: string): string => {
    if (identity === teacherName) return identity;
    return getDisplayName(identity, registeredStudents);
  };

  // 棋力差から置き石を自動提案
  useEffect(() => {
    const bRank = getRank(blackPlayer);
    const wRank = getRank(whitePlayer);
    if (bRank && wRank) {
      const suggestion = suggestHandicap(bRank, wRank);
      setHandicap(suggestion.handicap);
      setKomi(suggestion.komi);
    }
  }, [blackPlayer, whitePlayer, registeredStudents]);

  const handleSubmit = () => {
    if (blackPlayer === whitePlayer) return;
    const preset = CLOCK_PRESETS[clockPreset];
    const clock = createClock(preset.mainTime, preset.byoyomi, preset.periods);
    onCreate({ blackPlayer, whitePlayer, boardSize, handicap, komi, clock });
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
          <label className="block text-sm text-zinc-400 mb-1">
            黒番
            {getRank(blackPlayer) && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono">
                {getRank(blackPlayer)}
              </span>
            )}
          </label>
          <select
            data-testid="black-player-select"
            value={blackPlayer}
            onChange={e => setBlackPlayer(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {allPlayers.map(p => {
              const rank = getRank(p);
              return (
                <option key={p} value={p}>
                  {displayName(p)}{p === teacherName ? '（先生）' : ''}{rank ? ` [${rank}]` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* 白番 */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">
            白番
            {getRank(whitePlayer) && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono">
                {getRank(whitePlayer)}
              </span>
            )}
          </label>
          <select
            data-testid="white-player-select"
            value={whitePlayer}
            onChange={e => setWhitePlayer(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {allPlayers.map(p => {
              const rank = getRank(p);
              return (
                <option key={p} value={p}>
                  {displayName(p)}{p === teacherName ? '（先生）' : ''}{rank ? ` [${rank}]` : ''}
                </option>
              );
            })}
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

        {/* 対局時計 */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">対局時計</label>
          <select
            value={clockPreset}
            onChange={e => setClockPreset(Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {CLOCK_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>

        <button
          data-testid="create-game-button"
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
