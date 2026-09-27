import type { TournamentMatch, TournamentParticipant } from '../../types/tournament';
import { isLinkedGameId } from '../../utils/tournament/pairing';

// リーグ戦とトーナメントで共通の、対戦1つぶんの部品

export function MatchPlayer({
  player,
  color,
  winnerId,
  emptyLabel = '（未定）',
}: {
  player: TournamentParticipant | null;
  color: 'black' | 'white';
  winnerId: string | null;
  emptyLabel?: string;
}) {
  const won = !!player && winnerId === player.identity;
  const lost = !!player && !!winnerId && winnerId !== player.identity;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
        won ? 'bg-raised font-bold text-ink' : lost ? 'text-muted line-through' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {/* 石の色は明暗のテーマに関わらず同じ（黒は黒、白は白） */}
        <span
          aria-label={color === 'black' ? '黒' : '白'}
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
          style={color === 'black'
            ? { background: '#15140f', borderColor: '#9a9285' }
            : { background: '#f5f2ea', borderColor: '#9a9285' }}
        />
        <span className="truncate">{player ? player.name : emptyLabel}</span>
      </div>
      {player && <span className="shrink-0 text-xs text-muted">{player.rank}</span>}
    </div>
  );
}

export function MatchActions({
  match,
  isTeacher,
  onSelectGame,
  onCreateGameForMatch,
  onSetMatchResult,
}: {
  match: TournamentMatch;
  isTeacher: boolean;
  onSelectGame?: (gameId: string) => void;
  onCreateGameForMatch?: (match: TournamentMatch) => void;
  onSetMatchResult?: (matchId: string, winnerId: string, resultDetail: string) => void;
}) {
  const ready = !!match.player1 && !!match.player2 && !match.isBye;
  const linked = isLinkedGameId(match.liveGameId);
  const canCreate = isTeacher && ready && !match.winnerId && !match.liveGameId && !!onCreateGameForMatch;
  const canSetResult = isTeacher && ready && !match.winnerId && !!onSetMatchResult;
  if (!linked && !canCreate && !canSetResult) return null;

  const small = 'rounded border border-line px-2 py-0.5 text-[11px] transition-colors duration-150 hover:bg-raised';
  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-line pt-2 text-xs">
      {linked && onSelectGame && !match.winnerId ? (
        <button
          onClick={() => onSelectGame(match.liveGameId!)}
          className="rounded bg-accent px-2 py-1 font-semibold text-accent-ink transition-colors duration-150 hover:opacity-90"
        >
          対局を見る
        </button>
      ) : canCreate ? (
        <button
          onClick={() => onCreateGameForMatch!(match)}
          className="rounded border border-accent px-2 py-1 font-semibold text-accent-text transition-colors duration-150 hover:bg-raised"
        >
          対局を作る
        </button>
      ) : (
        <span />
      )}

      {canSetResult && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted">手で入れる:</span>
          <button onClick={() => onSetMatchResult!(match.id, match.player1!.identity, '黒中押し勝ち')} title="黒の勝ちにする" className={small}>
            黒勝ち
          </button>
          <button onClick={() => onSetMatchResult!(match.id, match.player2!.identity, '白中押し勝ち')} title="白の勝ちにする" className={small}>
            白勝ち
          </button>
        </div>
      )}
    </div>
  );
}
