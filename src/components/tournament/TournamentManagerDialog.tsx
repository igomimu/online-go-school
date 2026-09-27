import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trophy, X } from 'lucide-react';
import type { Student } from '../../types/classroom';
import type { GameClock } from '../../types/game';
import type {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentType,
} from '../../types/tournament';
import {
  createNewTournament,
  isLinkedGameId,
  matchResultFromGame,
  updateMatchResult,
} from '../../utils/tournament/pairing';
import {
  deleteTournament,
  getTournaments,
  loadTournaments,
  newerTournament,
  saveTournament,
} from '../../utils/tournament/tournamentStore';
import { fetchLiveGameResults } from '../../utils/liveGameApi';
import { identityMatchesPlayer, makeStudentIdentity } from '../../utils/identityUtils';
import { DEFAULT_BYOYOMI_TIME_SETTINGS, timeSettingsToClock, type TimeSettings } from '../../hooks/useGameClock';
import TimeControlPicker from '../TimeControlPicker';
import TournamentTree from './TournamentTree';
import RoundRobinTable from './RoundRobinTable';
import TournamentCelebration from './TournamentCelebration';

export interface TournamentGamePair {
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  handicap: number;
  komi: number;
  clock?: GameClock;
  ratingExcluded: boolean;
}

interface TournamentManagerDialogProps {
  classroomId?: string | null;
  classroomName?: string;
  isTeacher: boolean;
  students: Student[];
  connectedIdentities: string[];
  /** 教室の対局一覧。変わるたびに、大会の対局が終わっていないか確かめる */
  liveGames?: { id: string; status: string }[];
  onClose: () => void;
  onSelectGame?: (gameId: string) => void;
  /** 対局を作る。作れた対局の ID を pairs と同じ順で返す（作れなかったものは null） */
  onCreateGames?: (pairs: TournamentGamePair[]) => Promise<(string | null)[]>;
}

const inputClass = 'w-full bg-ink/5 text-ink border border-field-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent';
const primaryButton = 'rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-md border border-line px-3 py-1.5 text-sm text-ink transition-colors duration-150 hover:bg-raised';

/** 対局の黒白に入れる値。名簿の生徒は `sid:` 付きで入れる（ほかの対局作成と同じ形） */
function toPlayerIdentity(identity: string): string {
  return identity.startsWith('sid:') ? identity : makeStudentIdentity(identity);
}

function typeLabel(type: TournamentType): string {
  return type === 'single_elimination' ? 'トーナメント' : 'リーグ戦';
}

function timeControlLabel(t: TimeSettings | null | undefined): string {
  if (!t) return '持ち時間なし';
  const main = t.mainMinutes > 0 ? `${t.mainMinutes}分` : '';
  const byo = t.byoyomiEnabled ? `秒読み${t.byoyomiSeconds}秒×${t.byoyomiPeriods}回` : '';
  return [main, byo].filter(Boolean).join('・') || '持ち時間なし';
}

