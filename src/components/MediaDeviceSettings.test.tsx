import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MediaDeviceSettings from './MediaDeviceSettings';
import type { ClassroomRtc } from '../utils/classroomRtc';
import { getMirrorLocalVideo } from '../utils/mediaDevices';

const DEVICES: MediaDeviceInfo[] = [
  { deviceId: 'mic-a', kind: 'audioinput', label: 'ヤマハ AG03', groupId: 'g1' } as MediaDeviceInfo,
  { deviceId: 'mic-b', kind: 'audioinput', label: '内蔵マイク', groupId: 'g2' } as MediaDeviceInfo,
  { deviceId: 'cam-a', kind: 'videoinput', label: 'Logicool C920', groupId: 'g3' } as MediaDeviceInfo,
];

describe('MediaDeviceSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue(DEVICES),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('開くと繋がっている機器を並べる', async () => {
    render(<MediaDeviceSettings classroom={null} />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    await waitFor(() => expect(screen.getAllByText('ヤマハ AG03').length).toBeGreaterThan(0));
    expect(screen.getAllByText('内蔵マイク').length).toBeGreaterThan(0);
    expect(screen.getByText('Logicool C920')).toBeInTheDocument();
    // 何も選ばなければブラウザ任せ
    expect(screen.getAllByText('自動（ブラウザにまかせる）').length).toBe(2);
  });

  it('ヘッダーの高さに閉じ込めず、画面内の固定パネルとして開く', async () => {
    const { container } = render(
      <header className="overflow-hidden h-12">
        <MediaDeviceSettings classroom={null} iconOnly />
      </header>,
    );
    fireEvent.click(screen.getByTestId('media-device-settings'));

    const dialog = await screen.findByRole('dialog', { name: '音声・映像の設定' });
    expect(dialog).toHaveClass('fixed', 'max-h-[calc(100dvh-1.5rem)]', 'overflow-y-auto');
    expect(container.contains(dialog)).toBe(false);
  });

  it('Escapeキーで設定パネルを閉じる', async () => {
    render(<MediaDeviceSettings classroom={null} iconOnly />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    expect(await screen.findByRole('dialog', { name: '音声・映像の設定' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '音声・映像の設定' })).not.toBeInTheDocument();
  });

  it('選ぶと LiveKit を切り替え、端末に残す', async () => {
    const switchDevice = vi.fn().mockResolvedValue(undefined);
    render(<MediaDeviceSettings classroom={{ switchDevice } as unknown as ClassroomRtc} />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    await waitFor(() => expect(screen.getAllByText('ヤマハ AG03').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByTestId('device-select-audioinput'), { target: { value: 'mic-a' } });
    await waitFor(() => expect(switchDevice).toHaveBeenCalledWith('audioinput', 'mic-a'));
    // 回線復旧で Room を作り直しても引き継げるよう保存する
    expect(localStorage.getItem('go-school-device-mic')).toBe('mic-a');
  });

  it('切り替えに失敗したら黙らず理由を出す', async () => {
    const switchDevice = vi.fn().mockRejectedValue(new Error('使用中です'));
    render(<MediaDeviceSettings classroom={{ switchDevice } as unknown as ClassroomRtc} />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    await waitFor(() => expect(screen.getAllByText('ヤマハ AG03').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByTestId('device-select-audioinput'), { target: { value: 'mic-a' } });
    await waitFor(() =>
      expect(screen.getByText(/マイクを切り替えられませんでした/)).toBeInTheDocument()
    );
  });

  it('使わないマイクに登録すると選択肢から消え、端末に残る', async () => {
    const enforceMicPolicy = vi.fn().mockResolvedValue('switched');
    render(<MediaDeviceSettings classroom={{ enforceMicPolicy } as unknown as ClassroomRtc} />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    await waitFor(() => expect(screen.getByTestId('exclude-mic-mic-b')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('exclude-mic-mic-b'));
    await waitFor(() => expect(enforceMicPolicy).toHaveBeenCalled());
    const select = screen.getByTestId('device-select-audioinput');
    expect(select.querySelector('option[value="mic-b"]')).toBeNull();
    expect(select.querySelector('option[value="mic-a"]')).not.toBeNull();
    expect(screen.getByText('自動（使わないマイク以外）')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('go-school-excluded-mics') ?? '[]'))
      .toEqual([{ deviceId: 'mic-b', label: '内蔵マイク' }]);
    expect(await screen.findByText(/別のマイクへ切り替えました/)).toBeInTheDocument();
  });

  it('選んでいたマイクを除外したら、選択を自動へ戻す', async () => {
    localStorage.setItem('go-school-device-mic', 'mic-b');
    render(<MediaDeviceSettings classroom={null} />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    await waitFor(() => expect(screen.getByTestId('exclude-mic-mic-b')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('exclude-mic-mic-b'));
    await waitFor(() => expect(localStorage.getItem('go-school-device-mic')).toBeNull());
    expect((screen.getByTestId('device-select-audioinput') as HTMLSelectElement).value).toBe('');
  });

  it('いま挿さっていない除外済みのマイクも並べ、外せる', async () => {
    localStorage.setItem('go-school-excluded-mics', JSON.stringify([{ deviceId: 'gone', label: 'USBマイク' }]));
    render(<MediaDeviceSettings classroom={null} />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    const absent = await screen.findByText('USBマイク（いまは未接続）');
    fireEvent.click(absent);
    await waitFor(() => expect(localStorage.getItem('go-school-excluded-mics')).toBeNull());
  });

  it('機器名が空のときは、一度オンにするよう案内する', async () => {
    (navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
      { deviceId: 'mic-a', kind: 'audioinput', label: '', groupId: 'g1' } as MediaDeviceInfo,
    ]);
    render(<MediaDeviceSettings classroom={null} />);
    fireEvent.click(screen.getByTestId('media-device-settings'));
    await waitFor(() =>
      expect(screen.getByText(/一度オンにすると出ます/)).toBeInTheDocument()
    );
  });
});

describe('自分の映像の左右反転', () => {
  it('既定は切、入れると端末に残る', async () => {
    localStorage.clear();
    render(<MediaDeviceSettings classroom={null} />);
    fireEvent.click(screen.getByRole('button', { name: '音声・映像の設定' }));

    const toggle = await screen.findByTestId('mirror-local-video') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);
    expect(getMirrorLocalVideo()).toBe(true);
    expect((screen.getByTestId('mirror-local-video') as HTMLInputElement).checked).toBe(true);

    // もう一度で戻る
    fireEvent.click(screen.getByTestId('mirror-local-video'));
    expect(getMirrorLocalVideo()).toBe(false);
  });
});
