import { useState, useRef } from 'react';
import { X, Plus, Pencil, Trash2, Upload, Search } from 'lucide-react';
import type { Student, Classroom } from '../types/classroom';
import { parseIgcXml } from '../utils/igcImport';
import {
  addStudent,
  updateStudent,
  deleteStudent,
  addClassroom,
  deleteClassroom,
  importAll,
} from '../utils/classroomStore';

interface StudentManagerProps {
  students: Student[];
  classrooms: Classroom[];
  onDataChanged: () => void;
  onClose: () => void;
}

type Tab = 'students' | 'classrooms' | 'import';

const RANKS = [
  '8D', '7D', '6D', '5D', '4D', '3D', '2D', '1D',
  '1K', '2K', '3K', '4K', '5K', '6K', '7K', '8K', '9K', '10K',
  '11K', '12K', '13K', '14K', '15K', '16K', '17K', '18K', '19K', '20K',
  '25K', '30K',
];

const GRADES = ['', '小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3', '大学', '大人'];
const TYPES = ['', 'ネット生', '教室生', 'ネット教室生', '大人会員', '家族', '体験', 'プロ志望', '元生徒'];

export default function StudentManager({
  students,
  classrooms,
  onDataChanged,
  onClose,
}: StudentManagerProps) {
  const [tab, setTab] = useState<Tab>('students');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 新規/編集フォーム
  const [form, setForm] = useState<Student>({
    id: '', name: '', rank: '', internalRating: '', type: '', grade: '', country: '',
  });

  const startAdd = () => {
    setForm({ id: `S${Date.now()}`, name: '', rank: '', internalRating: '', type: '', grade: '', country: '' });
    setEditingStudent(null);
    setIsAdding(true);
  };

  const startEdit = (s: Student) => {
    setForm({ ...s });
    setEditingStudent(s);
    setIsAdding(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editingStudent) {
      updateStudent(form);
    } else {
      addStudent(form);
    }
    setIsAdding(false);
    setEditingStudent(null);
    onDataChanged();
  };

  const handleDelete = (id: string) => {
    if (!confirm('この生徒を削除しますか？')) return;
    deleteStudent(id);
    onDataChanged();
  };

  const handleDeleteClassroom = (id: string) => {
    if (!confirm('この教室を削除しますか？')) return;
    deleteClassroom(id);
    onDataChanged();
  };

  const handleAddClassroom = () => {
    const name = prompt('教室名を入力');
    if (!name) return;
    addClassroom({
      id: `CLS${Date.now()}`,
      name,
      maxCapacity: 10,
      studentIds: [],
    });
    onDataChanged();
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
      onDataChanged();
      setImportResult(`${result.students.length}名の生徒、${result.classrooms.length}教室をインポートしました`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 検索フィルタ
  const filtered = students.filter(s =>
    !searchQuery || s.name.includes(searchQuery) || s.rank.includes(searchQuery) || s.country.includes(searchQuery)
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="glass-panel p-6 w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">生徒・教室管理</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ */}
        <div className="flex gap-1 mb-4">
          {([['students', '生徒'], ['classrooms', '教室'], ['import', 'インポート']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === key ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto">
          {/* === 生徒タブ === */}
          {tab === 'students' && !isAdding && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="検索..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button onClick={startAdd} className="premium-button flex items-center gap-1 text-sm">
                  <Plus className="w-4 h-4" /> 追加
                </button>
              </div>

              <div className="text-xs text-zinc-500">{filtered.length}名</div>

              <div className="space-y-1">
                {filtered.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{s.name}</span>
                      {s.rank && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono shrink-0">
                          {s.rank}
                        </span>
                      )}
                      {s.internalRating && (
                        <span className="text-xs text-zinc-500 shrink-0">{s.internalRating}</span>
                      )}
                      {s.grade && (
                        <span className="text-xs text-zinc-500 shrink-0">{s.grade}</span>
                      )}
                      {s.type && (
                        <span className="text-xs text-zinc-600 shrink-0">{s.type}</span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button onClick={() => startEdit(s)} className="p-1 hover:bg-white/10 rounded">
                        <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="p-1 hover:bg-red-500/20 rounded">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === 生徒追加/編集フォーム === */}
          {tab === 'students' && isAdding && (
            <div className="space-y-4">
              <h3 className="font-bold">{editingStudent ? '生徒を編集' : '生徒を追加'}</h3>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">名前 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">棋力</label>
                  <select
                    value={form.rank}
                    onChange={e => setForm(f => ({ ...f, rank: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">未設定</option>
                    {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">内部レーティング</label>
                  <input
                    type="text"
                    value={form.internalRating}
                    onChange={e => setForm(f => ({ ...f, internalRating: e.target.value }))}
                    placeholder="R3"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">種別</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    {TYPES.map(t => <option key={t} value={t}>{t || '未設定'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">学年</label>
                  <select
                    value={form.grade}
                    onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    {GRADES.map(g => <option key={g} value={g}>{g || '未設定'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">所在地</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSave} disabled={!form.name.trim()} className="premium-button disabled:opacity-30">
                  {editingStudent ? '更新' : '追加'}
                </button>
                <button onClick={() => setIsAdding(false)} className="secondary-button">
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* === 教室タブ === */}
          {tab === 'classrooms' && (
            <div className="space-y-3">
              <button onClick={handleAddClassroom} className="premium-button flex items-center gap-1 text-sm">
                <Plus className="w-4 h-4" /> 教室を追加
              </button>

              {classrooms.map(c => {
                const memberStudents = c.studentIds
                  .map(sid => students.find(s => s.id === sid))
                  .filter(Boolean) as Student[];
                return (
                  <div key={c.id} className="glass-panel p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-zinc-500 ml-2">
                          {memberStudents.length}/{c.maxCapacity}名
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteClassroom(c.id)}
                        className="p-1 hover:bg-red-500/20 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                    {memberStudents.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {memberStudents.map(s => (
                          <span key={s.id} className="px-2 py-0.5 bg-white/5 rounded text-xs">
                            {s.name}
                            {s.rank && <span className="ml-1 text-amber-400">{s.rank}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {classrooms.length === 0 && (
                <p className="text-sm text-zinc-500">教室がありません。インポートまたは手動追加してください。</p>
              )}
            </div>
          )}

          {/* === インポートタブ === */}
          {tab === 'import' && (
            <div className="space-y-4">
              <div className="glass-panel p-4 space-y-3">
                <h3 className="font-bold text-sm">igocampus XMLインポート</h3>
                <p className="text-xs text-zinc-400">
                  igocampusのXMLファイルから生徒・教室データをインポートします。
                  既存データは上書きされます。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,.igc"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="premium-button flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" /> XMLファイルを選択
                </button>
                {importResult && (
                  <div className={`text-sm px-3 py-2 rounded-lg ${
                    importResult.startsWith('エラー')
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-green-500/10 text-green-400'
                  }`}>
                    {importResult}
                  </div>
                )}
              </div>

              <div className="text-xs text-zinc-500 space-y-1">
                <p>現在のデータ: {students.length}名の生徒、{classrooms.length}教室</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