export default function TournamentManagerDialog({
  classroomId,
  classroomName,
  isTeacher,
  students,
  connectedIdentities,
  liveGames = [],
  onClose,
  onSelectGame,
  onCreateGames,
}: TournamentManagerDialogProps) {
  const roomId = classroomId || 'default';
  // 開いた直後は端末キャッシュを出し、アカウントから読めたら入れ替える
  const [tournaments, setTournaments] = useState<Tournament[]>(() => getTournaments(roomId));
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(
    () => getTournaments(roomId)[0]?.id ?? null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [celebrationWinner, setCelebrationWinner] = useState<TournamentParticipant | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // アカウントから読み終わった（または読めなかった）。勝敗の自動反映はこの後に始める
  const [loaded, setLoaded] = useState(false);
  const tournamentsRef = useRef(tournaments);
  useEffect(() => { tournamentsRef.current = tournaments; }, [tournaments]);

  // 新規作成フォームの状態
  const [name, setName] = useState('');
  const [type, setType] = useState<TournamentType>('round_robin');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [boardSize, setBoardSize] = useState<number>(19);
  const [autoHandicap, setAutoHandicap] = useState(true);
  const [useTimeControl, setUseTimeControl] = useState(true);
  const [timeControl, setTimeControl] = useState<TimeSettings>(DEFAULT_BYOYOMI_TIME_SETTINGS);

  useEffect(() => {
    let alive = true;
    loadTournaments(roomId)
      .then(list => {
        if (!alive) return;
        // 読んでいる間に画面で変えた大会は、新しい方を残す
        const current = new Map(tournamentsRef.current.map(t => [t.id, t]));
        const merged = list.map(t => (current.has(t.id) ? newerTournament(current.get(t.id)!, t) : t));
        const ids = new Set(merged.map(t => t.id));
        const next = [...merged, ...tournamentsRef.current.filter(t => !ids.has(t.id))];
        tournamentsRef.current = next;
        setTournaments(next);
        setActiveTournamentId(prev => (prev && next.some(t => t.id === prev) ? prev : next[0]?.id ?? null));
      })
      .catch(err => {
        console.warn('[tournament] 大会を読み込めませんでした', err);
        if (alive) setNotice('大会をアカウントから読み込めませんでした。この端末に残っている分を表示しています。');
      })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [roomId]);

  // 画面にはすぐ出し、アカウントへ保存する。失敗したら知らせる（端末には残る）
  const persist = useCallback((changed: Tournament) => {
    const updated = { ...changed, updatedAt: new Date().toISOString() };
    tournamentsRef.current = tournamentsRef.current.map(t => (t.id === updated.id ? updated : t));
    setTournaments(tournamentsRef.current);
    saveTournament(updated).catch(err => {
      console.warn('[tournament] 大会を保存できませんでした', err);
      setNotice('大会をアカウントへ保存できませんでした。通信を確認してください（この端末には残っています）。');
    });
  }, []);

  const showWinnerIfCompleted = useCallback((before: Tournament, after: Tournament) => {
    if (before.status !== 'completed' && after.status === 'completed' && after.winnerId) {
      const winner = after.participants.find(p => p.identity === after.winnerId);
      if (winner) setCelebrationWinner(winner);
    }
  }, []);

  // 新規作成ダイアログを開いた際、接続中の生徒を初期選択
  const startCreate = () => {
    setName(`${classroomName || '囲碁教室'} 第${tournaments.length + 1}回 大会`);
    setSelectedStudentIds(
      students
        .filter(s => connectedIdentities.some(connId => identityMatchesPlayer(connId, s.id)))
        .map(s => s.id),
    );
    setIsCreating(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const participants: TournamentParticipant[] = selectedStudentIds
      .map(id => students.find(s => s.id === id))
      .filter((s): s is Student => !!s)
      .map((s, idx) => ({
        identity: s.id,
        name: s.name || s.id,
        rank: s.rank || '初段',
        seed: idx + 1,
      }));

    if (participants.length < 2) {
      alert('参加者は最低2名選んでください');
      return;
    }

    const newTournament = createNewTournament({
      id: `t_${Date.now()}`,
      classroomId: roomId,
      name: name.trim(),
      type,
      participants,
      settings: {
        boardSize,
        autoHandicap,
        timeControl: useTimeControl ? timeControl : null,
      },
    });

    tournamentsRef.current = [newTournament, ...tournamentsRef.current];
    setTournaments(tournamentsRef.current);
    setActiveTournamentId(newTournament.id);
    setIsCreating(false);
    saveTournament(newTournament).catch(err => {
      console.warn('[tournament] 大会を保存できませんでした', err);
      setNotice('大会をアカウントへ保存できませんでした。通信を確認してください（この端末には残っています）。');
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('この大会を削除しますか？')) return;
    const updated = tournaments.filter(t => t.id !== id);
    tournamentsRef.current = updated;
    setTournaments(updated);
    if (activeTournamentId === id) {
      setActiveTournamentId(updated.length > 0 ? updated[0].id : null);
    }
    deleteTournament(id).catch(err => {
      console.warn('[tournament] 大会を削除できませんでした', err);
      setNotice('大会をアカウントから削除できませんでした。通信を確認してください。');
    });
  };

  const activeTournament = tournaments.find(t => t.id === activeTournamentId);

  // 勝敗の手動登録
  const handleSetMatchResult = (matchId: string, winnerId: string, resultDetail: string) => {
    if (!activeTournament) return;
    const updated = updateMatchResult(activeTournament, matchId, winnerId, resultDetail);
    persist(updated);
    showWinnerIfCompleted(activeTournament, updated);
  };

  // 対局を作り、作れた対局の ID を対戦に結び付ける（終局したら勝敗を自動で反映する）
  const createGames = async (tournament: Tournament, targets: TournamentMatch[]) => {
    if (!onCreateGames || targets.length === 0 || busy) return;
    const clock = tournament.settings.timeControl
      ? timeSettingsToClock(tournament.settings.timeControl)
      : undefined;
    const pairs: TournamentGamePair[] = targets.map(m => ({
      blackPlayer: toPlayerIdentity(m.player1!.identity),
      whitePlayer: toPlayerIdentity(m.player2!.identity),
      boardSize: m.boardSize,
      handicap: m.handicap,
      komi: m.komi,
      clock,
      // 大会の対局は道場ランクの連勝・連敗に数えない（2026-09-27）
      ratingExcluded: true,
    }));

    setBusy(true);
    let ids: (string | null)[] = [];
    try {
      ids = await onCreateGames(pairs);
    } catch (err) {
      console.warn('[tournament] 対局を作れませんでした', err);
    } finally {
      setBusy(false);
    }

    const idByMatch = new Map(targets.map((m, i) => [m.id, ids[i] ?? null]));
    const latest = tournamentsRef.current.find(t => t.id === tournament.id) ?? tournament;
    const updated: Tournament = {
      ...latest,
      status: latest.status === 'setup' ? 'in_progress' : latest.status,
      matches: latest.matches.map(m => {
        const id = idByMatch.get(m.id);
        return id ? { ...m, liveGameId: id } : m;
      }),
    };
    persist(updated);

    const failed = targets.filter(m => !idByMatch.get(m.id)).length;
    setNotice(failed > 0 ? `${failed}局を作れませんでした。同じ生徒の対局が進行中でないか確かめてください。` : null);
  };

  const handleCreateGameForMatch = (match: TournamentMatch) => {
    if (!activeTournament || !match.player1 || !match.player2) return;
    void createGames(activeTournament, [match]);
  };

  const handleCreateRoundGames = (roundNumber: number) => {
    if (!activeTournament) return;
    const roundMatches = activeTournament.matches.filter(
      m => m.round === roundNumber && !m.winnerId && !m.liveGameId && m.player1 && m.player2,
    );
    if (roundMatches.length === 0) {
      alert('作成対象の未対局がありません');
      return;
    }
    void createGames(activeTournament, roundMatches);
  };

  // 結び付いた対局が終わっていたら勝敗を反映する。教室の対局一覧が変わるたび（終局で一覧から消える）
  // と、開いた直後に確かめる。取消・持碁などで勝敗が無ければ結び付きを外し、作り直せるようにする
  const pendingGameIds = useMemo(() => tournaments
    .flatMap(t => t.matches)
    .filter(m => !m.winnerId && isLinkedGameId(m.liveGameId))
    .map(m => m.liveGameId!)
    .sort(), [tournaments]);
  const pendingKey = pendingGameIds.join(',');
  const liveSignal = liveGames.map(g => `${g.id}:${g.status}`).join(',');

  useEffect(() => {
    if (!loaded || !pendingKey) return;
    let alive = true;
    fetchLiveGameResults(pendingKey.split(','))
      .then(rows => {
        if (!alive) return;
        const byId = new Map(rows.map(r => [r.id, r]));
        for (const before of tournamentsRef.current) {
          let updated = before;
          for (const m of before.matches) {
            if (m.winnerId || !isLinkedGameId(m.liveGameId)) continue;
            const game = byId.get(m.liveGameId);
            if (!game) continue;
            const outcome = matchResultFromGame(m, game, identityMatchesPlayer);
            if (!outcome) continue;
            if (outcome.kind === 'decided') {
              updated = updateMatchResult(updated, m.id, outcome.winnerId, outcome.resultDetail);
            } else {
              updated = {
                ...updated,
                matches: updated.matches.map(x => (x.id === m.id ? { ...x, liveGameId: undefined } : x)),
              };
            }
          }
          if (updated !== before) {
            persist(updated);
            if (before.id === activeTournamentId) showWinnerIfCompleted(before, updated);
          }
        }
      })
      .catch(err => console.warn('[tournament] 対局の結果を確かめられませんでした', err));
    return () => { alive = false; };
  }, [loaded, pendingKey, liveSignal, persist, showWinnerIfCompleted, activeTournamentId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="dialog" aria-label="大会">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-lg">
        {/* ヘッダー */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Trophy className="h-5 w-5 shrink-0 text-accent-text" strokeWidth={1.5} />
            <div className="min-w-0">
              <h2 className="text-base font-bold">大会</h2>
              <p className="truncate text-xs text-muted">
                {classroomId ? `教室: ${classroomName || classroomId}` : '全大会管理'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isTeacher && !isCreating && (
              <button onClick={startCreate} className={`${primaryButton} flex items-center gap-1`}>
                <Plus className="h-4 w-4" />
                新しい大会
              </button>
            )}
            <button onClick={onClose} aria-label="閉じる" className="rounded-md p-1.5 text-muted transition-colors duration-150 hover:bg-raised hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {notice && (
          <div role="alert" className="flex items-start gap-2 border-b border-alert/40 bg-surface px-4 py-2 text-sm text-alert-text">
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice(null)} aria-label="知らせを閉じる" className="shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* メインエリア */}
        <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
          {/* 左: 大会一覧（狭い画面では上に並べる） */}
          {!isCreating && tournaments.length > 0 && (
            <div className="flex max-h-28 w-full shrink-0 flex-col gap-1 overflow-y-auto border-b border-line p-2 sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r">
              <div className="px-2 py-1 text-xs font-semibold text-muted">大会一覧</div>
              {tournaments.map(t => (
                <div
                  key={t.id}
                  onClick={() => setActiveTournamentId(t.id)}
                  className={`cursor-pointer rounded-md border px-2.5 py-2 text-xs transition-colors duration-150 ${
                    activeTournamentId === t.id ? 'border-accent bg-raised' : 'border-transparent hover:bg-raised'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-semibold text-ink">{t.name}</span>
                    {isTeacher && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(t.id);
                        }}
                        className="shrink-0 text-muted hover:text-alert-text"
                        title="削除"
                        aria-label={`${t.name}を削除`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                    <span>{typeLabel(t.type)}</span>
                    <span>{t.participants.length}名</span>
                    {t.status === 'completed' && <span className="ml-auto font-semibold text-accent-text">終了</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 右: 本体 */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {isCreating ? (
              <div className="mx-auto w-full max-w-2xl p-6">
                <h3 className="mb-5 text-lg font-bold">新しい大会</h3>
                <form onSubmit={handleCreateSubmit} className="flex flex-col gap-5">
                  <div>
                    <label htmlFor="tournament-name" className="mb-1 block text-xs font-semibold text-muted">大会名</label>
                    <input
                      id="tournament-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      className={inputClass}
                    />
                  </div>

                  <fieldset>
                    <legend className="mb-2 text-xs font-semibold text-muted">形式</legend>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        ['round_robin', 'リーグ戦（総当たり）', '全員が同じ数だけ打ち、星取表で順位を決めます。'],
                        ['single_elimination', 'トーナメント（勝ち残り）', '勝った人が次の回戦へ進みます。'],
                      ] as const).map(([value, title, desc]) => (
                        <label
                          key={value}
                          className={`cursor-pointer rounded-md border p-3 transition-colors duration-150 ${
                            type === value ? 'border-accent bg-raised' : 'border-line hover:bg-raised'
                          }`}
                        >
                          <input
                            type="radio"
                            name="tournament-type"
                            value={value}
                            checked={type === value}
                            onChange={() => setType(value)}
                            className="sr-only"
                          />
                          <div className="mb-1 text-sm font-semibold">{title}</div>
                          <div className="text-xs text-muted">{desc}</div>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="tournament-board-size" className="mb-1 block text-xs font-semibold text-muted">路数</label>
                      <select
                        id="tournament-board-size"
                        value={boardSize}
                        onChange={e => setBoardSize(Number(e.target.value))}
                        className={inputClass}
                      >
                        <option value={19}>19路盤</option>
                        <option value={13}>13路盤</option>
                        <option value={9}>9路盤</option>
                      </select>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-muted">手合割</span>
                      <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={autoHandicap}
                          onChange={e => setAutoHandicap(e.target.checked)}
                          className="h-4 w-4 accent-[var(--color-accent)]"
                        />
                        段級位差から置石・コミを決める
                      </label>
                    </div>
                  </div>

                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-xs font-semibold text-muted">持ち時間</legend>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        data-testid="tournament-use-time-control"
                        checked={useTimeControl}
                        onChange={e => setUseTimeControl(e.target.checked)}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                      />
                      持ち時間を使う
                    </label>
                    {useTimeControl && (
                      <TimeControlPicker value={timeControl} onChange={setTimeControl} variant="dark" />
                    )}
                  </fieldset>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted">
                        参加する生徒（{selectedStudentIds.length}名）
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds(students.map(s => s.id))}
                        className="text-xs text-accent-text hover:underline"
                      >
                        全員選ぶ
                      </button>
                    </div>

                    <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-line p-2">
                      {students.map(s => {
                        const isConnected = connectedIdentities.some(connId => identityMatchesPlayer(connId, s.id));
                        const isChecked = selectedStudentIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                              isChecked ? 'border-accent bg-raised' : 'border-line'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedStudentIds(prev => [...prev, s.id]);
                                } else {
                                  setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                                }
                              }}
                              className="accent-[var(--color-accent)]"
                            />
                            <div className="min-w-0 flex-1 truncate">
                              <span className="font-semibold">{s.name || s.id}</span>
                              <span className="ml-1 text-muted">（{s.rank || '初段'}）</span>
                            </div>
                            {isConnected && <span className="text-[11px] text-accent-text">入室中</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-line pt-4">
                    <button type="button" onClick={() => setIsCreating(false)} className={secondaryButton}>
                      キャンセル
                    </button>
                    <button type="submit" className={primaryButton}>
                      大会を作る
                    </button>
                  </div>
                </form>
              </div>
            ) : activeTournament ? (
              <div className="flex h-full flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-base font-bold">
                      <span className="truncate">{activeTournament.name}</span>
                      <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-xs font-medium text-muted">
                        {typeLabel(activeTournament.type)}
                      </span>
                    </h3>
                    <div className="mt-0.5 text-xs text-muted">
                      {activeTournament.participants.length}名 / {activeTournament.settings.boardSize}路 /{' '}
                      {activeTournament.settings.autoHandicap ? '手合割あり' : '互先'} /{' '}
                      {timeControlLabel(activeTournament.settings.timeControl)}
                      {busy && ' / 対局を作っています…'}
                    </div>
                  </div>

                  {activeTournament.winnerId && (
                    <button
                      onClick={() => {
                        const winner = activeTournament.participants.find(
                          p => p.identity === activeTournament.winnerId,
                        );
                        if (winner) setCelebrationWinner(winner);
                      }}
                      className={`${secondaryButton} flex shrink-0 items-center gap-1`}
                    >
                      <Trophy className="h-4 w-4 text-accent-text" strokeWidth={1.5} />
                      優勝者
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {activeTournament.type === 'single_elimination' ? (
                    <TournamentTree
                      tournament={activeTournament}
                      isTeacher={isTeacher}
                      onSelectGame={onSelectGame}
                      onCreateGameForMatch={onCreateGames ? handleCreateGameForMatch : undefined}
                      onSetMatchResult={handleSetMatchResult}
                    />
                  ) : (
                    <RoundRobinTable
                      tournament={activeTournament}
                      isTeacher={isTeacher}
                      onSelectGame={onSelectGame}
                      onCreateGameForMatch={onCreateGames ? handleCreateGameForMatch : undefined}
                      onCreateRoundGames={onCreateGames ? handleCreateRoundGames : undefined}
                      onSetMatchResult={handleSetMatchResult}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-start justify-center gap-3 p-8">
                <h3 className="text-base font-bold">大会はまだありません</h3>
                <p className="max-w-sm text-sm text-muted">
                  リーグ戦やトーナメントを作ると、対戦表から対局を作れます。終局すると勝敗が自動で入ります。
                </p>
                {isTeacher && (
                  <button onClick={startCreate} className={`${primaryButton} flex items-center gap-1`}>
                    <Plus className="h-4 w-4" />
                    最初の大会を作る
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {celebrationWinner && (
        <TournamentCelebration
          winner={celebrationWinner}
          tournamentName={activeTournament?.name || '囲碁大会'}
          onClose={() => setCelebrationWinner(null)}
        />
      )}
    </div>
  );
}
