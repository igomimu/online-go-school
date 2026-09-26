import type {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentSettings,
  TournamentType,
  RoundRobinStanding,
} from '../../types/tournament';
import { suggestHandicap } from '../../types/classroom';

/** 2人の手合割（黒番・白番、置石、コミ）を決定する */
export function determineMatchHandicap(
  p1: TournamentParticipant,
  p2: TournamentParticipant,
  autoHandicap: boolean,
): {
  black: TournamentParticipant;
  white: TournamentParticipant;
  handicap: number;
  komi: number;
} {
  if (!autoHandicap) {
    // 互先
    return { black: p1, white: p2, handicap: 0, komi: 6.5 };
  }

  const h1 = suggestHandicap(p1.rank, p2.rank);
  const h2 = suggestHandicap(p2.rank, p1.rank);

  // h1: p1が黒（p1の方が弱いか互先）
  // h2: p2が黒（p2の方が弱いか互先）
  if (h1.handicap > 0 || (h1.handicap === 0 && h1.komi < 6.5)) {
    // p1がハンデをもらう（黒番）
    return { black: p1, white: p2, handicap: h1.handicap, komi: h1.komi };
  } else if (h2.handicap > 0 || (h2.handicap === 0 && h2.komi < 6.5)) {
    // p2がハンデをもらう（黒番）
    return { black: p2, white: p1, handicap: h2.handicap, komi: h2.komi };
  }

  // 同格・互先
  return { black: p1, white: p2, handicap: 0, komi: 6.5 };
}

/** 2の累乗で最も近い以上の数を返す（最小4） */
export function getBracketSize(participantCount: number): number {
  let size = 4;
  while (size < participantCount) {
    size *= 2;
  }
  return size;
}

/**
 * 標準的なトーナメントシード配置を生成する
 * 例: size=8 -> [1, 8, 4, 5, 2, 7, 3, 6] (1-indexed)
 */
export function generateSeedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2;
    const nextOrder: number[] = [];
    for (const seed of order) {
      nextOrder.push(seed);
      nextOrder.push(nextSize + 1 - seed);
    }
    order = nextOrder;
  }
  return order;
}

/**
 * トーナメント（勝ち残り戦）の全対戦枠を生成する
 */
export function generateSingleEliminationMatches(
  participants: TournamentParticipant[],
  settings: TournamentSettings,
): { matches: TournamentMatch[]; totalRounds: number } {
  const count = participants.length;
  if (count < 2) return { matches: [], totalRounds: 0 };

  const bracketSize = getBracketSize(count);
  const totalRounds = Math.log2(bracketSize);
  const matches: TournamentMatch[] = [];

  // シード順にスロットを割り当て
  const seedOrder = generateSeedOrder(bracketSize);
  const slots: (TournamentParticipant | null)[] = seedOrder.map(seed => {
    return participants[seed - 1] || null;
  });

  // ラウンドごとのマッチIDマップ: round -> matchIndex -> id
  const matchIdMap = new Map<string, string>();
  for (let r = 1; r <= totalRounds; r++) {
    const matchCount = bracketSize / Math.pow(2, r);
    for (let m = 0; m < matchCount; m++) {
      matchIdMap.set(`${r}_${m}`, `m_${r}_${m}`);
    }
  }

  // 1回戦から決勝までを生成
  for (let r = 1; r <= totalRounds; r++) {
    const matchCount = bracketSize / Math.pow(2, r);
    for (let m = 0; m < matchCount; m++) {
      const matchId = matchIdMap.get(`${r}_${m}`)!;
      const nextMatchId = r < totalRounds ? matchIdMap.get(`${r + 1}_${Math.floor(m / 2)}`) : undefined;
      const nextMatchSlot = r < totalRounds ? ((m % 2 === 0 ? 1 : 2) as 1 | 2) : undefined;

      if (r === 1) {
        const p1 = slots[m * 2] || null;
        const p2 = slots[m * 2 + 1] || null;

        let handicap = 0;
        let komi = 6.5;
        let isBye = false;
        let winnerId: string | null = null;
        let resultDetail: string | undefined = undefined;

        if (p1 && !p2) {
          // p1の不戦勝
          isBye = true;
          winnerId = p1.identity;
          resultDetail = '不戦勝';
        } else if (!p1 && p2) {
          // p2の不戦勝
          isBye = true;
          winnerId = p2.identity;
          resultDetail = '不戦勝';
        } else if (p1 && p2) {
          const h = determineMatchHandicap(p1, p2, settings.autoHandicap);
          handicap = h.handicap;
          komi = h.komi;
        }

        matches.push({
          id: matchId,
          round: r,
          matchIndex: m,
          player1: p1,
          player2: p2,
          winnerId,
          resultDetail,
          handicap,
          komi,
          boardSize: settings.boardSize,
          nextMatchId,
          nextMatchSlot,
          isBye,
        });
      } else {
        matches.push({
          id: matchId,
          round: r,
          matchIndex: m,
          player1: null,
          player2: null,
          winnerId: null,
          handicap: 0,
          komi: 6.5,
          boardSize: settings.boardSize,
          nextMatchId,
          nextMatchSlot,
        });
      }
    }
  }

  // 1回戦の不戦勝を2回戦以降へ伝播させる
  const matchMap = new Map(matches.map(m => [m.id, m]));
  for (const m of matches.filter(m => m.round === 1 && m.isBye && m.winnerId)) {
    const winner = m.player1?.identity === m.winnerId ? m.player1 : m.player2;
    if (winner && m.nextMatchId && m.nextMatchSlot) {
      const nextMatch = matchMap.get(m.nextMatchId);
      if (nextMatch) {
        if (m.nextMatchSlot === 1) nextMatch.player1 = winner;
        else nextMatch.player2 = winner;

        if (nextMatch.player1 && nextMatch.player2) {
          const h = determineMatchHandicap(nextMatch.player1, nextMatch.player2, settings.autoHandicap);
          nextMatch.handicap = h.handicap;
          nextMatch.komi = h.komi;
        }
      }
    }
  }

  return { matches, totalRounds };
}

