import type { Tournament, TournamentMatch } from '../../types/tournament';
import { handicapLabel } from '../../utils/tournament/pairing';
import { MatchActions, MatchPlayer } from './matchParts';

interface TournamentTreeProps {
  tournament: Tournament;
  isTeacher: boolean;
  onSelectGame?: (gameId: string) => void;
  onCreateGameForMatch?: (match: TournamentMatch) => void;
  onSetMatchResult?: (matchId: string, winnerId: string, resultDetail: string) => void;
}

export default function TournamentTree({
  tournament,
  isTeacher,
  onSelectGame,
  onCreateGameForMatch,
  onSetMatchResult,
}: TournamentTreeProps) {
  const { matches, totalRounds } = tournament;

  // ラウンドごとにマッチをグループ化
  const rounds: { roundNumber: number; title: string; matches: TournamentMatch[] }[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    let title = `第${r}回戦`;
    if (r === totalRounds) {
      title = '決勝';
    } else if (r === totalRounds - 1 && totalRounds >= 2) {
      title = '準決勝';
    } else if (r === totalRounds - 2 && totalRounds >= 3) {
      title = '準々決勝';
    }

    const roundMatches = matches
      .filter(m => m.round === r)
      .sort((a, b) => a.matchIndex - b.matchIndex);

    rounds.push({ roundNumber: r, title, matches: roundMatches });
  }

  return (
    <div className="w-full select-none overflow-x-auto p-4">
      <div className="flex min-w-max items-start gap-6">
        {rounds.map(round => (
          <div key={round.roundNumber} className="flex w-72 flex-col gap-3">
            <div className="rounded-md border border-line bg-raised px-3 py-1 text-sm font-bold">
              {round.title}
            </div>

            <div className="flex h-full flex-col justify-around gap-4 py-1">
              {round.matches.map(m => {
                const ready = m.player1 !== null && m.player2 !== null;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col gap-1 rounded-md border p-2.5 ${
                      m.winnerId
                        ? 'border-line bg-surface'
                        : ready
                          ? 'border-accent bg-surface'
                          : 'border-dashed border-line bg-surface text-muted'
                    }`}
                  >
                    {ready && !m.isBye && (
                      <div className="mb-1 flex items-center justify-between border-b border-line pb-1 text-[11px] text-muted">
                        <span>{handicapLabel(m)}</span>
                        {m.resultDetail && <span className="font-semibold text-ink">{m.resultDetail}</span>}
                      </div>
                    )}
                    <MatchPlayer player={m.player1} color="black" winnerId={m.winnerId} />
                    <MatchPlayer
                      player={m.player2}
                      color="white"
                      winnerId={m.winnerId}
                      emptyLabel={m.isBye ? '不戦勝' : '（未定）'}
                    />
                    <MatchActions
                      match={m}
                      isTeacher={isTeacher}
                      onSelectGame={onSelectGame}
                      onCreateGameForMatch={onCreateGameForMatch}
                      onSetMatchResult={onSetMatchResult}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
