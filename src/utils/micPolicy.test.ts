import { describe, it, expect, beforeEach } from 'vitest';
import { chooseMic, getExcludedMics, isExcludedMic, setMicExcluded } from './mediaDevices';

const mic = (deviceId: string, label: string, groupId: string) =>
  ({ deviceId, label, groupId, kind: 'audioinput' as const });

// Chrome の並び: 既定・通信の別名が先頭に来る
const DEVICES = [
  mic('default', '既定 - ループバック (VB-Audio)', 'g-loop'),
  mic('communications', '通信 - ループバック (VB-Audio)', 'g-loop'),
  mic('loop', 'ループバック (VB-Audio)', 'g-loop'),
  mic('yamaha', 'ヤマハ AG03', 'g-yamaha'),
  mic('builtin', '内蔵マイク', 'g-builtin'),
];
const LOOP = { deviceId: 'loop', label: 'ループバック (VB-Audio)' };

describe('chooseMic', () => {
  it('除外が無ければこれまでどおり（選択かブラウザまかせ）', () => {
    expect(chooseMic(DEVICES, null, [])).toEqual({ kind: 'browser' });
    expect(chooseMic(DEVICES, 'yamaha', [])).toEqual({ kind: 'device', deviceId: 'yamaha' });
  });

  it('OS の既定が除外した機器なら、除外していない実機へ固定する', () => {
    expect(chooseMic(DEVICES, null, [LOOP])).toEqual({ kind: 'device', deviceId: 'yamaha' });
  });

  it('既定が使える機器でも、別名のままにせず実機へ固定する', () => {
    const devices = [mic('default', '既定 - 内蔵マイク', 'g-builtin'), ...DEVICES.slice(2)];
    expect(chooseMic(devices, null, [LOOP])).toEqual({ kind: 'device', deviceId: 'builtin' });
  });

  it('選んだ機器が除外されていれば選択より除外を優先する', () => {
    expect(chooseMic(DEVICES, 'default', [LOOP])).toEqual({ kind: 'device', deviceId: 'yamaha' });
  });

  it('選んだ機器が外れていれば、除外以外から選ぶ', () => {
    expect(chooseMic(DEVICES, 'gone', [LOOP])).toEqual({ kind: 'device', deviceId: 'yamaha' });
  });

  it('除外していないマイクが1台も無ければ none', () => {
    const only = DEVICES.slice(0, 3);
    expect(chooseMic(only, null, [LOOP])).toEqual({ kind: 'none' });
  });

  it('deviceId が振り直されても名前で除外を見分ける', () => {
    const renamed = [mic('loop-new', 'ループバック (VB-Audio)', 'g2'), mic('yamaha', 'ヤマハ AG03', 'g3')];
    expect(chooseMic(renamed, 'loop-new', [LOOP])).toEqual({ kind: 'device', deviceId: 'yamaha' });
  });

  it('許可前で機器名が取れないときは判定を後回しにする', () => {
    const unnamed = [{ deviceId: '', label: '', groupId: '', kind: 'audioinput' as const }];
    expect(chooseMic(unnamed, null, [LOOP])).toEqual({ kind: 'unknown' });
  });
});

describe('除外リストの保存', () => {
  beforeEach(() => localStorage.clear());

  it('登録・解除が端末に残る', () => {
    setMicExcluded(LOOP, true);
    expect(getExcludedMics()).toEqual([LOOP]);
    expect(isExcludedMic({ deviceId: 'other', label: 'ループバック (VB-Audio)' })).toBe(true);
    setMicExcluded(LOOP, false);
    expect(getExcludedMics()).toEqual([]);
    expect(localStorage.getItem('go-school-excluded-mics')).toBeNull();
  });

  it('壊れた保存値でも落ちない', () => {
    localStorage.setItem('go-school-excluded-mics', '{bad');
    expect(getExcludedMics()).toEqual([]);
  });
});
