import { useState, useEffect } from 'react';
import { ChevronDown, Trash2, Plus, Lock, ArrowLeft, RefreshCw } from 'lucide-react';
import {
  loadAccounts,
  deleteAccount,
  setTeacherPassword,
  supabaseSignInStudent,
  supabaseSignInTeacher,
  supabaseSignOut,
} from '../utils/authStore';
import type { SavedAccount } from '../utils/authStore';

interface LoginScreenProps {
  onStudentLogin: (studentId: string, classroomId: string, rawCode?: string) => void;
  onTeacherLogin: () => void;
  /** URL等で事前に設定された教室ID */
  prefilledClassroomId?: string;
}

export default function LoginScreen({
  onStudentLogin,
  onTeacherLogin,
  prefilledClassroomId,
}: LoginScreenProps) {
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [classroomId, setClassroomId] = useState(prefilledClassroomId || '');
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 先生
  const [teacherPw, setTeacherPw] = useState('');
  const [teacherError, setTeacherError] = useState('');

  useEffect(() => {
    const saved = loadAccounts();
    setAccounts(saved);

    // 自動ログインは廃止（2026-04-22）: 生徒が「どの教室に入ったか」
    // 判別できない問題があったため、必ずログイン画面で確認させる。
    // 保存アカウントが1つだけなら pre-select だけはして、入力の手間は省く。
    if (saved.length === 1) {
      const a = saved[0];
      setSelectedAccount(a);
      setStudentId(a.studentId);
      if (!prefilledClassroomId) setClassroomId(a.classroomId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prefilledClassroomId) setClassroomId(prefilledClassroomId);
  }, [prefilledClassroomId]);

  const refreshAccounts = () => setAccounts(loadAccounts());

  const handleSelectAccount = (account: SavedAccount) => {
    setSelectedAccount(account);
    setStudentId(account.studentId);
    setClassroomId(account.classroomId);
    setShowDropdown(false);
    setError('');
  };

  const handleNewAccount = () => {
    setSelectedAccount(null);
    setStudentId('');
    setClassroomId(prefilledClassroomId || '');
    setShowDropdown(false);
    setError('');
  };

  const handleDeleteAccount = (e: React.MouseEvent, account: SavedAccount) => {
    e.stopPropagation();
    deleteAccount(account.studentId, account.classroomId);
    refreshAccounts();
    if (selectedAccount?.studentId === account.studentId && selectedAccount?.classroomId === account.classroomId) {
      handleNewAccount();
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const sid = studentId.trim();
    const cid = classroomId.trim();
    if (!sid || !cid) {
      setError('生徒コードと教室IDを入力してください');
      return;
    }
    // Supabase Session の確立を待ってから入室する。
    // （以前は入室と並行実行していたため、メタデータ昇格前の匿名 JWT で
    //   /api/token を叩いて LiveKit 入室が 403 になるレースがあった）
    setSubmitting(true);
    setError('');
    const res = await supabaseSignInStudent(sid, cid);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || 'ログインに失敗しました');
      return;
    }
    // App.tsx の makeStudentIdentity に渡す ID は UUID でなければならない
    // （api/token.ts が meta.student_id = UUID と比較するため）
    // また、接続成功時に localStorage に保存するため生の入力値 (sid) も第3引数で渡す
    onStudentLogin(res.studentId ?? sid, cid, sid);
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setTeacherError('');

    // サーバー（validate_teacher_session の TEACHER_PASSWORD_HASH）が唯一の権威。
    // localStorage はキャッシュにすぎず、照合ゲートには使わない。
    // （旧実装はローカル照合が先に走り、サーバー側のPW変更後に正しいPWでも
    //   「パスワードが違います」で弾かれてログイン不能になった）
    setSubmitting(true);
    const res = await supabaseSignInTeacher(teacherPw);
    setSubmitting(false);
    if (!res.ok) {
      setTeacherError(res.error || 'サーバー認証に失敗しました');
      return;
    }

    // 認証成功 → ローカルキャッシュをサーバーと同期
    await setTeacherPassword(teacherPw);
    onTeacherLogin();
  };

  if (mode === 'teacher') {
    return (
      <div className="flex flex-col items-center min-h-screen py-12 gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            三村囲碁オンライン
          </h1>
        </div>

        <div className="glass-panel p-8 w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold">先生ログイン</h2>
          </div>

          <form onSubmit={handleTeacherSubmit} className="space-y-4" autoComplete="on">
            {/* ブラウザのパスワード保存を有効にするための隠しユーザー名 */}
            <input type="hidden" name="username" autoComplete="username" value="teacher" />
            <div>
              <label className="block text-sm text-zinc-400 mb-1">パスワード</label>
              <input
                data-testid="teacher-password-input"
                type="password"
                name="password"
                autoComplete="current-password"
                value={teacherPw}
                onChange={e => setTeacherPw(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {teacherError && <p className="text-red-400 text-sm">{teacherError}</p>}

            <button data-testid="teacher-login-button" type="submit" disabled={submitting} className="premium-button w-full disabled:opacity-60">
              {submitting ? '確認中...' : 'ログイン'}
            </button>
          </form>

          <button
            onClick={() => { setMode('student'); setTeacherError(''); setTeacherPw(''); }}
            className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> 戻る
          </button>
        </div>

        <div className="text-[10px] text-zinc-600 select-none font-mono mt-2">
          Build: {__BUILD_TIME__} ({__COMMIT_HASH__})
        </div>
      </div>
    );
  }

  // --- 生徒ログイン ---
  return (
    <div className="flex flex-col items-center min-h-screen py-12 gap-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          三村囲碁オンライン
        </h1>
        <p className="text-zinc-400">オンライン囲碁指導プラットフォーム</p>
      </div>

      <div className="glass-panel p-8 w-full max-w-sm space-y-6">
        {/* ドロップダウン: 保存済みアカウントが1つ以上ある場合 */}
        {accounts.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-left flex items-center justify-between hover:bg-white/15 transition-colors"
            >
              <span className={selectedAccount ? 'text-white' : 'text-zinc-400'}>
                {selectedAccount
                  ? `${selectedAccount.studentName || selectedAccount.studentId}${selectedAccount.classroomName ? ` (${selectedAccount.classroomName})` : ''}`
                  : '保存済みアカウント'}
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-white/10 rounded-lg shadow-xl overflow-hidden">
                {accounts.map(a => (
                  <div
                    key={`${a.studentId}-${a.classroomId}`}
                    onClick={() => handleSelectAccount(a)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-white/10 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {a.studentName || a.studentId}
                      </p>
                      {a.classroomName && (
                        <p className="text-xs text-zinc-400 truncate">{a.classroomName}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDeleteAccount(e, a)}
                      className="p-1 text-zinc-500 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div
                  onClick={handleNewAccount}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-white/10 cursor-pointer text-blue-400 border-t border-white/10"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">新しいアカウントを追加</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ID入力フォーム */}
        <form onSubmit={handleStudentSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">生徒コード</label>
            <input
              data-testid="student-id-input"
              type="text"
              value={studentId}
              onChange={e => { setStudentId(e.target.value); setError(''); }}
              placeholder="先生から受け取ったコード"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
              autoFocus={accounts.length === 0}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">教室ID</label>
            <input
              data-testid="classroom-id-input"
              type="text"
              value={classroomId}
              onChange={e => { setClassroomId(e.target.value); setError(''); }}
              placeholder="先生から受け取った教室ID"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
            />
            {selectedAccount?.classroomName && classroomId === selectedAccount.classroomId && (
              <p className="mt-1 text-sm text-blue-300">
                接続先: <span className="font-bold">{selectedAccount.classroomName}</span>
              </p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button data-testid="student-login-button" type="submit" disabled={submitting} className="premium-button w-full disabled:opacity-60">
            {submitting ? '確認中...' : selectedAccount?.classroomName ? `${selectedAccount.classroomName} に参加` : '参加する'}
          </button>
        </form>
      </div>

      <button
        data-testid="teacher-mode-link"
        onClick={() => setMode('teacher')}
        className="text-zinc-600 hover:text-zinc-400 text-sm"
      >
        先生としてログイン →
      </button>

      {/* データインポート（JSON） */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.students) localStorage.setItem('go-school-students', JSON.stringify(data.students));
                if (data.classrooms) localStorage.setItem('go-school-classrooms', JSON.stringify(data.classrooms));
                alert(`インポート完了: ${data.students?.length || 0}名の生徒、${data.classrooms?.length || 0}教室`);
                window.location.reload();
              } catch {
                alert('JSONの読み込みに失敗しました');
              }
            };
            input.click();
          }}
          className="text-zinc-700 hover:text-zinc-400 text-xs underline"
        >
          データインポート（JSON）
        </button>

        <button
          onClick={async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.innerHTML = 'リセット中...';

            // 1. Supabase 強制サインアウト
            try {
              await supabaseSignOut();
            } catch { /* best-effort */ }

            // 1.5 既存データの重複生徒を自動排他クリーンアップ
            try {
              const { loadClassrooms, saveClassrooms } = await import('../utils/classroomStore');
              const clses = loadClassrooms();
              if (clses.length > 0) {
                saveClassrooms(clses); // 保存時に自動で cleanup される
              }
            } catch { /* best-effort */ }

            // 2. Service Worker 強制アンインストール
            if ('serviceWorker' in navigator) {
              try {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                  await reg.unregister();
                }
              } catch { /* best-effort */ }
            }

            // 3. Cache Storage 強制クリア
            if ('caches' in window) {
              try {
                const keys = await caches.keys();
                for (const key of keys) {
                  await caches.delete(key);
                }
              } catch { /* best-effort */ }
            }

            // 4. 強制リロード (サーバーから最新アセットを再取得)
            window.location.reload();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/5 rounded-lg transition-colors duration-150"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 接続・キャッシュをリセット
        </button>
      </div>

      <div className="text-[10px] text-zinc-600 select-none font-mono mt-2">
        Build: {__BUILD_TIME__} ({__COMMIT_HASH__})
      </div>
    </div>
  );
}
