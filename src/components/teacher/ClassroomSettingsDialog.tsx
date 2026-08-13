import { useState } from 'react';
import type { Student, Classroom, RankDisplay } from '../../types/classroom';
import { DEFAULT_RANK_DISPLAY } from '../../types/classroom';
import { upsertClassroom } from '../../utils/classroomStore';

interface ClassroomSettingsDialogProps {
  classroom: Classroom;
  allStudents: Student[];
  onSave: () => void | Promise<void>;
  onClose: () => void;
}

export default function ClassroomSettingsDialog({
  classroom,
  allStudents,
  onSave,
  onClose,
}: ClassroomSettingsDialogProps) {
  const [enrolledIds, setEnrolledIds] = useState<string[]>([...classroom.studentIds]);
  const [selectedEnrolled, setSelectedEnrolled] = useState<string | null>(null);
  const [selectedOther, setSelectedOther] = useState<string | null>(null);
  const [seatCount, setSeatCount] = useState(classroom.maxCapacity);
  const [rankDisplay, setRankDisplay] = useState<RankDisplay>(classroom.rankDisplay ?? DEFAULT_RANK_DISPLAY);
  const [name, setName] = useState(classroom.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const enrolled = enrolledIds
    .map(id => allStudents.find(s => s.id === id))
    .filter((s): s is Student => s != null);

  const others = allStudents.filter(s => !enrolledIds.includes(s.id));

  // → 「その他」から「在籍生」へ移動
  const moveToEnrolled = () => {
    if (!selectedOther) return;
    setEnrolledIds(prev => [...prev, selectedOther]);
    setSelectedOther(null);
  };

  // ← 「在籍生」から「その他」へ移動
  const moveToOther = () => {
    if (!selectedEnrolled) return;
    setEnrolledIds(prev => prev.filter(id => id !== selectedEnrolled));
    setSelectedEnrolled(null);
  };

  // ↑ 在籍生の順番を上に
  const moveUp = () => {
    if (!selectedEnrolled) return;
    const idx = enrolledIds.indexOf(selectedEnrolled);
    if (idx <= 0) return;
    const next = [...enrolledIds];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setEnrolledIds(next);
  };

  // ↓ 在籍生の順番を下に
  const moveDown = () => {
    if (!selectedEnrolled) return;
    const idx = enrolledIds.indexOf(selectedEnrolled);
    if (idx < 0 || idx >= enrolledIds.length - 1) return;
    const next = [...enrolledIds];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setEnrolledIds(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await upsertClassroom({
        ...classroom,
        name: name.trim() || classroom.name,
        studentIds: enrolledIds,
        maxCapacity: seatCount,
        rankDisplay,
      });
      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const cellStyle: React.CSSProperties = {
    padding: '2px 6px',
    border: '1px solid var(--color-line)',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
        width: 800,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        color: 'var(--color-ink)',
      }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'var(--color-raised)',
          borderBottom: '1px solid var(--color-line)',
          fontWeight: 'bold',
          fontSize: 13,
        }}>
          教室情報設定
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-muted)',
          }}>&times;</button>
        </div>

        <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
          {/* 教室名 + 設定 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold' }}>教室名</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                padding: '2px 8px',
                background: 'var(--color-ground)',
                border: '1px solid var(--color-line)',
                flex: 1,
                fontSize: 12,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold' }}>部屋席数</label>
            <select
              value={seatCount}
              onChange={e => setSeatCount(Number(e.target.value))}
              style={{
                padding: '2px 6px',
                border: '1px solid var(--color-line)',
                background: 'var(--color-ground)',
                fontSize: 12,
              }}
            >
              {[5, 8, 10, 12, 15, 20].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            {/* 棋力の見せ方は教室ごとに選ぶ。一般の大人は段級、道場の生徒はランク（2026-08-13 三村さん） */}
            <label style={{ fontWeight: 'bold' }}>棋力の表示</label>
            <select
              data-testid="rank-display-select"
              value={rankDisplay}
              onChange={e => setRankDisplay(e.target.value as RankDisplay)}
              style={{
                padding: '2px 6px',
                border: '1px solid var(--color-line)',
                background: 'var(--color-ground)',
                fontSize: 12,
              }}
            >
              <option value="dan_kyu">段級（初段・3級）</option>
              <option value="rating">ランク（R12）</option>
            </select>
          </div>

          {/* 在籍生・その他 デュアルリスト */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* 左: 在籍生 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '4px 8px',
                background: 'var(--color-raised)',
                color: 'var(--color-ink)',
                fontWeight: 'bold',
                fontSize: 12,
              }}>
                在籍生
              </div>
              <div style={{
                border: '1px solid var(--color-line)',
                background: 'var(--color-ground)',
                height: 320,
                overflowY: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-raised)' }}>
                      <th style={{ ...cellStyle, width: 30, textAlign: 'center' }}>NO.</th>
                      <th style={{ ...cellStyle, textAlign: 'left' }}>生徒ID</th>
                      <th style={{ ...cellStyle, textAlign: 'left' }}>姓名</th>
                      <th style={{ ...cellStyle, width: 36, textAlign: 'center' }}>棋力</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolled.map((s, i) => {
                      const isSelected = selectedEnrolled === s.id;
                      return (
                        <tr
                          key={s.id}
                          onClick={() => { setSelectedEnrolled(s.id); setSelectedOther(null); }}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? 'color-mix(in oklab, var(--color-accent) 18%, var(--color-surface))' : i % 2 === 0 ? 'var(--color-ground)' : 'var(--color-surface)',
                          }}
                        >
                          <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ ...cellStyle, fontSize: 10 }}>{s.id}</td>
                          <td style={{ ...cellStyle, fontWeight: 'bold' }}>{s.name}</td>
                          <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--color-accent-text)' }}>{s.internalRating}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 中央: 矢印ボタン */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 6,
              minWidth: 50,
              alignItems: 'center',
            }}>
              <IgcArrowButton label="↑" onClick={moveUp} />
              <IgcArrowButton label="↓" onClick={moveDown} />
              <div style={{ height: 16 }} />
              <IgcArrowButton label="←" onClick={moveToEnrolled} />
              <IgcArrowButton label="→" onClick={moveToOther} />
            </div>

            {/* 右: その他 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '4px 8px',
                background: 'var(--color-line)',
                color: 'var(--color-ink)',
                fontWeight: 'bold',
                fontSize: 12,
              }}>
                その他
              </div>
              <div style={{
                border: '1px solid var(--color-line)',
                background: 'var(--color-ground)',
                height: 320,
                overflowY: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-raised)' }}>
                      <th style={{ ...cellStyle, textAlign: 'left' }}>生徒ID</th>
                      <th style={{ ...cellStyle, textAlign: 'left' }}>姓名</th>
                      <th style={{ ...cellStyle, width: 36, textAlign: 'center' }}>棋力</th>
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((s, i) => {
                      const isSelected = selectedOther === s.id;
                      return (
                        <tr
                          key={s.id}
                          onClick={() => { setSelectedOther(s.id); setSelectedEnrolled(null); }}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? 'color-mix(in oklab, var(--color-accent) 16%, var(--color-surface))' : i % 2 === 0 ? 'var(--color-ground)' : 'var(--color-surface)',
                          }}
                        >
                          <td style={{ ...cellStyle, fontSize: 10 }}>{s.id}</td>
                          <td style={{ ...cellStyle, fontWeight: 'bold' }}>{s.name}</td>
                          <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--color-accent-text)' }}>{s.internalRating}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* 下部ボタン */}
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--color-line)',
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          background: 'var(--color-raised)',
        }}>
          {error && (
            <div style={{ color: 'var(--color-alert-text)', fontWeight: 'bold', alignSelf: 'center' }}>
              {error}
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{
            padding: '6px 32px',
            fontSize: 13,
            fontWeight: 'bold',
            border: '1px solid var(--color-line)',
            background: 'var(--color-accent)',
            color: 'var(--color-ground)',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? '保存中...' : '保存'}
          </button>
          <button onClick={onClose} style={{
            padding: '6px 32px',
            fontSize: 13,
            fontWeight: 'bold',
            border: '1px solid var(--color-line)',
            background: 'var(--color-raised)',
            cursor: 'pointer',
          }}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function IgcArrowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36,
        height: 28,
        fontSize: 16,
        fontWeight: 'bold',
        border: '1px solid var(--color-line)',
        background: 'var(--color-raised)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}
