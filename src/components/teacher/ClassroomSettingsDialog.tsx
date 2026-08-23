import { useState } from 'react';
import type { Student, Classroom, RankDisplay, StudentTypeDraft } from '../../types/classroom';
import { DEFAULT_RANK_DISPLAY, normalizeStudentTypes } from '../../types/classroom';
import { replaceStudentTypes, upsertClassroom } from '../../utils/classroomStore';

interface ClassroomSettingsDialogProps {
  classroom: Classroom;
  allStudents: Student[];
  studentTypes: string[];
  onSave: () => void | Promise<void>;
  onClose: () => void;
}

const smallButtonStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  padding: 0,
  border: '1px solid var(--color-line)',
  background: 'var(--color-raised)',
  color: 'var(--color-ink)',
  cursor: 'pointer',
  fontSize: 11,
};

export default function ClassroomSettingsDialog({
  classroom,
  allStudents,
  studentTypes,
  onSave,
  onClose,
}: ClassroomSettingsDialogProps) {
  const [enrolledIds, setEnrolledIds] = useState<string[]>([...classroom.studentIds]);
  const [selectedEnrolled, setSelectedEnrolled] = useState<string | null>(null);
  const [selectedOther, setSelectedOther] = useState<string | null>(null);
  const [seatCount, setSeatCount] = useState(classroom.maxCapacity);
  const [rankDisplay, setRankDisplay] = useState<RankDisplay>(classroom.rankDisplay ?? DEFAULT_RANK_DISPLAY);
  const [name, setName] = useState(classroom.name);
  const [studentTypeDrafts, setStudentTypeDrafts] = useState<StudentTypeDraft[]>(
    studentTypes.map(type => ({ originalName: type, name: type })),
  );
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

  const updateStudentType = (index: number, value: string) => {
    setStudentTypeDrafts(prev => prev.map((entry, i) => i === index ? { ...entry, name: value } : entry));
  };

  const moveStudentType = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= studentTypeDrafts.length) return;
    setStudentTypeDrafts(prev => {
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const removeStudentType = (index: number) => {
    const target = studentTypeDrafts[index];
    if (target.originalName && allStudents.some(student => student.type === target.originalName)) {
      const count = allStudents.filter(student => student.type === target.originalName).length;
      if (!window.confirm(`「${target.originalName}」は${count}名が使用中です。削除すると該当生徒の区分は「未設定」になります。削除しますか？`)) {
        return;
      }
    }
    setError('');
    setStudentTypeDrafts(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const normalizedNames = normalizeStudentTypes(studentTypeDrafts.map(entry => entry.name));
    if (normalizedNames.length === 0) {
      setError('生徒区分を1つ以上入力してください');
      return;
    }
    if (normalizedNames.length !== studentTypeDrafts.length) {
      setError('空欄または同じ名前の生徒区分があります');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await replaceStudentTypes(studentTypeDrafts);
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

          {/* 生徒プロフィールの共通区分。複数教室に所属しても同じ名称を使う。 */}
          <section style={{ border: '1px solid var(--color-line)', marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 8px',
              background: 'var(--color-raised)', borderBottom: '1px solid var(--color-line)',
            }}>
              <strong>生徒区分</strong>
              <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>全教室共通・名称変更は設定済みの生徒にも反映</span>
            </div>
            <div
              data-testid="student-type-editor"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 8 }}
            >
              {studentTypeDrafts.map((entry, index) => (
                <div key={`${entry.originalName ?? 'new'}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 20, textAlign: 'right', color: 'var(--color-muted)', fontSize: 10 }}>{index + 1}</span>
                  <input
                    aria-label={`生徒区分 ${index + 1}`}
                    value={entry.name}
                    onChange={event => updateStudentType(index, event.target.value)}
                    style={{
                      minWidth: 0, flex: 1, padding: '3px 5px', fontSize: 11,
                      border: '1px solid var(--color-field-line)', background: 'var(--color-ground)',
                    }}
                  />
                  <button type="button" aria-label={`${entry.name || index + 1}を上へ`} onClick={() => moveStudentType(index, -1)} disabled={index === 0} style={smallButtonStyle}>↑</button>
                  <button type="button" aria-label={`${entry.name || index + 1}を下へ`} onClick={() => moveStudentType(index, 1)} disabled={index === studentTypeDrafts.length - 1} style={smallButtonStyle}>↓</button>
                  <button type="button" aria-label={`${entry.name || index + 1}を削除`} onClick={() => removeStudentType(index)} style={{ ...smallButtonStyle, color: 'var(--color-alert-text)' }}>×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setStudentTypeDrafts(prev => [...prev, { originalName: null, name: '' }])}
                style={{
                  gridColumn: '1 / -1', padding: '4px 8px', border: '1px solid var(--color-line)',
                  background: 'var(--color-raised)', color: 'var(--color-ink)', cursor: 'pointer', fontSize: 11,
                }}
              >
                ＋ 区分を追加
              </button>
            </div>
          </section>

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
