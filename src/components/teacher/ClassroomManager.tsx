import { useState, useRef } from 'react';
import type { Student, Classroom } from '../../types/classroom';
import {
  addStudent,
  updateStudent,
  deleteStudent,
  addClassroom,
  deleteClassroom,
  importAll,
} from '../../utils/classroomStore';
import { parseIgcXml } from '../../utils/igcImport';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';

interface ClassroomManagerProps {
  students: Student[];
  classrooms: Classroom[];
  onLaunchClassroom: (classroomId: string) => void;
  onOpenSettings: () => void;
  onOpenStudentManager: () => void;
  onReloadData: () => void;
  onBack: () => void;
}

type TabId = 'classroom' | 'student';

const RANKS = [
  '8D', '7D', '6D', '5D', '4D', '3D', '2D', '1D',
  '1K', '2K', '3K', '4K', '5K', '6K', '7K', '8K', '9K', '10K',
  '11K', '12K', '13K', '14K', '15K', '20K', '25K', '30K',
];
const GRADES = ['', '小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3', '大学', '大人'];
const TYPES = ['', 'ネット生', '教室生', 'ネット教室生', '大人会員', '家族', '体験', 'プロ志望', '元生徒', 'Jネット生', 'スポット', 'ネット道場生', '道場生'];

