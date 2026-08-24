import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, X } from 'lucide-react';
import type { ClassroomLiveKit } from '../utils/classroomLiveKit';
import {
  DEVICE_LABEL,
  getSavedDeviceId,
  listDevices,
  needsPermissionForLabels,
  saveDeviceId,
  saveMirrorLocalVideo,
  type DeviceKind,
  type MediaDeviceChoice,
} from '../utils/mediaDevices';
import { useMirrorLocalVideo } from '../hooks/useMirrorLocalVideo';

interface Props {
  classroom: ClassroomLiveKit | null;
  /** ボタンの体裁を呼び出し側に合わせる */
  className?: string;
  /** 文字を出さずアイコンだけにする（ヘッダー用） */
  iconOnly?: boolean;
}

/**
 * 使用するマイク・カメラを選ぶ。
 * 複数挿さっている環境では、ブラウザ任せだと意図しない機器を掴むことがある。
 * 選択は端末ごとに残り、「回線復旧」で Room を作り直しても引き継がれる。
 */
export default function MediaDeviceSettings({ classroom, className = '', iconOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const dialogTitleId = useId();
  const [devices, setDevices] = useState<Record<DeviceKind, MediaDeviceChoice[]>>({
    audioinput: [],
    videoinput: [],
  });
  const [selected, setSelected] = useState<Record<DeviceKind, string>>({
    audioinput: getSavedDeviceId('audioinput') ?? '',
    videoinput: getSavedDeviceId('videoinput') ?? '',
  });
  const [needsPermission, setNeedsPermission] = useState(false);
  const [error, setError] = useState('');
  const mirrorLocalVideo = useMirrorLocalVideo();

  const reload = useCallback(async () => {
    try {
      const [mics, cams, micUnnamed, camUnnamed] = await Promise.all([
        listDevices('audioinput'),
        listDevices('videoinput'),
        needsPermissionForLabels('audioinput'),
        needsPermissionForLabels('videoinput'),
      ]);
      setDevices({ audioinput: mics, videoinput: cams });
      setNeedsPermission(micUnnamed || camUnnamed);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '機器の一覧を取得できませんでした');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // reload は非同期。effect の同期部分では setState しない
    void (async () => {
      if (!cancelled) await reload();
    })();
    // 抜き差しに追従する
    const onChange = () => void reload();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    };
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const choose = useCallback(async (kind: DeviceKind, deviceId: string) => {
    setSelected(prev => ({ ...prev, [kind]: deviceId }));
    saveDeviceId(kind, deviceId || null);
    if (!deviceId || !classroom) return;
    try {
      await classroom.switchDevice(kind, deviceId);
      setError('');
    } catch (err) {
      setError(`${DEVICE_LABEL[kind]}を切り替えられませんでした: ${err instanceof Error ? err.message : err}`);
    }
  }, [classroom]);

  const renderRow = (kind: DeviceKind) => (
    <label className="block space-y-1">
      <span className="block text-xs text-muted">{DEVICE_LABEL[kind]}</span>
      <select
        data-testid={`device-select-${kind}`}
        value={selected[kind]}
        onChange={e => void choose(kind, e.target.value)}
        className="w-full rounded-md border border-field-line bg-ground px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
      >
        <option value="">自動（ブラウザにまかせる）</option>
        {devices[kind].map(d => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        data-testid="media-device-settings"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        title="使用するマイク・カメラを選ぶ"
        className={iconOnly
          ? 'p-2 rounded-lg text-muted hover:text-ink hover:bg-ink/5 transition-colors duration-150'
          : 'flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-xs font-bold text-ink hover:bg-line transition-colors duration-150'}
      >
        <Settings2 className="w-4 h-4" />
        {!iconOnly && '音声・映像の設定'}
      </button>

      {open && createPortal(
        <>
          <button
            type="button"
            className="fixed inset-0 z-[90] cursor-default bg-black/10"
            onClick={() => setOpen(false)}
            aria-label="音声・映像の設定を閉じる"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="fixed inset-x-3 top-3 z-[100] max-h-[calc(100dvh-1.5rem)] w-auto overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-2xl sm:inset-x-auto sm:right-4 sm:top-16 sm:w-80 sm:max-h-[calc(100dvh-5rem)]"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span id={dialogTitleId} className="text-sm font-bold">音声・映像の設定</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="p-1 text-muted hover:text-ink">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {needsPermission && (
                <p className="text-xs text-muted">
                  機器の名前は、マイクかカメラを一度オンにすると出ます。
                </p>
              )}

              {renderRow('audioinput')}
              {renderRow('videoinput')}

              {/* 自分の映像の向き。生徒に届くのは常に実像で、ここは手元の見え方だけを変える */}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="mirror-local-video"
                  checked={mirrorLocalVideo}
                  onChange={(e) => saveMirrorLocalVideo(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  自分の映像を左右反転して見る
                  <span className="block text-xs text-muted">
                    鏡と同じ向きになり、顔を映して位置を合わせるときに扱いやすくなります。
                    碁盤や本を映すときは切ったままにしてください。生徒側の見え方は変わりません。
                  </span>
                </span>
              </label>

              {error && <p className="text-xs text-alert-text">{error}</p>}

              <p className="text-xs text-muted">
                選んだ機器はこの端末に残り、回線復旧のあとも使われます。
              </p>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