/**
 * リーグ戦（総当たり・巡回法）の全対戦枠を生成する
 */
export function generateRoundRobinMatches(
  participants: TournamentParticipant[],
  settings: TournamentSettings,
): { matches: TournamentMatch[]; totalRounds: number } {
  const count = participants.length;
  if (count < 2) return { matches: [], totalRounds: 0 };

  // 奇数の場合はダミー(null)を加えて偶数にする
  const list: (TournamentParticipant | null)[] = [...participants];
  if (list.length % 2 !== 0) {
    list.push(null);
  }

  const n = list.length;
  const totalRounds = n - 1;
  const matchesPerRound = n / 2;
  const matches: TournamentMatch[] = [];

  // 巡回法（Polygon method）
  const rotating = [...list];

  for (let r = 1; r <= totalRounds; r++) {
    for (let m = 0; m < matchesPerRound; m++) {
      const p1 = rotating[m];
      const p2 = rotating[n - 1 - m];

      // どちらかがダミー(null)ならその対局はBye（対戦なし）
      if (!p1 || !p2) continue;

      const h = determineMatchHandicap(p1, p2, settings.autoHandicap);

      matches.push({
        id: `rr_${r}_${m}`,
        round: r,
        matchIndex: m,
        player1: h.black,
        player2: h.white,
        winnerId: null,
        handicap: h.handicap,
        komi: h.komi,
        boardSize: settings.boardSize,
      });
    }

    // 最初の要素(rotating[0])を固定し、残りを回転させる
    const fixed = rotating[0];
    const rest = rotating.slice(1);
    const last = rest.pop()!;
    rest.unshift(last);
    rotating.splice(0, rotating.length, fixed, ...rest);
  }

  return { matches, totalRounds };
}

/**
 * 大会インスタンスを新規作成する
 */
