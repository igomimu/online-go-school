import { useCallback, useEffect, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import type { ClassroomLiveKit } from '../utils/classroomLiveKit';
import {
  DEVICE_LABEL,
  getSavedDeviceId,
  listDevices,
  needsPermissionForLabels,
  saveDeviceId,
  type DeviceKind,
  type MediaDeviceChoice,
} from '../utils/mediaDevices';

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

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 space-y-3 rounded-lg border border-line bg-surface p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">音声・映像の設定</span>
            <button onClick={() => setOpen(false)} aria-label="閉じる" className="text-muted hover:text-ink">
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

          {error && <p className="text-xs text-alert-text">{error}</p>}

          <p className="text-xs text-muted">
            選んだ機器はこの端末に残り、回線復旧のあとも使われます。
          </p>
        </div>
      )}
    </div>
  );
}
