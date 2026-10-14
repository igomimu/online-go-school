import { describe, expect, it } from 'vitest';
import { buildTsumegoPeers, givenName, nextStreak, peerMood } from './tsumegoPeers';

describe('詰碁の仲間の炎・氷', () => {
  it('正解で続けた数が増え、まちがいで0に戻る。次の問題の知らせでは変わらない', () => {
    expect(nextStreak(undefined, 'correct')).toBe(1);
    expect(nextStreak(2, 'correct')).toBe(3);
    expect(nextStreak(2, null)).toBe(2);
    expect(nextStreak(5, 'incorrect')).toBe(0);
  });

  it('3問続けて正解で炎、同じ問題で2回目のまちがいで氷', () => {
    expect(peerMood({ result: 'correct', streak: 2 })).toBeNull();
    expect(peerMood({ result: null, streak: 3 })).toBe('fire');
    expect(peerMood({ result: 'incorrect', attempt: 1, streak: 0 })).toBeNull();
    expect(peerMood({ result: 'incorrect', attempt: 2, streak: 0 })).toBe('ice');
    // 次の問題へ進めば氷は溶ける
    expect(peerMood({ result: null, attempt: 1, streak: 0 })).toBeNull();
  });

  it('下の名前だけを出す', () => {
    expect(givenName('遠藤 瑠以')).toBe('瑠以');
    expect(givenName('井町　友莉華')).toBe('友莉華');
    expect(givenName('たろう')).toBe('たろう');
  });

  it('一覧は生徒IDの順で、正解数と炎・氷を添える', () => {
    const names: Record<string, string> = { 'sid:1': '古橋 晴登', 'sid:2': '遠藤 瑠以' };
    const peers = buildTsumegoPeers(
      {
        'sid:1': { result: 'correct', moveCount: 1, solved: 4, streak: 3 },
        'sid:2': { result: 'incorrect', moveCount: 1, solved: 1, attempt: 2, streak: 0 },
      },
      id => names[id],
    );
    expect(peers).toEqual([
      { identity: 'sid:1', name: '晴登', solved: 4, mood: 'fire' },
      { identity: 'sid:2', name: '瑠以', solved: 1, mood: 'ice' },
    ]);
  });
});
