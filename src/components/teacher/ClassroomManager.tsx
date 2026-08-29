import { useState, useRef } from 'react';
import type { Student, Classroom } from '../../types/classroom';
import { normalizeStudentTypes } from '../../types/classroom';
import {
  deleteStudent,
  deleteStudents,
  upsertStudent,
  upsertStudents,
  upsertClassroom,
  deleteClassroom,
  importAll,
  migrateCachedRosterToSupabase,
} from '../../utils/classroomStore';
import { parseIgcXml } from '../../utils/igcImport';
import { fetchDojoNetStudents } from '../../utils/dojoSync';
import { resolveGrade } from '../../utils/gradeCalc';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';
import { buildStudentLoginLink } from '../../utils/studentLoginLink';

interface ClassroomManagerProps {
  students: Student[];
  classrooms: Classroom[];
  studentTypes: string[];
  onLaunchClassroom: (classroomId: string) => void;
  onOpenSettings: () => void;
  onOpenStudentManager: () => void;
  onReloadData: () => void | Promise<void>;
  onBack: () => void;
}

type TabId = 'classroom' | 'student';

const RANKS = [
  '8D', '7D', '6D', '5D', '4D', '3D', '2D', '1D',
  '1K', '2K', '3K', '4K', '5K', '6K', '7K', '8K', '9K', '10K',
  '11K', '12K', '13K', '14K', '15K', '20K', '25K', '30K',
];
const GRADES = ['', '小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3', '大学', '大人'];
export default function ClassroomManager({
  students,
  classrooms,
  studentTypes,
  onLaunchClassroom,
  onOpenSettings,
  onReloadData,
  onBack,
}: ClassroomManagerProps) {
  const pwaInstall = usePwaInstall();
  const [activeTab, setActiveTab] = useState<TabId>('classroom');
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  /**
   * ID を発行した直後に出す参加リンク。初めて使う大人には、コードだけ伝えても
   * 「どこに打つのか」で詰まる。発行の場でそのまま送れる形にしておく（2026-08-30 三村さん）。
   */
  const [issuedStudent, setIssuedStudent] = useState<{ name: string; code: string } | null>(null);
  const [issuedClassroomId, setIssuedClassroomId] = useState('');
  const [issuedLinkCopied, setIssuedLinkCopied] = useState(false);

  const toggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllStudents = () => {
    setSelectedStudentIds(prev => {
      if (prev.size === students.length) {
        return new Set();
      } else {
        return new Set(students.map(s => s.id));
      }
    });
  };

  const handleBulkDeleteStudents = async () => {
    const count = selectedStudentIds.size;
    if (count === 0) return;
    if (!confirm(`選択した ${count} 名の生徒を一括削除しますか？`)) return;
    try {
      setSyncing(true);
      setImportResult(null);
      await deleteStudents(Array.from(selectedStudentIds));
      setSelectedStudentIds(new Set());
      await onReloadData();
      setImportResult(`${count} 名の生徒を一括削除しました。`);
    } catch (err) {
      setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  // 道場アプリからネット生を同期
  const handleDojoSync = async () => {
    setSyncing(true);
    setImportResult(null);
    const result = await fetchDojoNetStudents();
    if (result.error) {
      setImportResult(`エラー: ${result.error}`);
      setSyncing(false);
      return;
    }
    // 既存の生徒とマージ（IDが同じなら上書き、なければ追加）
    const existing = students;
    const merged = [...existing];
    let addedCount = 0;
    let updatedCount = 0;
    for (const s of result.students) {
      const idx = merged.findIndex(e => e.id === s.id);
      if (idx >= 0) {
        merged[idx] = s;
        updatedCount++;
      } else {
        merged.push(s);
        addedCount++;
      }
    }
    try {
      await upsertStudents(merged);
      await onReloadData();
      setImportResult(`道場連携完了: ${result.students.length}名のネット生（追加${addedCount}名, 更新${updatedCount}名）`);
    } catch (err) {
      setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSyncing(false);
  };

  // 生徒フォーム
  const emptyForm: Student = { id: '', name: '', rank: '', internalRating: '', type: '', grade: '', country: '', birthdate: '' };
  const [form, setForm] = useState<Student>(emptyForm);
  const studentTypeOptions = normalizeStudentTypes([...studentTypes, form.type]);

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

  const handleSaveStudent = async () => {
    if (!form.name.trim()) return;
    const loginCode = (form.studentCode || form.id || '').trim();
    try {
      // 識別子をログインコードに統一（名簿id = 接続identity = 対局の打ち手 を一致させる）
      await upsertStudent({ ...form, id: loginCode || form.id, studentCode: loginCode || form.id }, editingStudent?.id);
      setIsAddingStudent(false);
      setEditingStudent(null);
      await onReloadData();
      const savedCode = loginCode || form.id;
      setImportResult(`「${form.name}」を登録しました（ログインコード: ${savedCode}）`);
      // 所属が分かっていればその教室を、まだ無ければ先生に選んでもらう
      const belongsTo = classrooms.find(c => c.studentIds.includes(savedCode));
      setIssuedStudent({ name: form.name, code: savedCode });
      setIssuedClassroomId(belongsTo?.id || issuedClassroomId || '');
      setIssuedLinkCopied(false);
    } catch (err) {
      setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm('この生徒を削除しますか？')) return;
    try {
      await deleteStudent(id);
      await onReloadData();
    } catch (err) {
      setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAddClassroom = async () => {
    const name = prompt('教室名を入力してください:');
    if (!name) return;
    const capStr = prompt('部屋席数 (デフォルト: 10):', '10');
    const cap = parseInt(capStr || '10') || 10;
    try {
      await upsertClassroom({ id: `CLS${Date.now()}`, name, maxCapacity: cap, studentIds: [] });
      await onReloadData();
    } catch (err) {
      setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteClassroom = async (id: string) => {
    if (!confirm('この教室を削除しますか？')) return;
    try {
      await deleteClassroom(id);
      await onReloadData();
    } catch (err) {
      setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const result = parseIgcXml(text);
      if (result.errors.length > 0) {
        setImportResult(`エラー: ${result.errors.join(', ')}`);
        return;
      }
      try {
        await importAll(result.students, result.classrooms);
        await onReloadData();
        setImportResult(`${result.students.length}名の生徒、${result.classrooms.length}教室をインポートしました`);
      } catch (err) {
        setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleMigrateLocalRoster = async () => {
    setSyncing(true);
    setImportResult(null);
    try {
      const roster = await migrateCachedRosterToSupabase();
      await onReloadData();
      setImportResult(`ローカル名簿をサーバーへ移行しました: ${roster.students.length}名 / ${roster.classrooms.length}教室`);
    } catch (err) {
      setImportResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  const cellStyle: React.CSSProperties = {
    padding: '3px 6px',
    border: '1px solid var(--color-line)',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: 'var(--color-raised)',
    fontWeight: 'bold',
    borderBottom: '1px solid var(--color-line)',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'color-mix(in oklab, var(--color-accent) 16%, var(--color-surface))',
      color: 'var(--color-ink)',
      fontSize: 12,
    }}>
      {/* タイトルバー */}
      <div style={{
        background: 'var(--color-raised)',
        color: 'var(--color-ink)',
        padding: '4px 10px',
        fontSize: 13,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          background: 'var(--color-raised)',
          color: 'var(--color-ink)',
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
      <div style={{ display: 'flex', gap: 0, background: 'var(--color-raised)', padding: '0 4px' }}>
        <TabButton label="教室情報" active={activeTab === 'classroom'} onClick={() => setActiveTab('classroom')} />
        <TabButton label="生徒情報" active={activeTab === 'student'} onClick={() => setActiveTab('student')} />
      </div>

      {/* メインエリア: 左=情報パネル、右=テーブル */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左サイドパネル */}
        <div style={{
          width: 280,
          padding: '12px 16px',
          borderRight: '1px solid var(--color-line)',
          background: 'color-mix(in oklab, var(--color-accent) 16%, var(--color-surface))',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{
            background: 'var(--color-raised)',
            border: '1px solid var(--color-line)',
            padding: 10,
            fontSize: 11,
            lineHeight: 1.6,
          }}>
            ※生徒の姓名に設定しますと、生徒として棋譜管理ができます。
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', width: 50 }}>姓名</label>
            <div style={{ flex: 1, background: 'var(--color-ground)', border: '1px solid var(--color-line)', padding: '2px 6px' }}>
              三村 智保
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', width: 50 }}>棋力</label>
            <div style={{ flex: 1, background: 'var(--color-ground)', border: '1px solid var(--color-line)', padding: '2px 6px' }}>
              9P
            </div>
          </div>

          {/* XMLインポート */}
          <div style={{
            background: 'var(--color-raised)',
            border: '1px solid var(--color-line)',
            padding: 10,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>データ登録</div>
            <input ref={fileInputRef} type="file" accept=".xml" onChange={handleImportFile} style={{ display: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <IgcButton
                label={syncing ? '同期中...' : '道場アプリ連携（ネット生）'}
                color="var(--color-alert-face)"
                onClick={syncing ? undefined : handleDojoSync}
              />
              <IgcButton label="XMLインポート" color="var(--color-raised)" onClick={() => fileInputRef.current?.click()} />
              <IgcButton
                label={syncing ? '処理中...' : 'ローカル名簿をサーバー移行'}
                color="var(--color-raised)"
                onClick={syncing ? undefined : handleMigrateLocalRoster}
              />
              <IgcButton label="教室を追加" color="var(--color-raised)" onClick={handleAddClassroom} />
              <IgcButton label="生徒を追加" color="var(--color-raised)" onClick={() => { setActiveTab('student'); startAddStudent(); }} />
            </div>
            {importResult && (
              <div style={{
                marginTop: 6,
                padding: 4,
                fontSize: 10,
                background: importResult.startsWith('エラー') ? 'color-mix(in oklab, var(--color-alert) 14%, var(--color-surface))' : 'var(--color-raised)',
                border: `1px solid ${importResult.startsWith('エラー') ? 'var(--color-alert)' : 'var(--color-line)'}`,
              }}>
                {importResult}
              </div>
            )}
          </div>

          {activeTab === 'student' && selectedStudentIds.size > 0 && (
            <div style={{
              background: 'color-mix(in oklab, var(--color-alert) 14%, var(--color-surface))',
              border: '2px solid #8a4a3a',
              padding: 10,
              marginTop: 8,
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6, color: 'var(--color-alert-text)', fontSize: 11 }}>一括操作</div>
              <div style={{ fontSize: 11, marginBottom: 6 }}>{selectedStudentIds.size} 名を選択中</div>
              <IgcButton
                label="選択した生徒を削除"
                color="var(--color-alert-face)"
                onClick={handleBulkDeleteStudents}
              />
            </div>
          )}

          <div style={{ marginTop: 'auto' }}>
            <div style={{ color: 'var(--color-alert-text)', fontWeight: 'bold', marginBottom: 8, fontSize: 11 }}>
              定期的に教室情報のバックアップをお願いします。
            </div>
          </div>
        </div>

        {/* 右: テーブルエリア */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
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
                      background: i % 2 === 0 ? 'var(--color-raised)' : 'var(--color-surface)',
                    }}>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteClassroom(cls.id)}
                          style={{ color: 'var(--color-alert-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
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
                        background: 'var(--color-raised)',
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
                        <div style={{ color: 'var(--color-muted)', marginBottom: 12 }}>
                          教室がありません
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                          <IgcButton label="XMLインポート" color="var(--color-raised)" onClick={() => fileInputRef.current?.click()} />
                          <IgcButton label="教室を手動追加" color="var(--color-raised)" onClick={handleAddClassroom} />
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
              {/* 発行した生徒の参加リンク（そのまま生徒へ送れる） */}
              {issuedStudent && (
                <div
                  data-testid="issued-student-link"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-accent)',
                    padding: 12,
                    margin: 8,
                    fontSize: 12,
                    lineHeight: 1.8,
                  }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>
                    「{issuedStudent.name}」さんの参加リンク（コード: {issuedStudent.code}）
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span>教室</span>
                    <select
                      data-testid="issued-link-classroom"
                      value={issuedClassroomId}
                      onChange={e => { setIssuedClassroomId(e.target.value); setIssuedLinkCopied(false); }}
                      style={inputStyle}
                    >
                      <option value="">-- 教室を選ぶ --</option>
                      {classrooms.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {issuedClassroomId ? (
                    <>
                      <div
                        data-testid="issued-link-url"
                        style={{
                          background: 'var(--color-ground)',
                          border: '1px solid var(--color-line)',
                          padding: '4px 6px',
                          wordBreak: 'break-all',
                          fontSize: 11,
                        }}
                      >
                        {buildStudentLoginLink({ classroomId: issuedClassroomId, studentCode: issuedStudent.code })}
                      </div>
                      <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>
                        このリンクを送ると、生徒のログイン画面がコードと教室を記入済みで開きます。生徒は「参加する」を押すだけです。
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--color-muted)' }}>
                      教室を選ぶとリンクが出ます。（まだどの教室にも入っていない生徒は「教室」タブの「調整」で入れてください）
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <IgcButton
                      label={issuedLinkCopied ? '✓ コピーしました' : 'リンクをコピー'}
                      color={issuedLinkCopied ? 'var(--color-accent)' : 'var(--color-raised)'}
                      onClick={() => {
                        if (!issuedClassroomId) return;
                        navigator.clipboard.writeText(
                          buildStudentLoginLink({ classroomId: issuedClassroomId, studentCode: issuedStudent.code }),
                        ).catch(() => {});
                        setIssuedLinkCopied(true);
                      }}
                    />
                    <IgcButton label="閉じる" onClick={() => setIssuedStudent(null)} />
                  </div>
                </div>
              )}

              {/* 生徒追加/編集フォーム */}
              {isAddingStudent && (
                <div style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-line)',
                  padding: 12,
                  margin: 8,
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>
                    {editingStudent ? '生徒を編集' : '生徒を追加'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <FormField label="ログインコード *" width={150}>
                      <input type="text" value={form.studentCode || ''} onChange={e => setForm(f => ({ ...f, studentCode: e.target.value }))}
                        placeholder="生徒に伝えるコード" style={inputStyle} />
                    </FormField>
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
                        <option value="">--</option>
                        {studentTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </FormField>
                    <FormField label="生年月日" width={130}>
                      <input
                        type="date"
                        value={form.birthdate || ''}
                        onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))}
                        style={inputStyle}
                      />
                    </FormField>
                    <FormField
                      label={form.birthdate ? `学年（自動:${resolveGrade(form.birthdate, '')}）` : '学年'}
                      width={form.birthdate ? 160 : 80}
                    >
                      <select
                        value={form.grade}
                        onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                        disabled={!!form.birthdate}
                        style={{ ...inputStyle, opacity: form.birthdate ? 0.5 : 1 }}
                      >
                        {GRADES.map(g => <option key={g} value={g}>{g || '--'}</option>)}
                      </select>
                    </FormField>
                    <FormField label="所在地" width={120}>
                      <input type="text" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                        style={inputStyle} />
                    </FormField>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <IgcButton label={editingStudent ? '更新' : '追加'} color="var(--color-raised)" onClick={handleSaveStudent} />
                    <IgcButton label="キャンセル" onClick={() => setIsAddingStudent(false)} />
                  </div>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerCellStyle, width: 26, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={students.length > 0 && selectedStudentIds.size === students.length}
                        onChange={toggleSelectAllStudents}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ ...headerCellStyle, width: 26, textAlign: 'center' }}>×</th>
                    <th style={{ ...headerCellStyle, width: 36, textAlign: 'center' }}>編集</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>ログインコード</th>
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
                      background: i % 2 === 0 ? 'var(--color-raised)' : 'var(--color-surface)',
                    }}>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(s.id)}
                          onChange={() => toggleSelectStudent(s.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteStudent(s.id)}
                          style={{ color: 'var(--color-alert-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
                        >×</button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <RowButton label="編集" onClick={() => startEditStudent(s)} />
                      </td>
                      <td style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{s.studentCode || s.id}</td>
                      <td style={{
                        ...cellStyle,
                        fontWeight: 'bold',
                        background: 'color-mix(in oklab, var(--color-accent) 16%, var(--color-surface))',
                      }}>
                        {s.name}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{s.rank}</td>
                      <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--color-accent-text)' }}>{s.internalRating}</td>
                      <td style={cellStyle}>{s.type}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{resolveGrade(s.birthdate, s.grade)}</td>
                      <td style={cellStyle}>{s.country}</td>
                    </tr>
                  ))}

                  {students.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: 30, textAlign: 'center' }}>
                        <div style={{ color: 'var(--color-muted)', marginBottom: 12 }}>
                          生徒がいません
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                          <IgcButton label="XMLインポート" color="var(--color-raised)" onClick={() => fileInputRef.current?.click()} />
                          <IgcButton label="生徒を手動追加" color="var(--color-raised)" onClick={startAddStudent} />
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
        borderTop: '1px solid var(--color-line)',
        background: 'var(--color-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <IgcButton label="ログアウト" onClick={onBack} />
        <div style={{ flex: 1 }} />
        {pwaInstall.shouldShowInstall && (
          <IgcButton label="⬇ アプリをインストール" color="var(--color-raised)" onClick={() => { void pwaInstall.install(); }} />
        )}
        <IgcButton label="教室追加" color="var(--color-raised)" onClick={handleAddClassroom} />
        <IgcButton label="生徒追加" color="var(--color-raised)" onClick={() => { setActiveTab('student'); startAddStudent(); }} />
        <IgcButton label="XMLインポート" color="var(--color-raised)" onClick={() => fileInputRef.current?.click()} />
        <IgcButton label="LiveKit設定" color="var(--color-raised)" onClick={onOpenSettings} />
        <DateTimeDisplay />
      </div>

      {/* 教室設定ダイアログ（生徒入替） */}
      {editingClassroom && (
        <ClassroomSettingsDialog
          classroom={editingClassroom}
          allStudents={students}
          studentTypes={studentTypes}
          onSave={async () => {
            setEditingClassroom(null);
            await onReloadData();
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
  border: '1px solid var(--color-line)',
  background: 'var(--color-ground)',
  };


// ボタン面の色から文字色を決める。榧の面には墨、朱の面には生成りを置く。
function faceText(face?: string): string {
  if (face === 'var(--color-accent)') return 'var(--color-accent-ink)';
  if (face === 'var(--color-alert-face)') return '#f8efec';
  return 'var(--color-ink)';
}

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
        border: '1px solid var(--color-line)',
        borderBottom: active ? '1px solid #1d1b16' : '1px solid var(--color-line)',
        background: active ? 'var(--color-surface)' : 'var(--color-raised)',
        cursor: 'pointer',
        borderRadius: '4px 4px 0 0',
        marginBottom: -1,
        color: 'var(--color-ink)',
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
        border: '1px solid var(--color-line)',
        background: 'var(--color-raised)',
        color: 'var(--color-ink)',
        cursor: 'pointer',
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
        border: '1px solid var(--color-line)',
        background: color || 'var(--color-raised)',
        color: faceText(color),
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
      color: 'var(--color-alert-text)',
      textAlign: 'right',
      lineHeight: 1.2,
      }}>
      <div>{dateStr}（{dayStr}曜日）</div>
      <div style={{ fontSize: 14 }}>{now.toLocaleTimeString('ja-JP')}</div>
    </div>
  );
}
