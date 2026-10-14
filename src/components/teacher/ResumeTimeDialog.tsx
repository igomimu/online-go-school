import { useEffect, useState } from 'react';
import type { GameClock } from '../../types/game';
import {
  BYOYOMI_SECONDS_OPTIONS,
  clockFromResumeTimeSettings,
  resumeTimeSettingsError,
  resumeTimeSettingsFromClock,
  type ResumeTimeSettings,
} from '../../hooks/useGameClock';
import { fetchLiveGame, resumeLiveGame } from '../../utils/liveGameApi';

interface ResumeTimeDialogProps {
  gameId: string;
  blackName: string;
  whiteName: string;
  onClose: () => void;
  /** 再開できたら呼ぶ（履歴を閉じるなど） */
  onResumed: () => void;
}

const inputStyle: React.CSSProperties = {
  width: 56,
  padding: '2px 6px',
  background: 'var(--color-ground)',
  border: '1px solid var(--color-line)',
  fontSize: 13,
  textAlign: 'right',
};

const segStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 12,
  padding: '3px 10px',
  border: '1px solid var(--color-line)',
  cursor: 'pointer',
  background: active ? 'var(--color-accent)' : 'var(--color-raised)',
  color: active ? 'var(--color-ground)' : 'var(--color-ink)',
  fontWeight: active ? 'bold' : 'normal',
});

/**
 * 中断した対局を、持ち時間を決め直して再開する（2026-10-14 三村さん
 * 「時間状況に合わせてフレキシブルに持時間が変えられる」）。
 * 棋譜はそのまま。黒白それぞれの残りと秒読みを、いまの時計を初期値にして選び直す。
 */
export default function ResumeTimeDialog({ gameId, blackName, whiteName, onClose, onResumed }: ResumeTimeDialogProps) {
  const [previous, setPrevious] = useState<GameClock | null>(null);
  const [settings, setSettings] = useState<ResumeTimeSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchLiveGame(gameId)
      .then(row => {
        if (!alive) return;
        const clock = row?.clock ?? null;
        setPrevious(clock);
        setSettings(resumeTimeSettingsFromClock(clock));
      })
      .catch(err => { if (alive) setError(`対局を読み込めませんでした: ${err instanceof Error ? err.message : err}`); });
    return () => { alive = false; };
  }, [gameId]);

  const set = (patch: Partial<ResumeTimeSettings>) => setSettings(prev => (prev ? { ...prev, ...patch } : prev));
  const invalid = settings ? resumeTimeSettingsError(settings) : null;

  const handleResume = async () => {
    if (!settings || invalid) return;
    setSaving(true);
    setError('');
    try {
      await resumeLiveGame(gameId, clockFromResumeTimeSettings(settings, previous));
      onResumed();
    } catch (err) {
      setError(`再開できませんでした: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  };

  const sideRow = (label: string, key: 'blackSeconds' | 'whiteSeconds') => {
    const total = settings?.[key] ?? 0;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    const toNumber = (v: string) => Math.max(0, parseInt(v, 10) || 0);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <input
          type="number"
          min={0}
          aria-label={`${label}の残り（分）`}
          value={minutes}
          onChange={e => set({ [key]: toNumber(e.target.value) * 60 + seconds })}
          style={inputStyle}
        />
        <span>分</span>
        <input
          type="number"
          min={0}
          max={59}
          aria-label={`${label}の残り（秒）`}
          value={seconds}
          onChange={e => set({ [key]: minutes * 60 + Math.min(59, toNumber(e.target.value)) })}
          style={inputStyle}
        />
        <span>秒</span>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-label="持ち時間を変えて再開"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, // 棋譜履歴（1000）の上に出す
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-line)', color: 'var(--color-ink)',
        width: 440, maxWidth: '100%', fontSize: 12,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: 'var(--color-raised)', borderBottom: '1px solid var(--color-line)',
          fontWeight: 'bold', fontSize: 13,
        }}>
          持ち時間を変えて再開
          <button onClick={onClose} aria-label="閉じる" style={{
            background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-muted)',
          }}>&times;</button>
        </div>

        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!settings && !error && <div style={{ color: 'var(--color-muted)' }}>読み込み中…</div>}
          {settings && (
            <>
              <div style={{ color: 'var(--color-muted)' }}>
                棋譜はそのまま。残りの持ち時間（0なら秒読みから）と秒読みを選び直します。
              </div>
              {sideRow(`黒 ${blackName}`, 'blackSeconds')}
              {sideRow(`白 ${whiteName}`, 'whiteSeconds')}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ minWidth: 120 }}>秒読み</span>
                <button type="button" aria-pressed={settings.byoyomiEnabled} onClick={() => set({ byoyomiEnabled: true })} style={segStyle(settings.byoyomiEnabled)}>あり</button>
                <button type="button" aria-pressed={!settings.byoyomiEnabled} onClick={() => set({ byoyomiEnabled: false })} style={segStyle(!settings.byoyomiEnabled)}>なし</button>
              </div>
              {settings.byoyomiEnabled && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 120 }}>1手</span>
                    {BYOYOMI_SECONDS_OPTIONS.map(sec => (
                      <button
                        key={sec}
                        type="button"
                        aria-pressed={settings.byoyomiSeconds === sec}
                        onClick={() => set({ byoyomiSeconds: sec })}
                        style={segStyle(settings.byoyomiSeconds === sec)}
                      >
                        {sec}秒
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ minWidth: 120 }}>回数（考慮時間）</span>
                    <input
                      type="number"
                      min={1}
                      aria-label="秒読みの回数"
                      value={settings.byoyomiPeriods}
                      onChange={e => set({ byoyomiPeriods: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      style={inputStyle}
                    />
                    <span>回</span>
                  </div>
                </>
              )}
              {invalid && <div style={{ color: 'var(--color-alert-text)' }}>{invalid}</div>}
            </>
          )}
          {error && <div style={{ color: 'var(--color-alert-text)' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--color-line)' }}>
          <button onClick={onClose} style={{
            padding: '5px 20px', fontSize: 13, border: '1px solid var(--color-line)',
            background: 'var(--color-raised)', color: 'var(--color-ink)', cursor: 'pointer',
          }}>
            取消
          </button>
          <button
            onClick={() => { void handleResume(); }}
            disabled={!settings || !!invalid || saving}
            style={{
              padding: '5px 20px', fontSize: 13, fontWeight: 'bold', border: '1px solid #8a7554',
              background: 'var(--color-accent)', color: 'var(--color-ground)',
              cursor: !settings || invalid || saving ? 'default' : 'pointer',
              opacity: !settings || invalid || saving ? 0.6 : 1,
            }}
          >
            {saving ? '再開中…' : 'この時間で再開'}
          </button>
        </div>
      </div>
    </div>
  );
}
