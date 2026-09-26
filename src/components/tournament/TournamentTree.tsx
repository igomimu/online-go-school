import type { Tournament, TournamentMatch } from '../../types/tournament';

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

  const formatHandicap = (match: TournamentMatch) => {
    if (match.handicap > 0) return `${match.handicap}子 (コミ${match.komi}目)`;
    if (match.komi === 0.5) return '先相先 (コミ半目)';
    return `互先 (コミ${match.komi}目)`;
  };

  return (
    <div className="w-full overflow-x-auto p-4 select-none">
      <div className="flex gap-8 min-w-max items-start">
        {rounds.map(round => (
          <div key={round.roundNumber} className="flex flex-col gap-4 w-72">
            <div className="text-center font-bold text-stone-700 dark:text-stone-300 py-1 px-3 bg-stone-100 dark:bg-stone-800 rounded-lg text-sm border border-stone-200 dark:border-stone-700">
              {round.title}
            </div>

            <div className="flex flex-col justify-around gap-6 h-full py-2">
              {round.matches.map(m => {
                const canCreateGame =
                  isTeacher &&
                  !m.liveGameId &&
                  !m.winnerId &&
                  !m.isBye &&
                  m.player1 !== null &&
                  m.player2 !== null;

                const isReadyToPlay = m.player1 !== null && m.player2 !== null;

                return (
                  <div
                    key={m.id}
                    className={`relative rounded-xl border p-3 shadow-sm transition-all ${
                      m.winnerId
                        ? 'bg-stone-50/60 dark:bg-stone-900/60 border-stone-200 dark:border-stone-800'
                        : isReadyToPlay
                        ? 'bg-white dark:bg-stone-800 border-amber-400 dark:border-amber-600 shadow-md ring-1 ring-amber-400/30'
                        : 'bg-stone-50 dark:bg-stone-800/40 border-dashed border-stone-300 dark:border-stone-700 opacity-70'
                    }`}
                  >
                    {/* 手合割バッジ */}
                    {isReadyToPlay && !m.isBye && (
                      <div className="text-[10px] text-stone-500 dark:text-stone-400 mb-2 flex justify-between items-center border-b pb-1 dark:border-stone-700">
                        <span>{formatHandicap(m)}</span>
                        {m.resultDetail && (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {m.resultDetail}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 選手1 */}
                    <div
                      className={`flex items-center justify-between p-1.5 rounded-lg text-sm mb-1 ${
                        m.winnerId && m.player1 && m.winnerId === m.player1.identity
                          ? 'bg-amber-100 dark:bg-amber-900/40 font-bold text-amber-900 dark:text-amber-200'
                          : m.winnerId && m.player1 && m.winnerId !== m.player1.identity
                          ? 'opacity-40 line-through'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2.5 h-2.5 rounded-full bg-stone-900 dark:bg-stone-100 inline-block shrink-0" />
                        <span className="truncate">{m.player1 ? m.player1.name : '（未定）'}</span>
                      </div>
                      {m.player1 && (
                        <span className="text-xs text-stone-500 dark:text-stone-400 shrink-0">
                          {m.player1.rank}
                        </span>
                      )}
                    </div>

                    {/* 選手2 */}
                    <div
                      className={`flex items-center justify-between p-1.5 rounded-lg text-sm ${
                        m.winnerId && m.player2 && m.winnerId === m.player2.identity
                          ? 'bg-amber-100 dark:bg-amber-900/40 font-bold text-amber-900 dark:text-amber-200'
                          : m.winnerId && m.player2 && m.winnerId !== m.player2.identity
                          ? 'opacity-40 line-through'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2.5 h-2.5 rounded-full border border-stone-400 bg-white inline-block shrink-0" />
                        <span className="truncate">{m.player2 ? m.player2.name : m.isBye ? '不戦勝' : '（未定）'}</span>
                      </div>
                      {m.player2 && (
                        <span className="text-xs text-stone-500 dark:text-stone-400 shrink-0">
                          {m.player2.rank}
                        </span>
                      )}
                    </div>

                    {/* アクションボタン */}
                    <div className="mt-2.5 pt-2 border-t border-stone-100 dark:border-stone-700/60 flex flex-wrap gap-1.5 items-center justify-end text-xs">
                      {m.liveGameId && onSelectGame && (
                        <button
                          onClick={() => onSelectGame(m.liveGameId!)}
                          className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-medium shadow-sm transition-colors"
                        >
                          対局へ
                        </button>
                      )}

                      {canCreateGame && onCreateGameForMatch && (
                        <button
                          onClick={() => onCreateGameForMatch(m)}
                          className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-white dark:bg-stone-700 dark:hover:bg-stone-600 rounded font-medium transition-colors"
                        >
                          対局作成
                        </button>
                      )}

                      {isTeacher && !m.winnerId && isReadyToPlay && onSetMatchResult && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onSetMatchResult(m.id, m.player1!.identity, '黒中押し勝ち')}
                            title="黒の勝ちにする"
                            className="px-1.5 py-0.5 border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-[11px]"
                          >
                            黒勝
                          </button>
                          <button
                            onClick={() => onSetMatchResult(m.id, m.player2!.identity, '白中押し勝ち')}
                            title="白の勝ちにする"
                            className="px-1.5 py-0.5 border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-[11px]"
                          >
                            白勝
                          </button>
                        </div>
                      )}
                    </div>
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
