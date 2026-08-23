import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getByoyomiAnnouncement,
  getNhkAnnouncement,
  getNhkConsiderationAnnouncement,
  getNhkContinuationAnnouncement,
  getNhkTimeUpAnnouncement,
  speakByoyomi,
  resetByoyomiVoiceState,
} from './byoyomiVoice';

describe('getByoyomiAnnouncement', () => {
  describe('30秒・最後の回（periodsLeft=1）', () => {
    const f = (e: number) => getByoyomiAnnouncement(30, e, 1);
    it('10秒・20秒を読む', () => {
      expect(f(10)).toBe('10秒');
      expect(f(20)).toBe('20秒');
    });
    it('最後の10秒を1〜10で数える（30秒で「10」）', () => {
      expect(f(21)).toBe('1');
      expect(f(22)).toBe('2');
      expect(f(29)).toBe('9');
      expect(f(30)).toBe('10');
    });
    it('マーク以外は無音', () => {
      expect(f(5)).toBeNull();
      expect(f(15)).toBeNull();
    });
  });

  describe('30秒・考慮時間が残る（periodsLeft=3）', () => {
    const f = (e: number) => getByoyomiAnnouncement(30, e, 3);
    it('10,20,25,28秒を読む', () => {
      expect(f(10)).toBe('10秒');
      expect(f(20)).toBe('20秒');
      expect(f(25)).toBe('25秒');
      expect(f(28)).toBe('28秒');
    });
    it('30秒で残り回数を告げる（3-1=2）', () => {
      expect(f(30)).toBe('残り2回です');
    });
    it('最後の10秒は数えない', () => {
      expect(f(21)).toBeNull();
      expect(f(29)).toBeNull();
    });
  });

  describe('30秒・最後の考慮時間に入る（periodsLeft=2）', () => {
    it('30秒で「最後の考慮時間です」（「入りました」はTTSが誤読するため不使用）', () => {
      expect(getByoyomiAnnouncement(30, 30, 2)).toBe('最後の考慮時間です');
    });
  });

  describe('60秒・最後の回（periodsLeft=1）', () => {
    const f = (e: number) => getByoyomiAnnouncement(60, e, 1);
    it('30,40,50秒を読む（10,20は読まない）', () => {
      expect(f(10)).toBeNull();
      expect(f(20)).toBeNull();
      expect(f(30)).toBe('30秒');
      expect(f(40)).toBe('40秒');
      expect(f(50)).toBe('50秒');
    });
    it('最後の10秒を1〜10（60秒で「10」）', () => {
      expect(f(51)).toBe('1');
      expect(f(59)).toBe('9');
      expect(f(60)).toBe('10');
    });
  });

  describe('60秒・考慮時間が残る（periodsLeft=5）', () => {
    const f = (e: number) => getByoyomiAnnouncement(60, e, 5);
    it('30,40,50,55,58秒を読む', () => {
      expect(f(30)).toBe('30秒');
      expect(f(40)).toBe('40秒');
      expect(f(50)).toBe('50秒');
      expect(f(55)).toBe('55秒');
      expect(f(58)).toBe('58秒');
    });
    it('60秒で残り4回', () => {
      expect(f(60)).toBe('残り4回です');
    });
  });

  it('範囲外は null', () => {
    expect(getByoyomiAnnouncement(30, 0, 1)).toBeNull();
    expect(getByoyomiAnnouncement(30, 31, 1)).toBeNull();
    expect(getByoyomiAnnouncement(0, 5, 1)).toBeNull();
  });
});

describe('NHK杯方式の読み上げ', () => {
  it('考慮時間が残る30秒では10・20・25・28秒を読む', () => {
    const f = (elapsed: number) => getNhkAnnouncement(elapsed, 3, false);
    expect(f(10)).toBe('10秒');
    expect(f(20)).toBe('20秒');
    expect(f(25)).toBe('25秒');
    expect(f(28)).toBe('28秒');
    expect(f(21)).toBeNull();
  });

  it('考慮時間がない30秒では10・20秒の後を1〜10と読む', () => {
    const f = (elapsed: number) => getNhkAnnouncement(elapsed, 0, false);
    expect(f(10)).toBe('10秒');
    expect(f(20)).toBe('20秒');
    expect(f(21)).toBe('1');
    expect(f(29)).toBe('9');
    expect(f(30)).toBe('10');
  });

  it('考慮時間へ入った回数と残数を案内する', () => {
    expect(getNhkConsiderationAnnouncement(4, 3)).toBe('1回目の考慮時間に入りました。残り3回です。');
    expect(getNhkConsiderationAnnouncement(4, 1)).toBe('3回目の考慮時間に入りました。残り1回です。');
  });

  it('最後の60秒考慮時間は終盤を1〜10と読む', () => {
    const f = (elapsed: number) => getNhkAnnouncement(elapsed, 0, true);
    expect(f(30)).toBe('30秒');
    expect(f(50)).toBe('50秒');
    expect(f(51)).toBe('1');
    expect(f(60)).toBe('10');
  });

  it('次が残る60秒考慮時間は30・40・50・55・58秒を読む', () => {
    const f = (elapsed: number) => getNhkAnnouncement(elapsed, 2, true);
    expect(f(30)).toBe('30秒');
    expect(f(40)).toBe('40秒');
    expect(f(50)).toBe('50秒');
    expect(f(55)).toBe('55秒');
    expect(f(58)).toBe('58秒');
    expect(f(51)).toBeNull();
  });

  it('考慮時間が残る場合は残数だけを案内して次の60秒へ続ける', () => {
    expect(getNhkContinuationAnnouncement(3)).toBe('残り3回です。');
    expect(getNhkContinuationAnnouncement(1)).toBe('残り1回です。');
  });

  it('最後は手番の色を付けて時間切れ負けを案内する', () => {
    expect(getNhkTimeUpAnnouncement('BLACK')).toBe('黒の時間切れ負けです');
    expect(getNhkTimeUpAnnouncement('WHITE')).toBe('白の時間切れ負けです');
  });
});

describe('speakByoyomi の連続重複抑止', () => {
  const spoken: string[] = [];

  beforeEach(() => {
    spoken.length = 0;
    resetByoyomiVoiceState();
    vi.stubGlobal('speechSynthesis', {
      speak: (u: { text: string }) => { spoken.push(u.text); },
      cancel: () => {},
    });
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; rate = 1; volume = 1;
      constructor(text: string) { this.text = text; } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('同じフレーズが連続で来たら2回目を読み上げない', () => {
    speakByoyomi('最後の考慮時間です');
    speakByoyomi('最後の考慮時間です');
    expect(spoken).toEqual(['最後の考慮時間です']);
  });

  it('異なるフレーズは連続でも読み上げる', () => {
    speakByoyomi('1');
    speakByoyomi('2');
    expect(spoken).toEqual(['1', '2']);
  });

  it('抑止時間を過ぎれば同じフレーズも読み上げる（秒読みの回が一周した場合）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
    speakByoyomi('10');
    vi.setSystemTime(new Date('2026-08-01T00:00:02Z')); // 2秒後
    speakByoyomi('10');
    expect(spoken).toEqual(['10', '10']);
  });
});
