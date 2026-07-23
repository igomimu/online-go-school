import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Student } from '../types/classroom';
import { suggestHandicap } from '../types/classroom';
import { findStudentByIdentity, getDisplayName } from '../utils/identityUtils';
import type { GameClock } from '../types/game';
import type { TimeSettings } from '../hooks/useGameClock';
import { DEFAULT_TIME_SETTINGS, timeSettingsToClock } from '../hooks/useGameClock';
import TimeControlPicker from './TimeControlPicker';

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
  }) => void | Promise<void>;
  registeredStudents?: Student[];  // 登録済み生徒データ（棋力表示用）
  initialBlackPlayer?: string;     // 生徒一覧から「対局」を押した生徒を黒番に初期選択
}

const BOARD_SIZES = [19, 13, 9];
// 置石は0(互先)+2〜9子。1子は意味をなさないため選択肢から除く。
const HANDICAP_OPTIONS = [0, 2, 3, 4, 5, 6, 7, 8, 9];

export default function GameCreationDialog({
  students,
  teacherName,
  onClose,
  onCreate,
  registeredStudents = [],
  initialBlackPlayer,
}: GameCreationDialogProps) {
  // 「先生」も含めたプレイヤー候補
  const allPlayers = [teacherName, ...students];

  const [blackPlayer, setBlackPlayer] = useState(initialBlackPlayer || students[0] || teacherName);
  const [whitePlayer, setWhitePlayer] = useState(
    initialBlackPlayer
      ? teacherName
      : students.length > 1 ? students[1] : teacherName,
  );
  const [boardSize, setBoardSize] = useState(19);
  const [handicap, setHandicap] = useState(0);
  const [komi, setKomi] = useState(6.5);
  const [timeSettings, setTimeSettings] = useState<TimeSettings>(DEFAULT_TIME_SETTINGS);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initialBlackPlayer) return;
    setBlackPlayer(initialBlackPlayer);
    setWhitePlayer(teacherName);
  }, [initialBlackPlayer, teacherName]);

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
    if (identity === teacherName) return getDisplayName(identity, registeredStudents);
    return getDisplayName(identity, registeredStudents);
  };

  // 棋力差から置き石を自動提案。黒番/白番を選び直した時のみ発動し、
  // ユーザーが置石・コミを手動変更した後は上書きしない
  // （registeredStudentsの参照が再レンダリングごとに変わり、無関係な更新で
  //   手動設定を勝手に上書きしてしまうバグがあった）。
  const [handicapTouched, setHandicapTouched] = useState(false);

  useEffect(() => {
    setHandicapTouched(false);
  }, [blackPlayer, whitePlayer]);

  useEffect(() => {
    if (handicapTouched) return;
    const bRank = getRank(blackPlayer);
    const wRank = getRank(whitePlayer);
    if (bRank && wRank) {
      const suggestion = suggestHandicap(bRank, wRank);
      setHandicap(suggestion.handicap);
      setKomi(suggestion.komi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blackPlayer, whitePlayer, registeredStudents, handicapTouched]);

  const handleSubmit = async () => {
    if (submitting || blackPlayer === whitePlayer) return;
    setSubmitting(true);
    const clock = timeSettingsToClock(timeSettings);
    try {
      await onCreate({ blackPlayer, whitePlayer, boardSize, handicap, komi, clock });
      onClose();
    } finally {
      setSubmitting(false);
    }
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
            className="w-full bg-white/5 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            {allPlayers.map(p => {
              const rank = getRank(p);
              return (
                <option key={p} value={p} className="bg-zinc-800 text-white">
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
            className="w-full bg-white/5 text-white border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            {allPlayers.map(p => {
              const rank = getRank(p);
              return (
                <option key={p} value={p} className="bg-zinc-800 text-white">
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
                    ? 'bg-amber-500 text-white'
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
          <label className="block text-sm text-zinc-400 mb-1">置石</label>
          <div className="flex flex-wrap gap-2">
            {HANDICAP_OPTIONS.map(h => (
              <button
                key={h}
                onClick={() => {
                  setHandicap(h);
                  setHandicapTouched(true);
                  setKomi(h >= 2 ? 0.5 : 6.5);
                }}
                className={`flex-1 min-w-[3rem] py-2 rounded-lg text-sm font-medium transition-all ${
                  handicap === h
                    ? 'bg-amber-500 text-white'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {h === 0 ? '互先' : `${h}子`}
              </button>
            ))}
          </div>
        </div>

        {/* コミ */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">コミ</label>
          <input
            type="number"
            value={komi}
            step={0.5}
            onChange={e => { setKomi(parseFloat(e.target.value) || 0); setHandicapTouched(true); }}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* 対局時計（持ち時間を項目ごとに自由設定） */}
        <div>
          <label className="block text-sm text-zinc-400 mb-2">対局時計</label>
          <TimeControlPicker variant="dark" value={timeSettings} onChange={setTimeSettings} />
        </div>

        <button
          data-testid="create-game-button"
          onClick={handleSubmit}
          disabled={submitting || blackPlayer === whitePlayer}
          className="premium-button w-full disabled:opacity-30"
        >
          {submitting ? '作成中...' : '対局開始'}
        </button>
      </div>
    </div>
  );
}
