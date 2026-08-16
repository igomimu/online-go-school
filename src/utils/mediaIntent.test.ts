import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMediaIntent, loadMediaIntent, saveMediaIntent } from './mediaIntent';

describe('mediaIntent', () => {
  beforeEach(() => localStorage.clear());

  it('初めて使う端末ではマイク・カメラとも自動で開始しない', () => {
    expect(loadMediaIntent('STUDENT')).toEqual({ mic: false, camera: false });
  });

  it('生徒と講師を分けて最後のON状態を保存する', () => {
    saveMediaIntent('STUDENT', { mic: true, camera: true });
    saveMediaIntent('TEACHER', { mic: true, camera: false });

    expect(loadMediaIntent('STUDENT')).toEqual({ mic: true, camera: true });
    expect(loadMediaIntent('TEACHER')).toEqual({ mic: true, camera: false });
  });

  it('共有PCでは生徒ごとに分けて持つ（前の生徒の設定を引き継がない）', () => {
    saveMediaIntent('STUDENT', { mic: true, camera: true }, 'SM1001');

    expect(loadMediaIntent('STUDENT', 'SM1001')).toEqual({ mic: true, camera: true });
    expect(loadMediaIntent('STUDENT', 'SM1002')).toEqual({ mic: false, camera: false });
  });

  it('壊れた保存値があっても安全にOFFへ戻す', () => {
    localStorage.setItem('go-school-media-intent-student', '{broken');
    expect(loadMediaIntent('STUDENT')).toEqual({ mic: false, camera: false });
  });

  it('再接続後に直前のマイク・カメラON状態を復元する', async () => {
    const state = { mic: false, camera: false };
    const controller = {
      get isMicrophoneEnabled() { return state.mic; },
      get isCameraEnabled() { return state.camera; },
      enableMicrophone: vi.fn(async () => { state.mic = true; }),
      disableMicrophone: vi.fn(async () => { state.mic = false; }),
      enableCamera: vi.fn(async () => { state.camera = true; }),
      disableCamera: vi.fn(async () => { state.camera = false; }),
    };

    await expect(applyMediaIntent(controller, { mic: true, camera: true }))
      .resolves.toEqual({ mic: true, camera: true });
    expect(controller.enableMicrophone).toHaveBeenCalledOnce();
    expect(controller.enableCamera).toHaveBeenCalledOnce();
  });

  it('マイク復元に失敗してもカメラは復元する', async () => {
    const state = { camera: false };
    const controller = {
      isMicrophoneEnabled: false,
      get isCameraEnabled() { return state.camera; },
      enableMicrophone: vi.fn(async () => { throw new Error('mic failed'); }),
      disableMicrophone: vi.fn(async () => {}),
      enableCamera: vi.fn(async () => { state.camera = true; }),
      disableCamera: vi.fn(async () => { state.camera = false; }),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(applyMediaIntent(controller, { mic: true, camera: true }))
      .resolves.toEqual({ mic: false, camera: true });
    expect(controller.enableCamera).toHaveBeenCalledOnce();
  });
});
