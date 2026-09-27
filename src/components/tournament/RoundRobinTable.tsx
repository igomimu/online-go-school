import { useState } from 'react';
import type { Tournament, TournamentMatch } from '../../types/tournament';
import { calculateRoundRobinStandings, handicapLabel, isLinkedGameId } from '../../utils/tournament/pairing';
import { MatchActions, MatchPlayer } from './matchParts';

interface RoundRobinTableProps {
  tournament: Tournament;
  isTeacher: boolean;
  onSelectGame?: (gameId: string) => void;
  onCreateGameForMatch?: (match: TournamentMatch) => void;
  onCreateRoundGames?: (roundNumber: number) => void;
  onSetMatchResult?: (matchId: string, winnerId: string, resultDetail: string) => void;
}

const tabClass = (active: boolean) =>
  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${
    active ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-raised hover:text-ink'
  }`;

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
    <div className="flex flex-col gap-5 p-4">
      {/* タブ切り替え */}
      <div className="flex gap-1 overflow-x-auto border-b border-line pb-2">
        <button onClick={() => setActiveTab('standings')} className={tabClass(activeTab === 'standings')}>
          星取表・順位
        </button>
        <button onClick={() => setActiveTab('matches')} className={tabClass(activeTab === 'matches')}>
          ラウンド別対局 ({totalRounds}回戦)
        </button>
      </div>

      {activeTab === 'standings' ? (
        <div className="flex flex-col gap-6">
          {/* 順位表 */}
          <section>
            <h3 className="mb-2 text-sm font-bold">順位</h3>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-raised text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">順位</th>
                    <th className="px-3 py-2">名前</th>
                    <th className="px-3 py-2">棋力</th>
                    <th className="px-3 py-2 text-center">対局数</th>
                    <th className="px-3 py-2 text-center">勝</th>
                    <th className="px-3 py-2 text-center">負</th>
                    <th className="px-3 py-2 text-center">勝点</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {standings.map(s => (
                    <tr key={s.participant.identity}>
                      <td className="px-3 py-2 font-bold tabular-nums">{s.rank}</td>
                      <td className="px-3 py-2 font-medium">{s.participant.name}</td>
                      <td className="px-3 py-2 text-xs text-muted">{s.participant.rank}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.played}</td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums">{s.wins}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-muted">{s.losses}</td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 星取表 */}
          <section>
            <h3 className="mb-2 text-sm font-bold">星取表</h3>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-center text-xs">
                <thead className="bg-raised text-muted">
                  <tr>
                    <th className="w-32 border-r border-line px-3 py-2 text-left">選手</th>
                    {participants.map(p => (
                      <th key={p.identity} className="min-w-[70px] border-r border-line px-2 py-2">
                        <div className="max-w-[70px] truncate">{p.name}</div>
                      </th>
                    ))}
                    <th className="w-16 px-3 py-2">勝-負</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {participants.map(rowP => {
                    const rowStanding = standings.find(s => s.participant.identity === rowP.identity);
                    return (
                      <tr key={rowP.identity}>
                        <td className="max-w-[128px] truncate border-r border-line px-3 py-2 text-left font-semibold">
                          {rowP.name}
                        </td>
                        {participants.map(colP => {
                          if (rowP.identity === colP.identity) {
                            return <td key={colP.identity} className="border-r border-line bg-raised text-muted">-</td>;
                          }

                          const match = getMatchBetween(rowP.identity, colP.identity);
                          let mark = '—';
                          let cls = 'text-muted';
                          if (match?.winnerId) {
                            if (match.winnerId === rowP.identity) {
                              mark = '○';
                              cls = 'font-bold text-ink';
                            } else {
                              mark = '●';
                              cls = 'text-muted';
                            }
                          } else if (isLinkedGameId(match?.liveGameId)) {
                            mark = '対局中';
                            cls = 'font-semibold text-accent-text';
                          }

                          return (
                            <td key={colP.identity} className={`border-r border-line px-1 py-2 ${cls}`} title={match?.resultDetail}>
                              {mark}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 font-bold tabular-nums">
                          {rowStanding ? `${rowStanding.wins}-${rowStanding.losses}` : '0-0'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        /* ラウンド別対局 */
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-raised p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted">回戦</span>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
                  <button key={r} onClick={() => setSelectedRound(r)} className={tabClass(selectedRound === r)}>
                    第{r}回戦
                  </button>
                ))}
              </div>
            </div>

            {isTeacher && onCreateRoundGames && (
              <button
                onClick={() => onCreateRoundGames(selectedRound)}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors duration-150 hover:opacity-90"
              >
                第{selectedRound}回戦の全対局を一括作成
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {currentRoundMatches.map(m => (
              <div key={m.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
                <div className="flex items-center justify-between border-b border-line pb-1.5 text-xs text-muted">
                  <span>{handicapLabel(m)}</span>
                  {m.resultDetail && <span className="font-semibold text-ink">{m.resultDetail}</span>}
                </div>
                <MatchPlayer player={m.player1} color="black" winnerId={m.winnerId} />
                <MatchPlayer player={m.player2} color="white" winnerId={m.winnerId} />
                <MatchActions
                  match={m}
                  isTeacher={isTeacher}
                  onSelectGame={onSelectGame}
                  onCreateGameForMatch={onCreateGameForMatch}
                  onSetMatchResult={onSetMatchResult}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
