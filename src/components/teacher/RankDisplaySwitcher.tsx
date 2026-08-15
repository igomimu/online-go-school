import type { RankDisplay } from '../../types/classroom';

interface RankDisplaySwitcherProps {
  value: RankDisplay;
  disabled?: boolean;
  message?: string | null;
  onChange: (value: RankDisplay) => void;
}

const OPTIONS: Array<{ value: RankDisplay; label: string }> = [
  { value: 'dan_kyu', label: '段級' },
  { value: 'rating', label: 'ランク' },
];

/** 授業中に頻繁に確認できる、教室単位の棋力表示切替。 */
export default function RankDisplaySwitcher({
  value,
  disabled = false,
  message,
  onChange,
}: RankDisplaySwitcherProps) {
  return (
    <div
      role="group"
      aria-label="棋力表示"
      style={{
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--color-muted)' }}>棋力表示</span>
      <div style={{ display: 'inline-flex', border: '1px solid var(--color-line)', borderRadius: 6, overflow: 'hidden' }}>
        {OPTIONS.map(option => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={`rank-display-${option.value}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              style={{
                minWidth: 52,
                padding: '4px 9px',
                border: 'none',
                borderLeft: option.value === 'rating' ? '1px solid var(--color-line)' : 'none',
                background: selected ? 'var(--color-accent)' : 'var(--color-raised)',
                color: selected ? 'var(--color-accent-ink)' : 'var(--color-muted)',
                fontSize: 11.5,
                fontWeight: selected ? 700 : 500,
                cursor: disabled ? 'wait' : 'pointer',
                opacity: disabled ? 0.7 : 1,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {message && (
        <span role="status" style={{ color: message === '保存中…' ? 'var(--color-muted)' : 'var(--color-alert-text)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
