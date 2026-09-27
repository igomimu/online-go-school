import { describe, it, expect } from 'vitest';
import {
  determineMatchHandicap,
  getBracketSize,
  generateSeedOrder,
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  createNewTournament,
  updateMatchResult,
  calculateRoundRobinStandings,
  matchResultFromGame,
  isLinkedGameId,
} from './pairing';
import type { TournamentParticipant, TournamentSettings } from '../../types/tournament';

describe('pairing.ts', () => {
  const pA: TournamentParticipant = { identity: 'id_a', name: '選手A', rank: '五段' };
  const pB: TournamentParticipant = { identity: 'id_b', name: '選手B', rank: '初段' };
  const pC: TournamentParticipant = { identity: 'id_c', name: '選手C', rank: '1級' };
  const pD: TournamentParticipant = { identity: 'id_d', name: '選手D', rank: '5級' };

  const defaultSettings: TournamentSettings = {
    boardSize: 19,
    autoHandicap: true,
  };

  describe('determineMatchHandicap', () => {
    it('段級位差から適切な手合割を返す（初段 vs 五段 = 4子）', () => {
      const h = determineMatchHandicap(pA, pB, true);
      // 初段のpBが黒番、五段のpAが白番
      expect(h.black.identity).toBe('id_b');
      expect(h.white.identity).toBe('id_a');
      expect(h.handicap).toBe(4);
      expect(h.komi).toBe(0.5);
    });

    it('autoHandicapがfalseの場合は互先', () => {
      const h = determineMatchHandicap(pA, pB, false);
      expect(h.handicap).toBe(0);
      expect(h.komi).toBe(6.5);
    });
  });

  describe('bracket and seed calculation', () => {
    it('bracketSizeを2の累乗で正しく計算する', () => {
      expect(getBracketSize(2)).toBe(4);
      expect(getBracketSize(4)).toBe(4);
      expect(getBracketSize(5)).toBe(8);
      expect(getBracketSize(8)).toBe(8);
      expect(getBracketSize(9)).toBe(16);
    });

    it('シード順を正しく計算する (size=8: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6)', () => {
      const seeds = generateSeedOrder(8);
      expect(seeds).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    });
  });

  describe('generateSingleEliminationMatches', () => {
    it('4人のトーナメントで2ラウンド（準決勝2局＋決勝1局）を生成する', () => {
      const participants = [pA, pB, pC, pD];
      const { matches, totalRounds } = generateSingleEliminationMatches(participants, defaultSettings);

      expect(totalRounds).toBe(2);
      expect(matches.length).toBe(3); // 1回戦2局、決勝1局

      const r1Matches = matches.filter(m => m.round === 1);
      const r2Matches = matches.filter(m => m.round === 2);
      expect(r1Matches.length).toBe(2);
      expect(r2Matches.length).toBe(1);

      // 1回戦のマッチはnextMatchIdとnextMatchSlotを持つ
      expect(r1Matches[0].nextMatchId).toBe(r2Matches[0].id);
      expect(r1Matches[0].nextMatchSlot).toBe(1);
      expect(r1Matches[1].nextMatchId).toBe(r2Matches[0].id);
      expect(r1Matches[1].nextMatchSlot).toBe(2);
    });

    it('3人の場合は1人が不戦勝（Bye）となり自動で決勝へ進む', () => {
      const participants = [pA, pB, pC];
      const { matches, totalRounds } = generateSingleEliminationMatches(participants, defaultSettings);

      expect(totalRounds).toBe(2);
      const byeMatch = matches.find(m => m.round === 1 && m.isBye);
      expect(byeMatch).toBeDefined();
      expect(byeMatch?.winnerId).toBe('id_a'); // 1番シードが不戦勝

      // 決勝の枠にpAが自動セットされていること
      const finalMatch = matches.find(m => m.round === 2);
      expect(finalMatch?.player1?.identity).toBe('id_a');
    });
  });

  describe('updateMatchResult (トーナメント進行)', () => {
    it('1回戦の勝者が決勝戦のスロットに自動反映される', () => {
      const participants = [pA, pB, pC, pD];
      let t = createNewTournament({
        id: 't1',
        classroomId: 'c1',
        name: '第1回トーナメント',
        type: 'single_elimination',
        participants,
        settings: defaultSettings,
      });

      const r1_0 = t.matches.find(m => m.round === 1 && m.matchIndex === 0)!;
      const winnerId = r1_0.player1!.identity;

      t = updateMatchResult(t, r1_0.id, winnerId, 'B+R');

      const finalMatch = t.matches.find(m => m.round === 2)!;
      expect(finalMatch.player1?.identity).toBe(winnerId);
      expect(t.status).toBe('setup'); // まだ決勝未完了

      // 決勝も勝敗記録
      const r1_1 = t.matches.find(m => m.round === 1 && m.matchIndex === 1)!;
      const winnerId2 = r1_1.player1!.identity;
      t = updateMatchResult(t, r1_1.id, winnerId2, 'W+3.5');

      // 決勝戦
      t = updateMatchResult(t, finalMatch.id, winnerId, 'B+R');
      expect(t.status).toBe('completed');
      expect(t.winnerId).toBe(winnerId);
    });
  });

  describe('generateRoundRobinMatches (リーグ戦)', () => {
    it('4人の総当たり戦で3ラウンド×2対局=6対局を生成する', () => {
      const participants = [pA, pB, pC, pD];
      const { matches, totalRounds } = generateRoundRobinMatches(participants, defaultSettings);

      expect(totalRounds).toBe(3);
      expect(matches.length).toBe(6);

      // 各対局にplayer1, player2が正しく割り振られている
      for (const m of matches) {
        expect(m.player1).not.toBeNull();
        expect(m.player2).not.toBeNull();
        expect(m.player1?.identity).not.toBe(m.player2?.identity);
      }
    });

    it('3人の場合は各ラウンドで1人がお休み（対戦なし）となり全3対局生成される', () => {
      const participants = [pA, pB, pC];
      const { matches, totalRounds } = generateRoundRobinMatches(participants, defaultSettings);

      expect(totalRounds).toBe(3);
      expect(matches.length).toBe(3); // 3C2 = 3局
    });
  });

  describe('calculateRoundRobinStandings', () => {
    it('勝数順に順位を正しく計算する', () => {
      const participants = [pA, pB, pC];
      const { matches } = generateRoundRobinMatches(participants, defaultSettings);

      // pAが全勝、pBが1勝、pCが0勝
      for (const m of matches) {
        if (m.player1?.identity === 'id_a' || m.player2?.identity === 'id_a') {
          m.winnerId = 'id_a';
        } else if (m.player1?.identity === 'id_b' || m.player2?.identity === 'id_b') {
          m.winnerId = 'id_b';
        }
      }

      const standings = calculateRoundRobinStandings(matches, participants);
      expect(standings[0].participant.identity).toBe('id_a');
      expect(standings[0].wins).toBe(2);
      expect(standings[0].rank).toBe(1);

      expect(standings[1].participant.identity).toBe('id_b');
      expect(standings[1].wins).toBe(1);
      expect(standings[1].rank).toBe(2);

      expect(standings[2].participant.identity).toBe('id_c');
      expect(standings[2].wins).toBe(0);
      expect(standings[2].rank).toBe(3);
    });
  });

  describe('トーナメントの黒番（置石をもらう側）', () => {
    it('1回戦も勝ち上がり先も、弱い方が player1（黒）に並ぶ', () => {
      let t = createNewTournament({
        id: 't1', classroomId: 'c1', name: 'T', type: 'single_elimination',
        participants: [pA, pB, pC, pD], settings: defaultSettings,
      });
      for (const m of t.matches.filter(x => x.round === 1)) {
        const h = determineMatchHandicap(m.player1!, m.player2!, true);
        expect(m.player1!.identity).toBe(h.black.identity);
      }
      // 1回戦はどちらも強い方（五段・初段）が勝ち、決勝は五段 vs 初段 → 初段が黒
      for (const m of t.matches.filter(x => x.round === 1)) {
        const strong = [m.player1!, m.player2!].find(p => p.identity === 'id_a' || p.identity === 'id_b')!;
        t = updateMatchResult(t, m.id, strong.identity, 'W+R');
      }
      const final = t.matches.find(m => m.round === 2)!;
      expect(final.player1?.identity).toBe('id_b');
      expect(final.player2?.identity).toBe('id_a');
      expect(final.handicap).toBeGreaterThan(0);
    });
  });

  describe('matchResultFromGame（対局の結果を大会の勝敗へ）', () => {
    const match = { player1: pB, player2: pA };
    const byId = (identity: string, player: string) => player.replace(/^sid:/, '') === identity;
    const game = (result: string | null, status = 'finished') => ({
      status, result, black_player: 'sid:id_b', white_player: 'sid:id_a',
    });

    it('投了・時間切れ・目数を勝者と表示に直す', () => {
      expect(matchResultFromGame(match, game('B+R'), byId)).toEqual({ kind: 'decided', winnerId: 'id_b', resultDetail: '黒中押し勝ち' });
      expect(matchResultFromGame(match, game('W+T'), byId)).toEqual({ kind: 'decided', winnerId: 'id_a', resultDetail: '白時間切れ勝ち' });
      expect(matchResultFromGame(match, game('W+3.5'), byId)).toEqual({ kind: 'decided', winnerId: 'id_a', resultDetail: '白3.5目勝ち' });
    });

    it('終わっていなければ null、勝敗の無い終局は void', () => {
      expect(matchResultFromGame(match, game(null, 'playing'), byId)).toBeNull();
      expect(matchResultFromGame(match, game('取消'), byId)).toEqual({ kind: 'void' });
      expect(matchResultFromGame(match, game('B+0'), byId)).toEqual({ kind: 'void' });
    });

    it('以前の版の仮の ID は対局に結び付かない', () => {
      expect(isLinkedGameId('created_1')).toBe(false);
      expect(isLinkedGameId(undefined)).toBe(false);
      expect(isLinkedGameId('3f1e...')).toBe(true);
    });
  });
});
