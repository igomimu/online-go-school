import { useMemo, useState } from 'react';
import type { Student } from '../../types/classroom';
import type { GameClock } from '../../types/game';
import type { LiveGameRow } from '../../utils/liveGameApi';
import { findStudentByIdentity, getDisplayName, studentMatchesPlayer } from '../../utils/identityUtils';

interface SimulAddGameDialogProps {
  connectedIdentities: string[];
  students: Student[];
  teacherIdentity: string;
  games: LiveGameRow[];
  onClose: () => void;
  onCreate: (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock?: GameClock | null;
  }) => Promise<void> | void;
}

const BOARD_SIZES = [9, 13, 19];
const LAST_BOARD_SIZE_KEY = 'go-school-simul-board-size';

function isTeacherGame(game: LiveGameRow, teacherIdentity: string): boolean {
  return game.black_player === teacherIdentity || game.white_player === teacherIdentity;
}

function isStudentInTeacherGame(identity: string, games: LiveGameRow[], teacherIdentity: string): boolean {
  return games.some((game) => {
    if (!isTeacherGame(game, teacherIdentity)) return false;
    return studentMatchesPlayer(identity, game.black_player) || studentMatchesPlayer(identity, game.white_player);
  });
}

export default function SimulAddGameDialog({
  connectedIdentities,
  students,
  teacherIdentity,
  games,
  onClose,
  onCreate,
}: SimulAddGameDialogProps) {
  const candidates = useMemo(
    () => connectedIdentities.filter((identity) => identity !== teacherIdentity),
    [connectedIdentities, teacherIdentity],
  );

  const availability = useMemo(
    () => candidates.map((identity) => ({
      identity,
      name: getDisplayName(identity, students),
      rank: findStudentByIdentity(identity, students)?.rank ?? '',
      busy: isStudentInTeacherGame(identity, games, teacherIdentity),
    })),
    [candidates, students, games, teacherIdentity],
  );

  const firstAvailable = availability.find((item) => !item.busy)?.identity ?? '';
  const [studentIdentity, setStudentIdentity] = useState(firstAvailable);
  const [boardSize, setBoardSize] = useState(() => {
    const saved = Number(localStorage.getItem(LAST_BOARD_SIZE_KEY));
    return BOARD_SIZES.includes(saved) ? saved : 19;
  });
  const [handicap, setHandicap] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selected = availability.find((item) => item.identity === studentIdentity);
  const komi = handicap >= 2 ? 0.5 : 6.5;
  const canSubmit = !!studentIdentity && !selected?.busy && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      localStorage.setItem(LAST_BOARD_SIZE_KEY, String(boardSize));
      await onCreate({
        blackPlayer: studentIdentity,
        whitePlayer: teacherIdentity,
        boardSize,
        handicap,
        komi,
        clock: null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        width: 420,
        background: '#e8e8e0',
        border: '2px solid #666',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        fontFamily: 'MS Gothic, "Noto Sans JP", monospace',
        fontSize: 12,
        color: '#333',
      }}>
        <div style={{
          background: '#3030a0',
          color: 'white',
          padding: '6px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 'bold',
        }}>
          <span>多面打ち - 対局を追加</span>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'white', fontSize: 18, cursor: 'pointer' }}
            aria-label="閉じる"
          >
            &times;
          </button>
        </div>

        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            生徒
            <select
              data-testid="simul-student-select"
              value={studentIdentity}
              onChange={(e) => setStudentIdentity(e.target.value)}
              style={{ border: '1px solid #999', padding: '4px 6px', background: 'white' }}
            >
              {availability.length === 0 && <option value="">接続中の生徒がいません</option>}
              {availability.map((item) => (
                <option key={item.identity} value={item.identity} disabled={item.busy}>
                  {item.name}{item.rank ? ` [${item.rank}]` : ''}{item.busy ? '（対局中）' : ''}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div style={{ marginBottom: 4 }}>碁盤サイズ</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {BOARD_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setBoardSize(size)}
                  style={{
                    flex: 1,
                    border: '1px solid #777',
                    background: boardSize === size ? '#3030a0' : '#fff',
                    color: boardSize === size ? '#fff' : '#333',
                    padding: '4px 0',
                    cursor: 'pointer',
                    fontWeight: boardSize === size ? 'bold' : 'normal',
                  }}
                >
                  {size}路
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            置石: {handicap}
            <input
              type="range"
              min={0}
              max={9}
              value={handicap}
              onChange={(e) => setHandicap(Number(e.target.value))}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>コミ: {komi}</span>
            <span>先生の石: 白</span>
            <span>時計: なし</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #bbb', paddingTop: 10 }}>
            <button
              onClick={onClose}
              style={{ border: '1px solid #999', background: '#fff', padding: '3px 12px', cursor: 'pointer' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                border: '1px solid #1e3a8a',
                background: canSubmit ? '#3030a0' : '#999',
                color: 'white',
                padding: '3px 14px',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              {isSubmitting ? '追加中...' : '追加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
