import { useState, useEffect } from 'react';
import { ChevronDown, Trash2, Plus, Lock, ArrowLeft } from 'lucide-react';
import {
  loadAccounts,
  loadLastAccount,
  deleteAccount,
  hasTeacherPassword,
  setTeacherPassword,
  verifyTeacherPassword,
  resetTeacherPassword,
} from '../utils/authStore';
import type { SavedAccount } from '../utils/authStore';

interface LoginScreenProps {
  onStudentLogin: (studentId: string, classroomId: string) => void;
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

  // 先生
  const [teacherPw, setTeacherPw] = useState('');
  const [teacherPwConfirm, setTeacherPwConfirm] = useState('');
  const [isNewTeacher, setIsNewTeacher] = useState(false);
  const [teacherError, setTeacherError] = useState('');

  useEffect(() => {
    const saved = loadAccounts();
    setAccounts(saved);
    setIsNewTeacher(!hasTeacherPassword());

    // 自動ログイン: 保存済みアカウントが1つだけなら即接続
    if (saved.length === 1 && !prefilledClassroomId) {
      onStudentLogin(saved[0].studentId, saved[0].classroomId);
      return;
    }

    // prefilled classroomId がある場合はフォームに入れるだけ（自動ログインしない）
    if (prefilledClassroomId) {
      setClassroomId(prefilledClassroomId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sid = studentId.trim();
    const cid = classroomId.trim();
    if (!sid || !cid) {
      setError('生徒IDと教室IDを入力してください');
      return;
    }
    onStudentLogin(sid, cid);
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeacherError('');

    if (isNewTeacher) {
      if (teacherPw.length < 4) {
        setTeacherError('4文字以上で設定してください');
        return;
      }
      if (teacherPw !== teacherPwConfirm) {
        setTeacherError('パスワードが一致しません');
        return;
      }
      await setTeacherPassword(teacherPw);
      onTeacherLogin();
    } else {
      const ok = await verifyTeacherPassword(teacherPw);
      if (!ok) {
        setTeacherError('パスワードが違います');
        return;
      }
      onTeacherLogin();
    }
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
            <h2 className="text-xl font-bold">
              {isNewTeacher ? '先生パスワード設定' : '先生ログイン'}
            </h2>
          </div>

          <form onSubmit={handleTeacherSubmit} className="space-y-4" autoComplete="on">
            {/* ブラウザのパスワード保存を有効にするための隠しユーザー名 */}
            <input type="hidden" name="username" autoComplete="username" value="teacher" />
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                {isNewTeacher ? '新しいパスワード' : 'パスワード'}
              </label>
              <input
                data-testid="teacher-password-input"
                type="password"
                name="password"
                autoComplete={isNewTeacher ? 'new-password' : 'current-password'}
                value={teacherPw}
                onChange={e => setTeacherPw(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {isNewTeacher && (
              <div>
                <label className="block text-sm text-zinc-400 mb-1">確認</label>
                <input
                  type="password"
                  value={teacherPwConfirm}
                  onChange={e => setTeacherPwConfirm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {teacherError && (
              <div className="space-y-1">
                <p className="text-red-400 text-sm">{teacherError}</p>
                {!isNewTeacher && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('パスワードをリセットしますか？')) {
                        resetTeacherPassword();
                        setIsNewTeacher(true);
                        setTeacherPw('');
                        setTeacherError('');
                      }
                    }}
                    className="text-blue-400 hover:text-blue-300 text-sm underline mt-2"
                  >
                    パスワードをリセット
                  </button>
                )}
              </div>
            )}

            <button data-testid="teacher-login-button" type="submit" className="premium-button w-full">
              {isNewTeacher ? '設定して開始' : 'ログイン'}
            </button>
          </form>

          <button
            onClick={() => { setMode('student'); setTeacherError(''); setTeacherPw(''); }}
            className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> 戻る
          </button>
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
            <label className="block text-sm text-zinc-400 mb-1">生徒ID</label>
            <input
              data-testid="student-id-input"
              type="text"
              value={studentId}
              onChange={e => { setStudentId(e.target.value); setError(''); }}
              placeholder="先生から受け取ったID"
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
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button data-testid="student-login-button" type="submit" className="premium-button w-full">
            参加する
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
        className="text-zinc-700 hover:text-zinc-400 text-xs"
      >
        データインポート（JSON）
      </button>
    </div>
  );
}
