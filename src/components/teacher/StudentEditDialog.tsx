import { useState } from 'react';
import type { Student } from '../../types/classroom';
import { RANK_OPTIONS } from '../../types/classroom';
import { upsertStudent } from '../../utils/classroomStore';

interface StudentEditDialogProps {
  student: Student;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

/**
 * 生徒一覧から講師が段級位（ランク）・内部レーティングを変更するダイアログ。
 * 保存先は online 専用の go_school_students（dojo-app の students には触れない）。
 */
export default function StudentEditDialog({ student, onClose, onSaved }: StudentEditDialogProps) {
  const [rank, setRank] = useState(student.rank || '');
  const [internalRating, setInternalRating] = useState(student.internalRating || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertStudent({ ...student, rank, internalRating }, student.id);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const label: React.CSSProperties = { fontSize: 12, color: '#333', display: 'block', marginBottom: 2 };
  const field: React.CSSProperties = { width: '100%', fontSize: 13, border: '1px solid #999', padding: '4px 6px', background: '#fff' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
    }}>
      <div style={{
        background: '#e8e8e0', border: '2px solid #666', width: 340,
        fontFamily: 'MS Gothic, "Noto Sans JP", monospace', color: '#333',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 10px', background: '#3030a0', color: 'white', fontWeight: 'bold', fontSize: 13,
        }}>
          <span>生徒情報の編集 - {student.name} さん</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer' }}>&times;</button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={label}>段級位（棋力）</label>
            <select value={rank} onChange={e => setRank(e.target.value)} style={field}>
              <option value="">未設定</option>
              {RANK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>内部レーティング</label>
            <input
              type="text"
              value={internalRating}
              onChange={e => setInternalRating(e.target.value)}
              placeholder="R3 など（任意）"
              style={field}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#cc0000', background: '#fdd', padding: '4px 6px', border: '1px solid #e99' }}>
              エラー: {error}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '8px 12px', background: '#d0d0c8', borderTop: '1px solid #999',
        }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '4px 14px', fontSize: 12, background: '#fff', border: '1px solid #999', cursor: 'pointer' }}>
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '4px 18px', fontSize: 12, fontWeight: 'bold', background: saving ? '#aaa' : '#3030a0', color: '#fff', border: '1px solid #333', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