export function createNewTournament(params: {
  id: string;
  classroomId: string;
  name: string;
  type: TournamentType;
  participants: TournamentParticipant[];
  settings: TournamentSettings;
}): Tournament {
  const { id, classroomId, name, type, participants, settings } = params;

  let matches: TournamentMatch[] = [];
  let totalRounds = 0;

  if (type === 'single_elimination') {
    const res = generateSingleEliminationMatches(participants, settings);
    matches = res.matches;
    totalRounds = res.totalRounds;
  } else {
    const res = generateRoundRobinMatches(participants, settings);
    matches = res.matches;
    totalRounds = res.totalRounds;
  }

  const now = new Date().toISOString();

  return {
    id,
    classroomId,
    name,
    type,
    status: 'setup',
    participants,
    matches,
    currentRound: 1,
    totalRounds,
    settings,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 対戦結果を記録し、トーナメントの場合は次ラウンドへ勝者を自動進出させる
 */
export function updateMatchResult(
  tournament: Tournament,
  matchId: string,
  winnerId: string,
  resultDetail?: string,
): Tournament {
  const matches = tournament.matches.map(m => ({ ...m }));
  const matchMap = new Map(matches.map(m => [m.id, m]));
  const target = matchMap.get(matchId);

  if (!target) return tournament;

  target.winnerId = winnerId;
  target.resultDetail = resultDetail;

  const winner = target.player1?.identity === winnerId ? target.player1 : target.player2;

  // トーナメントの場合: 次の枠に進出
  if (tournament.type === 'single_elimination' && target.nextMatchId && target.nextMatchSlot && winner) {
    const nextMatch = matchMap.get(target.nextMatchId);
    if (nextMatch) {
      if (target.nextMatchSlot === 1) {
        nextMatch.player1 = winner;
      } else {
        nextMatch.player2 = winner;
      }

      // 相手が既に決まっていれば手合割を再計算
      if (nextMatch.player1 && nextMatch.player2) {
        const h = determineMatchHandicap(nextMatch.player1, nextMatch.player2, tournament.settings.autoHandicap);
        nextMatch.handicap = h.handicap;
        nextMatch.komi = h.komi;
      }
    }
  }

  // 大会全体の完了チェック
  let tournamentWinnerId = tournament.winnerId || null;
  let status = tournament.status;

  if (tournament.type === 'single_elimination') {
    // 決勝戦（最終ラウンドの最後のマッチ）の勝者をチェック
    const finalMatch = matches.find(m => m.round === tournament.totalRounds);
    if (finalMatch?.winnerId) {
      tournamentWinnerId = finalMatch.winnerId;
      status = 'completed';
    }
  } else if (tournament.type === 'round_robin') {
    // 全対戦が終了したかチェック
    const allFinished = matches.every(m => m.winnerId !== null);
    if (allFinished) {
      status = 'completed';
      const standings = calculateRoundRobinStandings(matches, tournament.participants);
      if (standings.length > 0) {
        tournamentWinnerId = standings[0].participant.identity;
      }
    }
  }

  return {
    ...tournament,
    matches,
    winnerId: tournamentWinnerId,
    status,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * リーグ戦の星取表・順位を計算する
 */
export function calculateRoundRobinStandings(
  matches: TournamentMatch[],
  participants: TournamentParticipant[],
): RoundRobinStanding[] {
  const statsMap = new Map<
    string,
    { participant: TournamentParticipant; played: number; wins: number; losses: number; points: number }
  >();

  for (const p of participants) {
    statsMap.set(p.identity, {
      participant: p,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
    });
  }

  for (const m of matches) {
    if (!m.winnerId || !m.player1 || !m.player2) continue;

    const s1 = statsMap.get(m.player1.identity);
    const s2 = statsMap.get(m.player2.identity);

    if (s1) s1.played += 1;
    if (s2) s2.played += 1;

    if (m.winnerId === m.player1.identity) {
      if (s1) {
        s1.wins += 1;
        s1.points += 1;
      }
      if (s2) s2.losses += 1;
    } else if (m.winnerId === m.player2.identity) {
      if (s2) {
        s2.wins += 1;
        s2.points += 1;
      }
      if (s1) s1.losses += 1;
    }
  }

  const list = Array.from(statsMap.values());

  // 勝数順（多い順）でソート
  list.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    // 勝数が同じ場合は直接対決を確認
    const directMatch = matches.find(
      m =>
        m.winnerId &&
        ((m.player1?.identity === a.participant.identity && m.player2?.identity === b.participant.identity) ||
          (m.player1?.identity === b.participant.identity && m.player2?.identity === a.participant.identity)),
    );
    if (directMatch) {
      if (directMatch.winnerId === a.participant.identity) return -1;
      if (directMatch.winnerId === b.participant.identity) return 1;
    }
    return 0;
  });

  return list.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}
