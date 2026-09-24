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
});
