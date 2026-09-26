import { useState, useEffect } from 'react';
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
  updateMatchResult,
} from '../../utils/tournament/pairing';
import {
  getTournaments,
  saveTournament,
  deleteTournament,
} from '../../utils/tournament/tournamentStore';
import { identityMatchesPlayer } from '../../utils/identityUtils';
import TournamentTree from './TournamentTree';
import RoundRobinTable from './RoundRobinTable';
import TournamentCelebration from './TournamentCelebration';

interface TournamentManagerDialogProps {
  classroomId?: string | null;
  classroomName?: string;
  isTeacher: boolean;
  students: Student[];
  connectedIdentities: string[];
  onClose: () => void;
  onSelectGame?: (gameId: string) => void;
  onCreateGames?: (
    pairs: {
      blackPlayer: string;
      whitePlayer: string;
      boardSize: number;
      handicap: number;
      komi: number;
      clock?: GameClock;
    }[],
  ) => void;
}

export default function TournamentManagerDialog({
  classroomId,
  classroomName,
  isTeacher,
  students,
  connectedIdentities,
  onClose,
  onSelectGame,
  onCreateGames,
}: TournamentManagerDialogProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [celebrationWinner, setCelebrationWinner] = useState<TournamentParticipant | null>(null);

  // 新規作成フォームの状態
  const [name, setName] = useState('');
  const [type, setType] = useState<TournamentType>('round_robin');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [boardSize, setBoardSize] = useState<number>(19);
  const [autoHandicap, setAutoHandicap] = useState(true);

  // 大会一覧の読み込み
  const reloadTournaments = () => {
    const list = getTournaments(classroomId);
    setTournaments(list);
    if (list.length > 0 && !activeTournamentId) {
      setActiveTournamentId(list[0].id);
    }
  };

  useEffect(() => {
    reloadTournaments();
  }, [classroomId]);

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
      classroomId: classroomId || 'default',
      name: name.trim(),
      type,
      participants,
      settings: {
        boardSize,
        autoHandicap,
      },
    });

    saveTournament(newTournament);
    reloadTournaments();
    setActiveTournamentId(newTournament.id);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('この大会を削除しますか？')) return;
    deleteTournament(id);
    const updated = tournaments.filter(t => t.id !== id);
    setTournaments(updated);
    if (activeTournamentId === id) {
      setActiveTournamentId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const activeTournament = tournaments.find(t => t.id === activeTournamentId);

  // 勝敗の手動登録
  const handleSetMatchResult = (matchId: string, winnerId: string, resultDetail: string) => {
    if (!activeTournament) return;
    const updated = updateMatchResult(activeTournament, matchId, winnerId, resultDetail);
    saveTournament(updated);
    setTournaments(prev => prev.map(t => (t.id === updated.id ? updated : t)));

    // 優勝者が決定した場合
    if (updated.status === 'completed' && updated.winnerId) {
      const winner = updated.participants.find(p => p.identity === updated.winnerId);
      if (winner) {
        setCelebrationWinner(winner);
      }
    }
  };

  // 単一マッチの対局作成
  const handleCreateGameForMatch = (match: TournamentMatch) => {
    if (!onCreateGames || !match.player1 || !match.player2 || !activeTournament) return;

    onCreateGames([
      {
        blackPlayer: match.player1.identity,
        whitePlayer: match.player2.identity,
        boardSize: match.boardSize,
        handicap: match.handicap,
        komi: match.komi,
      },
    ]);

    // マッチに対局作成フラグを設定（仮のID）
    const updatedMatches = activeTournament.matches.map(m =>
      m.id === match.id ? { ...m, liveGameId: `created_${Date.now()}` } : m,
    );
    const updated = { ...activeTournament, matches: updatedMatches };
    saveTournament(updated);
    setTournaments(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  };

  // ラウンド一括対局作成
  const handleCreateRoundGames = (roundNumber: number) => {
    if (!onCreateGames || !activeTournament) return;
    const roundMatches = activeTournament.matches.filter(
      m => m.round === roundNumber && !m.winnerId && !m.liveGameId && m.player1 && m.player2,
    );

    if (roundMatches.length === 0) {
      alert('作成対象の未対局がありません');
      return;
    }

    const pairs = roundMatches.map(m => ({
      blackPlayer: m.player1!.identity,
      whitePlayer: m.player2!.identity,
      boardSize: m.boardSize,
      handicap: m.handicap,
      komi: m.komi,
    }));

    onCreateGames(pairs);

    const matchIds = new Set(roundMatches.map(m => m.id));
    const updatedMatches = activeTournament.matches.map(m =>
      matchIds.has(m.id) ? { ...m, liveGameId: `created_${Date.now()}_${m.id}` } : m,
    );
    const updated = { ...activeTournament, matches: updatedMatches };
    saveTournament(updated);
    setTournaments(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <h2 className="text-lg font-bold">大会システム（トーナメント・リーグ戦）</h2>
              <p className="text-xs text-stone-500">
                {classroomId ? `教室: ${classroomName || classroomId}` : '全大会管理'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isTeacher && !isCreating && (
              <button
                onClick={startCreate}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                ＋ 新しい大会を開催
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* メインエリア */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左サイドバー: 大会一覧 */}
          {!isCreating && tournaments.length > 0 && (
            <div className="w-64 border-r border-stone-200 dark:border-stone-800 p-3 flex flex-col gap-2 overflow-y-auto bg-stone-50/50 dark:bg-stone-950/20">
              <div className="text-xs font-bold text-stone-500 px-2 py-1">開催中の大会</div>
              {tournaments.map(t => (
                <div
                  key={t.id}
                  onClick={() => setActiveTournamentId(t.id)}
                  className={`p-2.5 rounded-xl cursor-pointer text-xs transition-all border ${
                    activeTournamentId === t.id
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 shadow-sm'
                      : 'border-transparent hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold truncate text-stone-900 dark:text-stone-100">
                      {t.name}
                    </span>
                    {isTeacher && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(t.id);
                        }}
                        className="text-stone-400 hover:text-rose-500 ml-1"
                        title="削除"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-500">
                    <span className="px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-700 font-medium">
                      {t.type === 'single_elimination' ? 'トーナメント' : 'リーグ戦'}
                    </span>
                    <span>{t.participants.length}名</span>
                    {t.status === 'completed' && (
                      <span className="text-emerald-600 font-bold ml-auto">終了</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 右コンテンツ */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            {isCreating ? (
              /* 新規作成画面 */
              <div className="p-8 max-w-2xl mx-auto w-full">
                <h3 className="text-xl font-bold mb-6">新規大会の作成</h3>
                <form onSubmit={handleCreateSubmit} className="flex flex-col gap-6">
                  <div>
                    <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 mb-1">
                      大会名
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      className="w-full px-3 py-2 border rounded-lg dark:bg-stone-800 dark:border-stone-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 mb-2">
                      大会形式
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div
                        onClick={() => setType('round_robin')}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          type === 'round_robin'
                            ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                            : 'border-stone-200 dark:border-stone-700 hover:border-stone-400'
                        }`}
                      >
                        <div className="font-bold mb-1">📊 リーグ戦（総当たり）</div>
                        <div className="text-xs text-stone-500">
                          全員が最後まで複数局打てる方式。星取表で順位を競います。
                        </div>
                      </div>

                      <div
                        onClick={() => setType('single_elimination')}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          type === 'single_elimination'
                            ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                            : 'border-stone-200 dark:border-stone-700 hover:border-stone-400'
                        }`}
                      >
                        <div className="font-bold mb-1">🌳 トーナメント（勝ち残り）</div>
                        <div className="text-xs text-stone-500">
                          勝ち上がりの樹形図（ブラケット）。決勝戦に向けて盛り上がります。
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 mb-1">
                        路数
                      </label>
                      <select
                        value={boardSize}
                        onChange={e => setBoardSize(Number(e.target.value))}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-stone-800 dark:border-stone-700"
                      >
                        <option value={19}>19路盤</option>
                        <option value={13}>13路盤</option>
                        <option value={9}>9路盤</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 mb-1">
                        手合割
                      </label>
                      <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoHandicap}
                          onChange={e => setAutoHandicap(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-500"
                        />
                        <span>段級位差から置石・コミを自動計算</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-bold text-stone-600 dark:text-stone-400">
                        参加生徒の選択 ({selectedStudentIds.length}名選択中)
                      </label>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds(students.map(s => s.id))}
                        className="text-xs text-amber-600 hover:underline"
                      >
                        全員選択
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto border rounded-xl p-3 grid grid-cols-2 gap-2 dark:border-stone-700">
                      {students.map(s => {
                        const isConnected = connectedIdentities.some(connId => identityMatchesPlayer(connId, s.id));
                        const isChecked = selectedStudentIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs ${
                              isChecked
                                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700'
                                : 'border-stone-200 dark:border-stone-700'
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
                              className="rounded text-amber-500"
                            />
                            <div className="truncate flex-1">
                              <span className="font-bold">{s.name || s.id}</span>
                              <span className="text-stone-400 ml-1">({s.rank || '初段'})</span>
                            </div>
                            {isConnected && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="接続中" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="px-4 py-2 border rounded-lg text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-sm shadow-md"
                    >
                      大会を作成して開始
                    </button>
                  </div>
                </form>
              </div>
            ) : activeTournament ? (
              /* 大会進行画面 */
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center bg-stone-50/50 dark:bg-stone-900">
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <span>{activeTournament.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold">
                        {activeTournament.type === 'single_elimination' ? 'トーナメント' : 'リーグ戦'}
                      </span>
                    </h3>
                    <div className="text-xs text-stone-500 mt-0.5">
                      参加者: {activeTournament.participants.length}名 / {activeTournament.settings.boardSize}路盤 /{' '}
                      {activeTournament.settings.autoHandicap ? '手合割自動' : '互先'}
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
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1"
                    >
                      <span>🏆</span>
                      <span>優勝者を表示</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {activeTournament.type === 'single_elimination' ? (
                    <TournamentTree
                      tournament={activeTournament}
                      isTeacher={isTeacher}
                      onSelectGame={onSelectGame}
                      onCreateGameForMatch={handleCreateGameForMatch}
                      onSetMatchResult={handleSetMatchResult}
                    />
                  ) : (
                    <RoundRobinTable
                      tournament={activeTournament}
                      isTeacher={isTeacher}
                      onSelectGame={onSelectGame}
                      onCreateGameForMatch={handleCreateGameForMatch}
                      onCreateRoundGames={handleCreateRoundGames}
                      onSetMatchResult={handleSetMatchResult}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* 大会がない時 */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="text-5xl mb-4">🏆</div>
                <h3 className="text-lg font-bold mb-2">大会がまだ作成されていません</h3>
                <p className="text-sm text-stone-500 max-w-sm mb-6">
                  トーナメント戦や総当たりリーグ戦を作成して、生徒同士の対局イベントを開催できます。
                </p>
                {isTeacher && (
                  <button
                    onClick={startCreate}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm shadow-md"
                  >
                    ＋ 最初の大会を作成する
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
