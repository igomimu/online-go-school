import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Student } from '../types/classroom';
import { findStudentByIdentity, getDisplayName } from '../utils/identityUtils';
import type { GameClock } from '../types/game';
import { createNhkClock, timeSettingsToClock } from '../hooks/useGameClock';
import NigiriDraw from './NigiriDraw';

interface GameCreationDialogProps {
  students: string[];
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
  registeredStudents?: Student[];
  /** 生徒一覧の「新規」を押した生徒。相手の初期値にする。 */
  initialBlackPlayer?: string;
  onNigiriDraw?: (blackPlayer: string, whitePlayer: string) => void;
}

const BOARD_SIZES = [19, 17, 15, 13, 11, 9, 7] as const;
const HANDICAP_OPTIONS = [0, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const KOMI_OPTIONS = [6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5, -0.5, -1.5, -2.5, -3.5, -4.5, -5.5, -6.5, -7.5] as const;

/** 互先のコミ */
const EVEN_KOMI = 6.5;
/** 置き石を置いたときのコミ（半目残し） */
const HANDICAP_KOMI = 0.5;
const MINUTE_OPTIONS = Array.from({ length: 61 }, (_, i) => i);
const BYOYOMI_PERIOD_OPTIONS = Array.from({ length: 11 }, (_, i) => i);
const BYOYOMI_SECONDS_OPTIONS = [10, 20, 30, 40, 50, 60] as const;
const NHK_CONSIDERATION_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

type PlayerColor = 'BLACK' | 'WHITE';

const selectClassName = 'bg-ink/5 text-ink border border-field-line rounded-md px-3 py-2 focus:outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50';

export default function GameCreationDialog({
  students,
  teacherName,
  onClose,
  onCreate,
  registeredStudents = [],
  initialBlackPlayer,
  onNigiriDraw,
}: GameCreationDialogProps) {
  const uniqueStudents = useMemo(() => Array.from(new Set(students)), [students]);
  const initialStudent = initialBlackPlayer || uniqueStudents[0] || '';

  const [primaryStudent, setPrimaryStudent] = useState(initialStudent);
  const [opponentPlayer, setOpponentPlayer] = useState(initialStudent);
  const [selfColor, setSelfColor] = useState<PlayerColor>('WHITE');
  const [studentVsStudent, setStudentVsStudent] = useState(false);
  const [boardSize, setBoardSize] = useState(19);
  const [handicap, setHandicap] = useState(0);
  const [komi, setKomi] = useState(EVEN_KOMI);
  const [customKomi, setCustomKomi] = useState('6.5');
  const [customKomiEnabled, setCustomKomiEnabled] = useState(false);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);
  const [nhkStyle, setNhkStyle] = useState(false);
  const [mainMinutes, setMainMinutes] = useState(30);
  const [byoyomiPeriods, setByoyomiPeriods] = useState(0);
  const [byoyomiSeconds, setByoyomiSeconds] = useState(30);
  const [nhkConsiderationPeriods, setNhkConsiderationPeriods] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initialBlackPlayer) return;
    setPrimaryStudent(initialBlackPlayer);
    setOpponentPlayer(current => {
      if (!studentVsStudent) return initialBlackPlayer;
      return current !== initialBlackPlayer
        ? current
        : uniqueStudents.find(student => student !== initialBlackPlayer) || '';
    });
  }, [initialBlackPlayer, studentVsStudent, uniqueStudents]);

  useEffect(() => {
    if (uniqueStudents.length === 0) {
      setPrimaryStudent('');
      setOpponentPlayer('');
      setStudentVsStudent(false);
      return;
    }
    setPrimaryStudent(current => uniqueStudents.includes(current) ? current : uniqueStudents[0]);
    setOpponentPlayer(current => {
      if (uniqueStudents.includes(current) && (!studentVsStudent || current !== primaryStudent)) return current;
      return uniqueStudents.find(student => !studentVsStudent || student !== primaryStudent) || '';
    });
  }, [uniqueStudents, studentVsStudent, primaryStudent]);

  const getRank = (identity: string): string => findStudentByIdentity(identity, registeredStudents)?.rank || '';
  const displayName = (identity: string): string => getDisplayName(identity, registeredStudents);

  const selfPlayer = studentVsStudent ? primaryStudent : teacherName;
  const opponentOptions = studentVsStudent
    ? uniqueStudents.filter(student => student !== selfPlayer)
    : uniqueStudents;
  const blackPlayer = selfColor === 'BLACK' ? selfPlayer : opponentPlayer;
  const whitePlayer = selfColor === 'WHITE' ? selfPlayer : opponentPlayer;
  const customKomiNumber = Number(customKomi);
  const komiIsValid = !customKomiEnabled
    || (customKomi.trim() !== '' && Number.isFinite(customKomiNumber));
  const playersAreValid = !!selfPlayer && !!opponentPlayer && selfPlayer !== opponentPlayer;

  const handleStudentVsStudentChange = (checked: boolean) => {
    setStudentVsStudent(checked);
    if (checked) {
      const selected = primaryStudent || opponentPlayer || uniqueStudents[0] || '';
      setPrimaryStudent(selected);
      if (opponentPlayer === selected) {
        setOpponentPlayer(uniqueStudents.find(student => student !== selected) || '');
      }
    } else {
      setOpponentPlayer(primaryStudent || uniqueStudents[0] || '');
    }
  };

  const applyNigiriResult = useCallback((black: string) => {
    setSelfColor(black === selfPlayer ? 'BLACK' : 'WHITE');
  }, [selfPlayer]);

  const handleSubmit = async () => {
    if (submitting || !playersAreValid || !komiIsValid) return;
    setSubmitting(true);
    const clock = !timeLimitEnabled
      ? undefined
      : nhkStyle
        ? createNhkClock(nhkConsiderationPeriods)
        : timeSettingsToClock({
            mainMinutes,
            byoyomiEnabled: byoyomiPeriods > 0,
            byoyomiSeconds,
            byoyomiPeriods,
          });
    try {
      await onCreate({
        blackPlayer,
        whitePlayer,
        boardSize,
        handicap,
        komi: customKomiEnabled ? customKomiNumber : komi,
        clock,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
      <div className="glass-panel p-5 sm:p-6 w-full max-w-xl space-y-4 max-h-[94dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">対局作成</h2>
          <button type="button" aria-label="閉じる" onClick={onClose} className="text-muted hover:text-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label htmlFor="board-size-select" className="block text-sm text-muted mb-1">碁盤サイズ</label>
          <select
            id="board-size-select"
            data-testid="board-size-select"
            value={boardSize}
            onChange={event => setBoardSize(Number(event.target.value))}
            className={`${selectClassName} w-full`}
          >
            {BOARD_SIZES.map(size => <option key={size} value={size}>{size}x{size}</option>)}
          </select>
        </div>

        <section className="space-y-3 border-y border-line py-4" aria-label="対局者">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <div className="text-sm text-muted mb-1">対局者（自分）</div>
              <div data-testid="self-player-name" className="font-semibold text-ink">
                {selfPlayer ? displayName(selfPlayer) : '生徒を選択してください'}
                {getRank(selfPlayer) && <span className="ml-2 text-xs text-muted">{getRank(selfPlayer)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-4" role="radiogroup" aria-label="自分の石の色">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="self-color"
                  value="BLACK"
                  checked={selfColor === 'BLACK'}
                  onChange={() => setSelfColor('BLACK')}
                />
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-black border border-black" aria-hidden="true" />
                黒
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="self-color"
                  value="WHITE"
                  checked={selfColor === 'WHITE'}
                  onChange={() => setSelfColor('WHITE')}
                />
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-white border border-ink" aria-hidden="true" />
                白
              </label>
            </div>
          </div>

          <label className={`flex items-center gap-2 text-sm ${uniqueStudents.length < 2 ? 'text-muted' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              data-testid="student-vs-student-checkbox"
              checked={studentVsStudent}
              disabled={uniqueStudents.length < 2}
              onChange={event => handleStudentVsStudentChange(event.target.checked)}
            />
            生徒同士対局
          </label>

          <div>
            <label htmlFor="opponent-player-select" className="block text-sm text-muted mb-1">
              対局者（相手） <span className="text-ink">{selfColor === 'WHITE' ? '● 黒' : '○ 白'}</span>
            </label>
            <select
              id="opponent-player-select"
              data-testid="opponent-player-select"
              value={opponentPlayer}
              disabled={opponentOptions.length === 0}
              onChange={event => setOpponentPlayer(event.target.value)}
              className={`${selectClassName} w-full`}
            >
              {opponentOptions.length === 0 && <option value="">接続中の生徒がいません</option>}
              {opponentOptions.map(player => (
                <option key={player} value={player}>
                  {displayName(player)}{getRank(player) ? ` [${getRank(player)}]` : ''}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="handicap-select" className="block text-sm text-muted mb-1">置き石</label>
            <select
              id="handicap-select"
              data-testid="handicap-select"
              value={handicap}
              onChange={event => {
                const next = Number(event.target.value);
                setHandicap(next);
                // 置き石を置いたらコミは半目、互先に戻したら 6目半。
                // 毎回コミを直す手間を無くす（2026-08-26 三村さん）。
                // 自由入力を選んでいるときは、その値を尊重して触らない
                if (!customKomiEnabled) setKomi(next > 0 ? HANDICAP_KOMI : EVEN_KOMI);
              }}
              className={`${selectClassName} w-full`}
            >
              {HANDICAP_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="komi-select" className="block text-sm text-muted mb-1">コミ</label>
            <select
              id="komi-select"
              data-testid="komi-select"
              value={customKomiEnabled ? 'other' : String(komi)}
              onChange={event => {
                if (event.target.value === 'other') {
                  setCustomKomiEnabled(true);
                  setCustomKomi(String(komi));
                } else {
                  setCustomKomiEnabled(false);
                  setKomi(Number(event.target.value));
                }
              }}
              className={`${selectClassName} w-full`}
            >
              {KOMI_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
              <option value="other">その他</option>
            </select>
          </div>
        </div>

        {customKomiEnabled && (
          <div>
            <label htmlFor="custom-komi-input" className="block text-sm text-muted mb-1">コミ（自由入力）</label>
            <input
              id="custom-komi-input"
              data-testid="custom-komi-input"
              type="number"
              step="0.5"
              value={customKomi}
              onChange={event => setCustomKomi(event.target.value)}
              className={`${selectClassName} w-full`}
            />
            {!komiIsValid && <p className="mt-1 text-xs text-alert-text">コミを数値で入力してください</p>}
          </div>
        )}

        {handicap === 0 && playersAreValid && (
          <NigiriDraw
            key={[selfPlayer, opponentPlayer].slice().sort().join('|')}
            candidates={[selfPlayer, opponentPlayer]}
            displayName={displayName}
            onDrawStart={onNigiriDraw}
            onDecided={applyNigiriResult}
          />
        )}

        <section className="space-y-3 border-t border-line pt-4" aria-label="時間設定">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              data-testid="time-limit-checkbox"
              checked={timeLimitEnabled}
              onChange={event => setTimeLimitEnabled(event.target.checked)}
            />
            時間制限
          </label>

          <fieldset disabled={!timeLimitEnabled} className={`space-y-3 transition-opacity ${timeLimitEnabled ? '' : 'opacity-35'}`}>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                data-testid="nhk-style-checkbox"
                checked={nhkStyle}
                onChange={event => setNhkStyle(event.target.checked)}
              />
              NHK杯方式
            </label>

            {nhkStyle ? (
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="nhk-consideration-select">考慮時間（分）</label>
                <select
                  id="nhk-consideration-select"
                  data-testid="nhk-consideration-select"
                  value={nhkConsiderationPeriods}
                  onChange={event => setNhkConsiderationPeriods(Number(event.target.value))}
                  className={selectClassName}
                >
                  {NHK_CONSIDERATION_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <span className="text-xs text-muted">1手30秒・考慮時間は1回60秒</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>持ち時間</span>
                <select
                  aria-label="持ち時間（分）"
                  value={mainMinutes}
                  onChange={event => setMainMinutes(Number(event.target.value))}
                  className={selectClassName}
                >
                  {MINUTE_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <span>分</span>
                <span className="text-muted">＋</span>
                <span>秒読み回数</span>
                <select
                  aria-label="秒読み回数"
                  value={byoyomiPeriods}
                  onChange={event => setByoyomiPeriods(Number(event.target.value))}
                  className={selectClassName}
                >
                  {BYOYOMI_PERIOD_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <span>回 × 秒読み</span>
                <select
                  aria-label="秒読み（秒/手）"
                  value={byoyomiSeconds}
                  onChange={event => setByoyomiSeconds(Number(event.target.value))}
                  className={selectClassName}
                >
                  {BYOYOMI_SECONDS_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <span>秒/手</span>
              </div>
            )}
          </fieldset>
        </section>

        {!playersAreValid && <p className="text-alert-text text-sm">対局する生徒を選択してください</p>}

        <button
          type="button"
          data-testid="create-game-button"
          onClick={handleSubmit}
          disabled={submitting || !playersAreValid || !komiIsValid}
          className="premium-button w-full disabled:opacity-30"
        >
          {submitting ? '作成中...' : '対局開始'}
        </button>
      </div>
    </div>
  );
}
