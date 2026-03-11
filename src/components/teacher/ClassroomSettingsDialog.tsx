import { useState } from 'react';
import type { Student, Classroom } from '../../types/classroom';
import { updateClassroom } from '../../utils/classroomStore';

interface ClassroomSettingsDialogProps {
  classroom: Classroom;
  allStudents: Student[];
  onSave: () => void;
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

  const handleSave = () => {
    updateClassroom({
      ...classroom,
      studentIds: enrolledIds,
      maxCapacity: seatCount,
    });
    onSave();
  };

  const cellStyle: React.CSSProperties = {
    padding: '2px 6px',
    border: '1px solid #ccc',
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
        background: '#e8e8e0',
        border: '2px solid #666',
        width: 800,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'MS Gothic, "Noto Sans JP", monospace',
        fontSize: 12,
        color: '#333',
      }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: '#d0d0c8',
          borderBottom: '1px solid #999',
          fontWeight: 'bold',
          fontSize: 13,
        }}>
          教室情報設定
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#666',
          }}>&times;</button>
        </div>

        <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
          {/* 教室名 + 設定 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold' }}>教室名</label>
            <div style={{
              padding: '2px 8px',
              background: '#fff',
              border: '1px solid #999',
              flex: 1,
              fontSize: 12,
            }}>
              {classroom.name}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold' }}>部屋席数</label>
            <select
              value={seatCount}
              onChange={e => setSeatCount(Number(e.target.value))}
              style={{
                padding: '2px 6px',
                border: '1px solid #999',
                background: '#fff',
                fontSize: 12,
              }}
            >
              {[5, 8, 10, 12, 15, 20].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* 在籍生・その他 デュアルリスト */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* 左: 在籍生 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '4px 8px',
                background: '#3030a0',
                color: 'white',
                fontWeight: 'bold',
                fontSize: 12,
              }}>
                在籍生
              </div>
              <div style={{
                border: '1px solid #999',
                background: '#fff',
                height: 320,
                overflowY: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#d0d0c8' }}>
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
                            background: isSelected ? '#b0f0f0' : i % 2 === 0 ? '#fff' : '#f8f8f0',
                          }}
                        >
                          <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ ...cellStyle, fontSize: 10 }}>{s.id}</td>
                          <td style={{ ...cellStyle, fontWeight: 'bold' }}>{s.name}</td>
                          <td style={{ ...cellStyle, textAlign: 'center', color: '#cc6600' }}>{s.internalRating}</td>
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
                background: '#606060',
                color: 'white',
                fontWeight: 'bold',
                fontSize: 12,
              }}>
                その他
              </div>
              <div style={{
                border: '1px solid #999',
                background: '#fff',
                height: 320,
                overflowY: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#d0d0c8' }}>
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
                            background: isSelected ? '#ffe0b0' : i % 2 === 0 ? '#fff' : '#f8f8f0',
                          }}
                        >
                          <td style={{ ...cellStyle, fontSize: 10 }}>{s.id}</td>
                          <td style={{ ...cellStyle, fontWeight: 'bold' }}>{s.name}</td>
                          <td style={{ ...cellStyle, textAlign: 'center', color: '#cc6600' }}>{s.internalRating}</td>
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
          borderTop: '1px solid #999',
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          background: '#d0d0c8',
        }}>
          <button onClick={handleSave} style={{
            padding: '6px 32px',
            fontSize: 13,
            fontWeight: 'bold',
            border: '1px solid #333',
            background: '#60a060',
            color: 'white',
            cursor: 'pointer',
          }}>
            保存
          </button>
          <button onClick={onClose} style={{
            padding: '6px 32px',
            fontSize: 13,
            fontWeight: 'bold',
            border: '1px solid #666',
            background: '#d0d0c8',
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
        border: '1px solid #666',
        background: '#d8d0c0',
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
