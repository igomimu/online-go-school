import type { TimeSettings } from '../hooks/useGameClock';
import { BYOYOMI_SECONDS_OPTIONS } from '../hooks/useGameClock';

interface TimeControlPickerProps {
  value: TimeSettings;
  onChange: (next: TimeSettings) => void;
  /** 'dark' = 通常の対局系ダイアログ（グラス系） / 'light' = 明るい背景向けの予備バリアント（現在未使用） */
  variant?: 'dark' | 'light';
}

/**
 * 講師が項目ごとに数値を決める持ち時間設定UI（ネット囲碁学園 NHK杯方式に準拠）。
 * 持ち時間（分・自由入力）／秒読み あり・なし／秒読み秒数 10・20・30・60／秒読みの回数（考慮時間）。
 */
export default function TimeControlPicker({ value, onChange, variant = 'light' }: TimeControlPickerProps) {
  const dark = variant === 'dark';
  const set = (patch: Partial<TimeSettings>) => onChange({ ...value, ...patch });

  const numberInputCls = dark
    ? 'w-20 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-amber-500'
    : '';
  const numberInputStyle: React.CSSProperties = dark
    ? {}
    : { width: 64, fontSize: 12, border: '1px solid #999', padding: '2px 4px' };

  const labelCls = dark ? 'text-sm text-zinc-400' : '';
  const labelStyle: React.CSSProperties = dark ? {} : { fontSize: 12, color: '#333' };

  const segBtn = (active: boolean): React.CSSProperties =>
    dark
      ? {}
      : {
          fontSize: 12,
          padding: '3px 10px',
          border: '1px solid #999',
          cursor: 'pointer',
          background: active ? '#b45309' : '#fff',
          color: active ? '#fff' : '#333',
          fontWeight: active ? 'bold' : 'normal',
        };
  const segBtnCls = (active: boolean) =>
    dark
      ? `px-3 py-1 rounded-md text-sm border transition-colors ${
          active
            ? 'bg-amber-500 border-amber-500 text-white font-semibold'
            : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
        }`
      : '';

  const rowStyle: React.CSSProperties = dark
    ? {}
    : { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };

  return (
    <div className={dark ? 'space-y-3' : undefined} style={dark ? {} : { display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* 持ち時間（分） */}
      <div className={dark ? 'flex items-center gap-2' : undefined} style={rowStyle}>
        <label className={labelCls} style={labelStyle}>持ち時間（分）</label>
        <input
          type="number"
          min={0}
          step={1}
          value={value.mainMinutes}
          onChange={e => set({ mainMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
          className={numberInputCls}
          style={numberInputStyle}
        />
        {value.mainMinutes === 0 && (
          <span className={dark ? 'text-xs text-zinc-500' : undefined} style={dark ? {} : { fontSize: 11, color: '#888' }}>
            （0＝持ち時間なし）
          </span>
        )}
      </div>

      {/* 秒読み あり/なし */}
      <div className={dark ? 'flex items-center gap-2' : undefined} style={rowStyle}>
        <label className={labelCls} style={labelStyle}>秒読み</label>
        <button
          type="button"
          onClick={() => set({ byoyomiEnabled: true })}
          className={segBtnCls(value.byoyomiEnabled)}
          style={segBtn(value.byoyomiEnabled)}
        >
          あり
        </button>
        <button
          type="button"
          onClick={() => set({ byoyomiEnabled: false })}
          className={segBtnCls(!value.byoyomiEnabled)}
          style={segBtn(!value.byoyomiEnabled)}
        >
          なし
        </button>
      </div>

      {/* 秒読み秒数（あり時のみ） */}
      {value.byoyomiEnabled && (
        <>
          <div className={dark ? 'flex items-center gap-2 flex-wrap' : undefined} style={rowStyle}>
            <label className={labelCls} style={labelStyle}>秒読み秒数</label>
            {BYOYOMI_SECONDS_OPTIONS.map(sec => (
              <button
                key={sec}
                type="button"
                onClick={() => set({ byoyomiSeconds: sec })}
                className={segBtnCls(value.byoyomiSeconds === sec)}
                style={segBtn(value.byoyomiSeconds === sec)}
              >
                {sec}秒
              </button>
            ))}
          </div>

          {/* 秒読みの回数（考慮時間） */}
          <div className={dark ? 'flex items-center gap-2' : undefined} style={rowStyle}>
            <label className={labelCls} style={labelStyle}>秒読みの回数（考慮時間）</label>
            <input
              type="number"
              min={1}
              step={1}
              value={value.byoyomiPeriods}
              onChange={e => set({ byoyomiPeriods: Math.max(1, parseInt(e.target.value) || 1) })}
              className={numberInputCls}
              style={numberInputStyle}
            />
            <span className={dark ? 'text-xs text-zinc-500' : undefined} style={dark ? {} : { fontSize: 12, color: '#333' }}>回</span>
          </div>
        </>
      )}
    </div>
  );
}