export default function ClassroomManager({
  students,
  classrooms,
  onLaunchClassroom,
  onOpenSettings,
  onReloadData,
  onBack,
}: ClassroomManagerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('classroom');
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 生徒フォーム
  const emptyForm: Student = { id: '', name: '', rank: '', internalRating: '', type: '', grade: '', country: '' };
  const [form, setForm] = useState<Student>(emptyForm);

  const startAddStudent = () => {
    setForm({ ...emptyForm, id: `S${Date.now()}` });
    setEditingStudent(null);
    setIsAddingStudent(true);
  };

  const startEditStudent = (s: Student) => {
    setForm({ ...s });
    setEditingStudent(s);
    setIsAddingStudent(true);
  };

  const handleSaveStudent = () => {
    if (!form.name.trim()) return;
    if (editingStudent) {
      updateStudent(form);
    } else {
      addStudent(form);
    }
    setIsAddingStudent(false);
    setEditingStudent(null);
    onReloadData();
  };

  const handleDeleteStudent = (id: string) => {
    if (!confirm('この生徒を削除しますか？')) return;
    deleteStudent(id);
    onReloadData();
  };

  const handleAddClassroom = () => {
    const name = prompt('教室名を入力してください:');
    if (!name) return;
    const capStr = prompt('部屋席数 (デフォルト: 10):', '10');
    const cap = parseInt(capStr || '10') || 10;
    addClassroom({ id: `CLS${Date.now()}`, name, maxCapacity: cap, studentIds: [] });
    onReloadData();
  };

  const handleDeleteClassroom = (id: string) => {
    if (!confirm('この教室を削除しますか？')) return;
    deleteClassroom(id);
    onReloadData();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const result = parseIgcXml(text);
      if (result.errors.length > 0) {
        setImportResult(`エラー: ${result.errors.join(', ')}`);
        return;
      }
      importAll(result.students, result.classrooms);
      onReloadData();
      setImportResult(`${result.students.length}名の生徒、${result.classrooms.length}教室をインポートしました`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const cellStyle: React.CSSProperties = {
    padding: '3px 6px',
    border: '1px solid #ccc',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: '#d0d0c8',
    fontWeight: 'bold',
    borderBottom: '2px solid #999',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#ffff80',
      color: '#333',
      fontFamily: 'MS Gothic, "Noto Sans JP", monospace',
      fontSize: 12,
    }}>
      {/* タイトルバー */}
      <div style={{
        background: '#3030a0',
        color: 'white',
        padding: '4px 10px',
        fontSize: 13,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          background: '#333',
          color: 'white',
          borderRadius: '50%',
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
        }}>囲</span>
        ネット囲碁学園 Ver10.4〜先生管理
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 0, background: '#d0d0c8', padding: '0 4px' }}>
        <TabButton label="教室情報" active={activeTab === 'classroom'} onClick={() => setActiveTab('classroom')} />
        <TabButton label="生徒情報" active={activeTab === 'student'} onClick={() => setActiveTab('student')} />
      </div>

      {/* メインエリア: 左=情報パネル、右=テーブル */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左サイドパネル */}
        <div style={{
          width: 280,
          padding: '12px 16px',
          borderRight: '2px solid #999',
          background: '#ffff80',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{
            background: '#e0e0d0',
            border: '2px solid #999',
            padding: 10,
            fontSize: 11,
            lineHeight: 1.6,
          }}>
            ※生徒の姓名に設定しますと、生徒として棋譜管理ができます。
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', width: 50 }}>姓名</label>
            <div style={{ flex: 1, background: '#fff', border: '1px solid #999', padding: '2px 6px' }}>
              三村 智保
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', width: 50 }}>棋力</label>
            <div style={{ flex: 1, background: '#fff', border: '1px solid #999', padding: '2px 6px' }}>
              9P
            </div>
          </div>

          {/* XMLインポート */}
          <div style={{
            background: '#e0f0e0',
            border: '2px solid #60a060',
            padding: 10,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>データ登録</div>
            <input ref={fileInputRef} type="file" accept=".xml" onChange={handleImportFile} style={{ display: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <IgcButton label="XMLインポート" color="#90d060" onClick={() => fileInputRef.current?.click()} />
              <IgcButton label="教室を追加" color="#60c0f0" onClick={handleAddClassroom} />
              <IgcButton label="生徒を追加" color="#f0c060" onClick={() => { setActiveTab('student'); startAddStudent(); }} />
            </div>
            {importResult && (
              <div style={{
                marginTop: 6,
                padding: 4,
                fontSize: 10,
                background: importResult.startsWith('エラー') ? '#fdd' : '#dfd',
                border: `1px solid ${importResult.startsWith('エラー') ? '#c00' : '#0a0'}`,
              }}>
                {importResult}
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div style={{ color: '#cc0000', fontWeight: 'bold', marginBottom: 8, fontSize: 11 }}>
              定期的に教室情報のバックアップをお願いします。
            </div>
          </div>
        </div>

        {/* 右: テーブルエリア */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#e8e8e0' }}>
          {activeTab === 'classroom' ? (
            /* === 教室情報タブ === */
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerCellStyle, width: 26, textAlign: 'center' }}>×</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>編集</th>
                    <th style={{ ...headerCellStyle, width: 44, textAlign: 'center' }}>開く</th>
                    <th style={{ ...headerCellStyle, width: 50, textAlign: 'center' }}>講義</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>教室名</th>
                    <th style={{ ...headerCellStyle, width: 50, textAlign: 'center' }}>生徒数</th>
                    <th style={{ ...headerCellStyle, width: 70, textAlign: 'center' }}>部屋席数</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {classrooms.map((cls, i) => (
                    <tr key={cls.id} style={{
                      background: i % 2 === 0 ? '#f0f0e8' : '#e8e8e0',
                    }}>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteClassroom(cls.id)}
                          style={{ color: '#cc0000', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
                        >×</button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <RowButton label="調整" onClick={() => setEditingClassroom(cls)} />
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <RowButton label="開く" onClick={() => onLaunchClassroom(cls.id)} bold />
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <RowButton label="開始" onClick={() => onLaunchClassroom(cls.id)} />
                      </td>
                      <td style={{
                        ...cellStyle,
                        fontWeight: 'bold',
                        background: '#b0f0b0',
                      }}>
                        {cls.name}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        {cls.studentIds.length}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        1×{cls.maxCapacity}+{Math.max(0, cls.maxCapacity - 1)}
                      </td>
                      <td style={cellStyle}></td>
                    </tr>
                  ))}

                  {classrooms.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 30, textAlign: 'center' }}>
                        <div style={{ color: '#999', marginBottom: 12 }}>
                          教室がありません
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                          <IgcButton label="XMLインポート" color="#90d060" onClick={() => fileInputRef.current?.click()} />
                          <IgcButton label="教室を手動追加" color="#60c0f0" onClick={handleAddClassroom} />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* === 生徒情報タブ === */
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* 生徒追加/編集フォーム */}
              {isAddingStudent && (
                <div style={{
                  background: '#fffff0',
                  border: '2px solid #999',
                  padding: 12,
                  margin: 8,
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>
                    {editingStudent ? '生徒を編集' : '生徒を追加'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <FormField label="名前 *" width={160}>
                      <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        style={inputStyle} />
                    </FormField>
                    <FormField label="棋力" width={80}>
                      <select value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value }))} style={inputStyle}>
                        <option value="">--</option>
                        {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </FormField>
                    <FormField label="内部R" width={60}>
                      <input type="text" value={form.internalRating} onChange={e => setForm(f => ({ ...f, internalRating: e.target.value }))}
                        placeholder="R3" style={inputStyle} />
                    </FormField>
                    <FormField label="種別" width={120}>
                      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                        {TYPES.map(t => <option key={t} value={t}>{t || '--'}</option>)}
                      </select>
                    </FormField>
                    <FormField label="学年" width={80}>
                      <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} style={inputStyle}>
                        {GRADES.map(g => <option key={g} value={g}>{g || '--'}</option>)}
                      </select>
                    </FormField>
                    <FormField label="所在地" width={120}>
                      <input type="text" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                        style={inputStyle} />
                    </FormField>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <IgcButton label={editingStudent ? '更新' : '追加'} color="#60a060" onClick={handleSaveStudent} />
                    <IgcButton label="キャンセル" onClick={() => setIsAddingStudent(false)} />
                  </div>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerCellStyle, width: 26, textAlign: 'center' }}>×</th>
                    <th style={{ ...headerCellStyle, width: 36, textAlign: 'center' }}>編集</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>生徒ID</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>姓名</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>棋力</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>R</th>
                    <th style={{ ...headerCellStyle, width: 70, textAlign: 'left' }}>生徒種別</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>学年</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>所在地</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} style={{
                      background: i % 2 === 0 ? '#f0f0e8' : '#e8e8e0',
                    }}>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteStudent(s.id)}
                          style={{ color: '#cc0000', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
                        >×</button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <RowButton label="編集" onClick={() => startEditStudent(s)} />
                      </td>
                      <td style={{ ...cellStyle, fontSize: 10 }}>{s.id}</td>
                      <td style={{
                        ...cellStyle,
                        fontWeight: 'bold',
                        background: '#ffe0b0',
                      }}>
                        {s.name}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{s.rank}</td>
                      <td style={{ ...cellStyle, textAlign: 'center', color: '#cc6600' }}>{s.internalRating}</td>
                      <td style={cellStyle}>{s.type}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{s.grade}</td>
                      <td style={cellStyle}>{s.country}</td>
                    </tr>
                  ))}

                  {students.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: 30, textAlign: 'center' }}>
                        <div style={{ color: '#999', marginBottom: 12 }}>
                          生徒がいません
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                          <IgcButton label="XMLインポート" color="#90d060" onClick={() => fileInputRef.current?.click()} />
                          <IgcButton label="生徒を手動追加" color="#f0c060" onClick={startAddStudent} />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 下部ツールバー */}
      <div style={{
        padding: '4px 8px',
        borderTop: '2px solid #999',
        background: '#c0c0b8',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <IgcButton label="閉じる" onClick={onBack} />
        <div style={{ flex: 1 }} />
        <IgcButton label="教室追加" color="#60c0f0" onClick={handleAddClassroom} />
        <IgcButton label="生徒追加" color="#f0c060" onClick={() => { setActiveTab('student'); startAddStudent(); }} />
        <IgcButton label="XMLインポート" color="#90d060" onClick={() => fileInputRef.current?.click()} />
        <IgcButton label="LiveKit設定" color="#d0d0c8" onClick={onOpenSettings} />
        <DateTimeDisplay />
      </div>

      {/* 教室設定ダイアログ（生徒入替） */}
      {editingClassroom && (
        <ClassroomSettingsDialog
          classroom={editingClassroom}
          allStudents={students}
          onSave={() => {
            setEditingClassroom(null);
            onReloadData();
          }}
          onClose={() => setEditingClassroom(null)}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '2px 4px',
  fontSize: 11,
  border: '1px solid #999',
  background: '#fff',
  fontFamily: 'MS Gothic, monospace',
};

function FormField({ label, width, children }: { label: string; width: number; children: React.ReactNode }) {
  return (
    <div style={{ width }}>
      <div style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 24px',
        fontSize: 13,
        fontWeight: 'bold',
        border: '1px solid #999',
        borderBottom: active ? '1px solid #e8e8e0' : '1px solid #999',
        background: active ? '#e8e8e0' : '#d0d0c8',
        cursor: 'pointer',
        borderRadius: '4px 4px 0 0',
        marginBottom: -1,
        color: '#333',
      }}
    >
      {label}
    </button>
  );
}

function RowButton({ label, onClick, bold }: { label: string; onClick: () => void; bold?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: bold ? 'bold' : 'normal',
        border: '1px solid #666',
        background: '#d8d0c0',
        cursor: 'pointer',
        fontFamily: 'MS Gothic, monospace',
      }}
    >
      {label}
    </button>
  );
}

function IgcButton({ label, color, onClick }: { label: string; color?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        fontSize: 11,
        fontWeight: 'bold',
        fontFamily: 'MS Gothic, monospace',
        border: '1px solid #666',
        background: color || '#d0d0c8',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        opacity: onClick ? 1 : 0.5,
      }}
    >
      {label}
    </button>
  );
}

function DateTimeDisplay() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayStr = dayNames[now.getDay()];
  return (
    <div style={{
      marginLeft: 8,
      fontSize: 12,
      fontWeight: 'bold',
      color: '#cc0000',
      textAlign: 'right',
      lineHeight: 1.2,
      fontFamily: 'MS Gothic, monospace',
    }}>
      <div>{dateStr}（{dayStr}曜日）</div>
      <div style={{ fontSize: 14 }}>{now.toLocaleTimeString('ja-JP')}</div>
    </div>
  );
}
