import { useState } from 'react';
import type { Student } from '../../types/classroom';

interface StudentLinkGeneratorProps {
  students: Student[];
  classroomId?: string;
  onClose: () => void;
}

export default function StudentLinkGenerator({ students, classroomId, onClose }: StudentLinkGeneratorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showMode, setShowMode] = useState<'link' | 'id'>('id');

  const baseUrl = `${window.location.origin}${window.location.pathname}`;

  const makeLink = (student: Student): string => {
    const params = new URLSearchParams({
      classroomId: classroomId || '',
      studentId: student.id,
    });
    return `${baseUrl}?${params.toString()}`;
  };

  const copyLink = (student: Student) => {
    navigator.clipboard.writeText(makeLink(student)).catch(() => {});
    setCopiedId(student.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyIdPair = (student: Student) => {
    const text = `生徒ID: ${student.id}\n教室ID: ${classroomId || '(未選択)'}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(student.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAll = () => {
    let lines: string;
    if (showMode === 'id') {
      lines = students.map(s =>
        `${s.name}  生徒ID: ${s.id}  教室ID: ${classroomId || ''}`
      ).join('\n');
    } else {
      lines = students.map(s => `${s.name}: ${makeLink(s)}`).join('\n');
    }
    navigator.clipboard.writeText(lines).catch(() => {});
    setCopiedId('__all__');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#f0f0e8', border: '2px solid #666', padding: 16,
        width: 700, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        fontFamily: 'MS Gothic, monospace', fontSize: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 'bold', fontSize: 14 }}>生徒ログイン情報</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setShowMode(showMode === 'id' ? 'link' : 'id')}
              style={{
                padding: '3px 12px', border: '1px solid #666',
                background: '#e0e0d8', cursor: 'pointer', fontSize: 12,
              }}
            >
              {showMode === 'id' ? 'リンク表示' : 'ID表示'}
            </button>
            <button
              onClick={copyAll}
              style={{
                padding: '3px 12px', border: '1px solid #666',
                background: copiedId === '__all__' ? '#90ee90' : '#f0e060',
                cursor: 'pointer', fontSize: 12,
              }}
            >
              {copiedId === '__all__' ? '✓ 全コピー済み' : '全員分コピー'}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '3px 12px', border: '1px solid #666',
                background: '#d0d0c8', cursor: 'pointer', fontSize: 12,
              }}
            >
              閉じる
            </button>
          </div>
        </div>

        {classroomId && (
          <div style={{ background: '#e8e8e0', padding: '4px 8px', marginBottom: 8, border: '1px solid #ccc' }}>
            教室ID: <strong>{classroomId}</strong>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#d0d0c8' }}>
                <th style={{ border: '1px solid #999', padding: '2px 6px', textAlign: 'left' }}>生徒名</th>
                <th style={{ border: '1px solid #999', padding: '2px 6px', textAlign: 'left' }}>棋力</th>
                <th style={{ border: '1px solid #999', padding: '2px 6px', textAlign: 'left' }}>
                  {showMode === 'id' ? '生徒ID' : 'リンク'}
                </th>
                <th style={{ border: '1px solid #999', padding: '2px 6px', textAlign: 'center', width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} style={{ background: copiedId === s.id ? '#90ee90' : 'white' }}>
                  <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{s.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{s.rank || ''}</td>
                  <td style={{ border: '1px solid #ccc', padding: '2px 6px', fontSize: 11, wordBreak: 'break-all' }}>
                    {showMode === 'id' ? s.id : makeLink(s)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'center' }}>
                    <button
                      onClick={() => showMode === 'id' ? copyIdPair(s) : copyLink(s)}
                      style={{
                        padding: '1px 8px', border: '1px solid #999',
                        background: copiedId === s.id ? '#90ee90' : '#e8e8e0',
                        cursor: 'pointer', fontSize: 11,
                      }}
                    >
                      {copiedId === s.id ? '✓' : 'コピー'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && (
            <div style={{ textAlign: 'center', padding: 16, color: '#666' }}>
              生徒が登録されていません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
