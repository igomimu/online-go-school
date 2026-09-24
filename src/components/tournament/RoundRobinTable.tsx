import { useState } from 'react';
import type { Tournament, TournamentMatch } from '../../types/tournament';
import { calculateRoundRobinStandings } from '../../utils/tournament/pairing';

interface RoundRobinTableProps {
  tournament: Tournament;
  isTeacher: boolean;
  onSelectGame?: (gameId: string) => void;
  onCreateGameForMatch?: (match: TournamentMatch) => void;
  onCreateRoundGames?: (roundNumber: number) => void;
  onSetMatchResult?: (matchId: string, winnerId: string, resultDetail: string) => void;
}

export default function RoundRobinTable({
  tournament,
  isTeacher,
  onSelectGame,
  onCreateGameForMatch,
  onCreateRoundGames,
  onSetMatchResult,
}: RoundRobinTableProps) {
  const { participants, matches, totalRounds } = tournament;
  const [activeTab, setActiveTab] = useState<'standings' | 'matches'>('standings');
  const [selectedRound, setSelectedRound] = useState<number>(1);

  const standings = calculateRoundRobinStandings(matches, participants);

  // 指定参加者同士のマッチを探す
  const getMatchBetween = (idA: string, idB: string): TournamentMatch | undefined => {
    return matches.find(
      m =>
        (m.player1?.identity === idA && m.player2?.identity === idB) ||
        (m.player1?.identity === idB && m.player2?.identity === idA),
    );
  };

  const currentRoundMatches = matches.filter(m => m.round === selectedRound);

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* タブ切り替え */}
      <div className="flex gap-2 border-b border-stone-200 dark:border-stone-700 pb-2">
        <button
          onClick={() => setActiveTab('standings')}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
            activeTab === 'standings'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
        >
          星取表・順位表
        </button>
        <button
          onClick={() => setActiveTab('matches')}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
            activeTab === 'matches'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
        >
          ラウンド別対局 ({totalRounds}回戦)
        </button>
      </div>

      {activeTab === 'standings' ? (
        <div className="flex flex-col gap-8">
          {/* 順位表 */}
          <div>
            <h3 className="text-base font-bold text-stone-800 dark:text-stone-100 mb-3 flex items-center gap-2">
              <span>🏆 現在の順位</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
              <table className="w-full text-sm text-left">
                <thead className="bg-stone-100 dark:bg-stone-800/80 text-stone-600 dark:text-stone-400 text-xs">
                  <tr>
                    <th className="py-2.5 px-4">順位</th>
                    <th className="py-2.5 px-4">名前</th>
                    <th className="py-2.5 px-4">棋力</th>
                    <th className="py-2.5 px-4 text-center">対局数</th>
                    <th className="py-2.5 px-4 text-center">勝</th>
                    <th className="py-2.5 px-4 text-center">負</th>
                    <th className="py-2.5 px-4 text-center">勝点</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                  {standings.map(s => (
                    <tr
                      key={s.participant.identity}
                      className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-bold">
                        {s.rank === 1 ? '🥇 1' : s.rank === 2 ? '🥈 2' : s.rank === 3 ? '🥉 3' : s.rank}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-stone-900 dark:text-stone-100">
                        {s.participant.name}
                      </td>
                      <td className="py-2.5 px-4 text-stone-500 text-xs">{s.participant.rank}</td>
                      <td className="py-2.5 px-4 text-center">{s.played}</td>
                      <td className="py-2.5 px-4 text-center font-bold text-emerald-600 dark:text-emerald-400">
                        {s.wins}
                      </td>
                      <td className="py-2.5 px-4 text-center text-rose-500">{s.losses}</td>
                      <td className="py-2.5 px-4 text-center font-bold">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 星取表マトリクス */}
          <div>
            <h3 className="text-base font-bold text-stone-800 dark:text-stone-100 mb-3 flex items-center gap-2">
              <span>📊 星取表（対戦成績）</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-stone-100 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300">
                  <tr>
                    <th className="py-2.5 px-3 text-left w-32 border-r dark:border-stone-700">選手</th>
                    {participants.map(p => (
                      <th key={p.identity} className="py-2.5 px-2 min-w-[70px] border-r dark:border-stone-700">
                        <div className="truncate max-w-[70px]">{p.name}</div>
                      </th>
                    ))}
                    <th className="py-2.5 px-3 w-16">勝-負</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                  {participants.map(rowP => {
                    const rowStanding = standings.find(s => s.participant.identity === rowP.identity);
                    return (
                      <tr key={rowP.identity} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                        <td className="py-2.5 px-3 text-left font-bold text-stone-800 dark:text-stone-200 border-r dark:border-stone-700 truncate max-w-[128px]">
                          {rowP.name}
                        </td>
                        {participants.map(colP => {
                          if (rowP.identity === colP.identity) {
                            return (
                              <td
                                key={colP.identity}
                                className="bg-stone-100/70 dark:bg-stone-800/60 border-r dark:border-stone-700"
                              >
                                -
                              </td>
                            );
                          }

                          const match = getMatchBetween(rowP.identity, colP.identity);
                          let resultIcon = '—';
                          let cellBg = '';

                          if (match?.winnerId) {
                            if (match.winnerId === rowP.identity) {
                              resultIcon = '○';
                              cellBg = 'text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/50 dark:bg-emerald-950/20';
                            } else {
                              resultIcon = '●';
                              cellBg = 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20';
                            }
                          } else if (match?.liveGameId) {
                            resultIcon = '対局中';
                            cellBg = 'text-amber-600 font-semibold';
                          }

                          return (
                            <td
                              key={colP.identity}
                              className={`py-2 px-1 border-r dark:border-stone-700 ${cellBg}`}
                              title={match?.resultDetail}
                            >
                              <div>{resultIcon}</div>
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 font-bold">
                          {rowStanding ? `${rowStanding.wins}-${rowStanding.losses}` : '0-0'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ラウンド別対局タブ */
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl border border-stone-200 dark:border-stone-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-500">回戦選択:</span>
              <div className="flex gap-1">
                {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(r)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                      selectedRound === r
                        ? 'bg-amber-500 text-white'
                        : 'bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    第{r}回戦
                  </button>
                ))}
              </div>
            </div>

            {isTeacher && onCreateRoundGames && (
              <button
                onClick={() => onCreateRoundGames(selectedRound)}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-white dark:bg-stone-700 dark:hover:bg-stone-600 rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                第{selectedRound}回戦の全対局を一括作成
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentRoundMatches.map(m => (
              <div
                key={m.id}
                className="bg-white dark:bg-stone-800 border rounded-xl p-4 shadow-sm border-stone-200 dark:border-stone-700 flex flex-col justify-between gap-3"
              >
                <div className="flex justify-between items-center text-xs text-stone-500 dark:text-stone-400 border-b pb-2 dark:border-stone-700">
                  <span>
                    {m.handicap > 0
                      ? `${m.handicap}子 (コミ${m.komi}目)`
                      : m.komi === 0.5
                      ? '先相先 (コミ半目)'
                      : `互先 (コミ${m.komi}目)`}
                  </span>
                  {m.resultDetail && (
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {m.resultDetail}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div
                    className={`flex justify-between items-center p-2 rounded-lg text-sm ${
                      m.winnerId === m.player1?.identity
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 font-bold text-emerald-800 dark:text-emerald-200'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-stone-900 dark:bg-stone-100 inline-block shrink-0" />
                      <span>{m.player1?.name}</span>
                    </div>
                    <span className="text-xs text-stone-500">{m.player1?.rank}</span>
                  </div>

                  <div
                    className={`flex justify-between items-center p-2 rounded-lg text-sm ${
                      m.winnerId === m.player2?.identity
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 font-bold text-emerald-800 dark:text-emerald-200'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-stone-400 bg-white inline-block shrink-0" />
                      <span>{m.player2?.name}</span>
                    </div>
                    <span className="text-xs text-stone-500">{m.player2?.rank}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t dark:border-stone-700">
                  {m.liveGameId && onSelectGame ? (
                    <button
                      onClick={() => onSelectGame(m.liveGameId!)}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold shadow-sm"
                    >
                      対局へ入る
                    </button>
                  ) : isTeacher && !m.winnerId && onCreateGameForMatch ? (
                    <button
                      onClick={() => onCreateGameForMatch(m)}
                      className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-white dark:bg-stone-700 rounded text-xs font-medium"
                    >
                      対局作成
                    </button>
                  ) : (
                    <div />
                  )}

                  {isTeacher && !m.winnerId && onSetMatchResult && (
                    <div className="flex gap-1 text-xs">
                      <button
                        onClick={() => onSetMatchResult(m.id, m.player1!.identity, '黒中押し勝ち')}
                        className="px-2 py-0.5 border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-[11px]"
                      >
                        黒勝
                      </button>
                      <button
                        onClick={() => onSetMatchResult(m.id, m.player2!.identity, '白中押し勝ち')}
                        className="px-2 py-0.5 border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-[11px]"
                      >
                        白勝
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
