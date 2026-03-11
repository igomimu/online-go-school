import { useState } from 'react';
import type { Student } from '../../types/classroom';

interface StudentLinkGeneratorProps {
  students: Student[];
  onClose: () => void;
}

export default function StudentLinkGenerator({ students, onClose }: StudentLinkGeneratorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const baseUrl = `${window.location.origin}${window.location.pathname}`;

  const makeLink = (student: Student): string => {
    const params = new URLSearchParams({
      role: 'STUDENT',
      studentId: student.id,
      studentName: student.name,
    });
    return `${baseUrl}?${params.toString()}`;
  };

  const copyLink = (student: Student) => {
    navigator.clipboard.writeText(makeLink(student)).catch(() => {});
    setCopiedId(student.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAll = () => {
    const lines = students.map(s => `${s.name}: ${makeLink(s)}`).join('\n');
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
        width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        fontFamily: 'MS Gothic, monospace', fontSize: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 'bold', fontSize: 14 }}>生徒リンク一覧</span>
          <div style={{ display: 'flex', gap: 4 }}>
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

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#d0d0c8' }}>
                <th style={{ border: '1px solid #999', padding: '2px 6px', textAlign: 'left' }}>生徒名</th>
                <th style={{ border: '1px solid #999', padding: '2px 6px', textAlign: 'left' }}>棋力</th>
                <th style={{ border: '1px solid #999', padding: '2px 6px', textAlign: 'center', width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} style={{ background: copiedId === s.id ? '#90ee90' : 'white' }}>
                  <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{s.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{s.rank || ''}</td>
                  <td style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'center' }}>
                    <button
                      onClick={() => copyLink(s)}
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
