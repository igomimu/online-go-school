import { useState } from 'react';
import type { Student } from '../../types/classroom';
import { RANK_OPTIONS } from '../../types/classroom';
import { upsertStudent } from '../../utils/classroomStore';
import { resolveGrade } from '../../utils/gradeCalc';

interface StudentEditDialogProps {
  student: Student;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const GRADES = ['', '小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3', '大学', '大人'];
const TYPES = ['', 'ネット生', '教室生', 'ネット教室生', '大人会員', '家族', '体験', 'プロ志望', '元生徒', 'Jネット生', 'スポット', 'ネット道場生', '道場生'];

// 保存先は online 専用の go_school_students（dojo-app の students には触れない）。
export default function StudentEditDialog({ student, onClose, onSaved }: StudentEditDialogProps) {
  const [form, setForm] = useState<Student>({
    ...student,
    studentCode: student.studentCode || student.id,
    birthdate: student.birthdate || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const nextId = (form.studentCode || form.id || '').trim();
    const nextName = form.name.trim();
    if (!nextId) {
      setError('生徒IDを入力してください');
      return;
    }
    if (!nextName) {
      setError('姓名を入力してください');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await upsertStudent(
        {
          ...form,
          id: nextId,
          studentCode: nextId,
          name: nextName,
        },
        student.id,
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const label: React.CSSProperties = { fontSize: 12, color: '#e4e4e7', display: 'block', marginBottom: 2 };
  const field: React.CSSProperties = { width: '100%', fontSize: 13, border: '1px solid #3f3f46', padding: '4px 6px', background: '#27272a', color: '#e4e4e7' };
  const readonlyField: React.CSSProperties = { ...field, opacity: 0.5 };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
    }}>
      <div style={{
        background: '#1c1c20', border: '2px solid #27272a', width: 540,
        fontFamily: 'var(--font-inter)', color: '#e4e4e7',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 10px', background: '#b45309', color: 'white', fontWeight: 'bold', fontSize: 13,
        }}>
          <span>生徒情報の編集 - {student.name} さん</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer' }}>&times;</button>
        </div>

        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>生徒ID / ログインコード</label>
            <input
              type="text"
              value={form.studentCode || form.id}
              onChange={e => setForm(f => ({ ...f, id: e.target.value, studentCode: e.target.value }))}
              style={field}
            />
          </div>
          <div>
            <label style={label}>姓名</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={field}
            />
          </div>
          <div>
            <label style={label}>段級位（棋力）</label>
            <select value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value }))} style={field}>
              <option value="">未設定</option>
              {RANK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>内部レーティング</label>
            <input
              type="text"
              value={form.internalRating}
              onChange={e => setForm(f => ({ ...f, internalRating: e.target.value }))}
              placeholder="R3 など（任意）"
              style={field}
            />
          </div>
          <div>
            <label style={label}>生徒種別</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={field}>
              {TYPES.map(t => <option key={t} value={t}>{t || '未設定'}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>生年月日</label>
            <input
              type="date"
              value={form.birthdate || ''}
              onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))}
              style={field}
            />
          </div>
          <div>
            <label style={label}>
              学年
              {form.birthdate && (
                <span style={{ color: '#a1a1aa', marginLeft: 6 }}>自動: {resolveGrade(form.birthdate, '')}</span>
              )}
            </label>
            <select
              value={form.grade}
              onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
              disabled={!!form.birthdate}
              style={form.birthdate ? readonlyField : field}
            >
              {GRADES.map(g => <option key={g} value={g}>{g || '未設定'}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>所在地</label>
            <input
              type="text"
              value={form.country}
              onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
              style={field}
            />
          </div>

          {error && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.12)', padding: '4px 6px', border: '1px solid #7f1d1d' }}>
              エラー: {error}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '8px 12px', background: '#141416', borderTop: '1px solid #27272a',
        }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '4px 14px', fontSize: 12, background: '#27272a', color: '#e4e4e7', border: '1px solid #3f3f46', cursor: 'pointer' }}>
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '4px 18px', fontSize: 12, fontWeight: 'bold', background: saving ? '#52525b' : '#b45309', color: '#fff', border: '1px solid #3f3f46', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
