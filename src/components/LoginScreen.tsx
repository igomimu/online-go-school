import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Trash2, Plus, Lock, ArrowLeft, RefreshCw, Download } from 'lucide-react';
import BoardCorner from './BoardCorner';
import ThemeToggle from './ThemeToggle';
import {
  loadAccounts,
  deleteAccount,
  setTeacherPassword,
  supabaseSignInStudent,
  supabaseSignInTeacher,
  supabaseSignOut,
} from '../utils/authStore';
import type { SavedAccount } from '../utils/authStore';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { fetchClassroomRoster, type ClassroomRoster } from '../utils/classroomRoster';
import { getTeacherDisplayName, setTeacherDisplayName } from '../utils/identityUtils';

interface LoginScreenProps {
  onStudentLogin: (studentId: string, classroomId: string, rawCode?: string, displayName?: string) => void;
  onTeacherLogin: () => void;
  /** URL等で事前に設定された教室ID */
  prefilledClassroomId?: string;
  /**
   * 道場の共有PC用の鍵（?roster=...）。渡されると名簿から名前を選ぶだけで入れる。
   * 生徒はIDを打たない（2026-08-13 三村さん）。
   */
  rosterToken?: string;
}

export default function LoginScreen({
  onStudentLogin,
  onTeacherLogin,
  prefilledClassroomId,
  rosterToken,
}: LoginScreenProps) {
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [classroomId, setClassroomId] = useState(prefilledClassroomId || '');
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pwaInstall = usePwaInstall();
  // 共有PCの名簿
  const [roster, setRoster] = useState<ClassroomRoster | null>(null);
  const [rosterError, setRosterError] = useState('');
  const [rosterLoading, setRosterLoading] = useState(!!rosterToken);
  const [enteringCode, setEnteringCode] = useState<string | null>(null);

  // 先生
  const [teacherPw, setTeacherPw] = useState('');
  const [teacherError, setTeacherError] = useState('');
  const [teacherDisplayName, setTeacherDisplayNameState] = useState(() => getTeacherDisplayName());

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

  useEffect(() => {
    if (!rosterToken) return;
    let alive = true;
    setRosterLoading(true);
    fetchClassroomRoster(rosterToken)
      .then(r => { if (alive) { setRoster(r); setRosterError(''); } })
      .catch(err => { if (alive) setRosterError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (alive) setRosterLoading(false); });
    return () => { alive = false; };
  }, [rosterToken]);

  /** 共有PCで名前を押したときの入室。IDの入力は無い */
  const handleRosterPick = async (entry: { studentCode: string; name: string }) => {
    if (!roster || enteringCode) return;
    setEnteringCode(entry.studentCode);
    setRosterError('');
    const res = await supabaseSignInStudent(entry.studentCode, roster.classroomId);
    setEnteringCode(null);
    if (!res.ok) {
      setRosterError(res.error || 'ログインに失敗しました');
      return;
    }
    onStudentLogin(
      res.studentId ?? entry.studentCode,
      roster.classroomId,
      entry.studentCode,
      res.displayName || entry.name,
    );
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
    onStudentLogin(res.studentId ?? sid, cid, sid, res.displayName);
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
    setTeacherDisplayName(teacherDisplayName);
    onTeacherLogin();
  };

  const handleInstallClick = async () => {
    await pwaInstall.install();
  };

  if (mode === 'teacher') {
    return (
      <LoginLayout>
        <div className="glass-panel p-6 sm:p-7">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-4 h-4 text-muted" />
            <h2 className="text-base font-semibold">先生ログイン</h2>
          </div>

          <form onSubmit={handleTeacherSubmit} className="space-y-4" autoComplete="on">
            {/* ブラウザのパスワード保存を有効にするための隠しユーザー名 */}
            <input type="hidden" name="username" autoComplete="username" value="teacher" />
            <div>
              <label className="field-label">パスワード</label>
              <input
                data-testid="teacher-password-input"
                type="password"
                name="password"
                autoComplete="current-password"
                value={teacherPw}
                onChange={e => setTeacherPw(e.target.value)}
                className="field-input"
                autoFocus
              />
            </div>

            <div>
              <label className="field-label">講師表示名</label>
              <input
                data-testid="teacher-display-name-input"
                type="text"
                value={teacherDisplayName}
                onChange={e => setTeacherDisplayNameState(e.target.value)}
                placeholder="三村九段"
                className="field-input"
              />
            </div>

            {teacherError && <p className="text-alert-text text-sm">{teacherError}</p>}

            <button data-testid="teacher-login-button" type="submit" disabled={submitting} className="premium-button w-full disabled:opacity-60">
              {submitting ? '確認中...' : 'ログイン'}
            </button>
          </form>

          {pwaInstall.shouldShowInstall && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="secondary-button w-full flex items-center justify-center gap-2 text-sm mt-4"
            >
              <Download className="w-4 h-4" />
              {pwaInstall.isIos && !pwaInstall.canInstall ? 'ホーム画面に追加' : 'アプリをインストール'}
            </button>
          )}

          <button
            onClick={() => { setMode('student'); setTeacherError(''); setTeacherPw(''); }}
            className="mt-5 flex items-center gap-1 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" /> 戻る
          </button>
        </div>

        <BuildStamp />
      </LoginLayout>
    );
  }

  // --- 道場の共有PC: 名簿から選ぶ ---
  // IDも教室IDも打たせない。並び順は先生が決めた教室内の順序に従う。
  if (rosterToken) {
    return (
      <LoginLayout>
        <div className="glass-panel space-y-5 p-6 sm:p-7">
          <div>
            <p className="text-xs tracking-widest text-muted">道場のパソコン</p>
            <h2 className="mt-1 text-2xl font-bold">
              {roster?.classroomName || 'ネット道場'}
            </h2>
            <p className="mt-2 text-sm text-muted">自分の名前を押してください</p>
          </div>

          {rosterLoading && <p className="text-sm text-muted">名簿を読み込んでいます…</p>}
          {rosterError && <p className="text-sm text-alert-text">{rosterError}</p>}

          {roster && (
            <div data-testid="roster-list" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {roster.students.map(entry => (
                <button
                  key={entry.studentCode}
                  data-testid={`roster-pick-${entry.studentCode}`}
                  onClick={() => handleRosterPick(entry)}
                  disabled={!!enteringCode}
                  className={`min-h-[56px] rounded-lg border px-3 py-3 text-base font-semibold transition-colors duration-150 ${
                    enteringCode === entry.studentCode
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-line bg-raised text-ink hover:bg-line disabled:opacity-50'
                  }`}
                >
                  {enteringCode === entry.studentCode ? '入室中…' : entry.name}
                </button>
              ))}
              {roster.students.length === 0 && (
                <p className="col-span-full text-sm text-muted">
                  この教室に生徒が登録されていません。
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <button
            data-testid="teacher-mode-link"
            onClick={() => setMode('teacher')}
            className="text-sm text-muted hover:text-ink"
          >
            先生としてログイン →
          </button>
          <ThemeToggle />
        </div>

        <BuildStamp />
      </LoginLayout>
    );
  }

  // --- 生徒ログイン ---
  return (
    <LoginLayout>
      <div className="glass-panel p-6 sm:p-7 space-y-5">
        {/* ドロップダウン: 保存済みアカウントが1つ以上ある場合 */}
        {accounts.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="field-input flex items-center justify-between text-left"
            >
              <span className={selectedAccount ? 'text-ink' : 'text-muted'}>
                {selectedAccount
                  ? `${selectedAccount.studentName || selectedAccount.studentId}${selectedAccount.classroomName ? ` (${selectedAccount.classroomName})` : ''}`
                  : '保存済みアカウント'}
              </span>
              <ChevronDown className={`w-4 h-4 text-muted transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-raised">
                {accounts.map(a => (
                  <div
                    key={`${a.studentId}-${a.classroomId}`}
                    onClick={() => handleSelectAccount(a)}
                    className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-line"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {a.studentName || a.studentId}
                      </p>
                      {a.classroomName && (
                        <p className="text-xs text-muted truncate">{a.classroomName}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDeleteAccount(e, a)}
                      className="p-1 text-muted hover:text-alert-text shrink-0"
                      aria-label={`${a.studentName || a.studentId} を削除`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div
                  onClick={handleNewAccount}
                  className="flex cursor-pointer items-center gap-2 border-t border-line px-4 py-3 text-accent-text hover:bg-line"
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
            <label className="field-label">生徒コード または 生徒ID</label>
            <input
              data-testid="student-id-input"
              type="text"
              value={studentId}
              onChange={e => { setStudentId(e.target.value); setError(''); }}
              placeholder="4桁の数字 または 生徒ID"
              className="field-input tabular"
              autoFocus={accounts.length === 0}
            />
          </div>
          <div>
            <label className="field-label">教室ID</label>
            <input
              data-testid="classroom-id-input"
              type="text"
              value={classroomId}
              onChange={e => { setClassroomId(e.target.value); setError(''); }}
              placeholder="先生から受け取った教室ID"
              className="field-input tabular"
            />
            {selectedAccount?.classroomName && classroomId === selectedAccount.classroomId && (
              <p className="mt-2 text-sm text-muted">
                接続先: <span className="font-medium text-ink">{selectedAccount.classroomName}</span>
              </p>
            )}
          </div>

          {error && <p className="text-alert-text text-sm">{error}</p>}

          <button data-testid="student-login-button" type="submit" disabled={submitting} className="premium-button w-full disabled:opacity-60">
            {submitting ? '確認中...' : selectedAccount?.classroomName ? `${selectedAccount.classroomName} に参加` : '参加する'}
          </button>
        </form>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <button
          data-testid="teacher-mode-link"
          onClick={() => setMode('teacher')}
          className="text-sm text-muted hover:text-ink"
        >
          先生としてログイン →
        </button>

        {pwaInstall.shouldShowInstall && (
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-ink"
          >
            <Download className="w-3.5 h-3.5" />
            {pwaInstall.isIos && !pwaInstall.canInstall ? 'ホーム画面に追加' : 'アプリをインストール'}
          </button>
        )}
      </div>

      {/*
        端末側のトラブル対応と開発者向けの入口。生徒の初見画面に常時出す必要はないので
        折り畳んでおく（「データインポート」が最初の画面に露出していた状態を解消）。
      */}
      <details className="mt-5">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          うまく入れないとき
        </summary>
        <div className="mt-3 flex flex-col items-start gap-3">
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
          className="text-xs text-muted underline hover:text-ink"
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
              const { cleanupDuplicateStudentsInClassrooms, loadClassrooms } = await import('../utils/classroomStore');
              const clses = loadClassrooms();
              if (clses.length > 0) {
                localStorage.setItem('go-school-classrooms', JSON.stringify(cleanupDuplicateStudentsInClassrooms(clses)));
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
          className="flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:text-ink"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 接続・キャッシュをリセット
        </button>
        </div>
      </details>

      <BuildStamp />
    </LoginLayout>
  );
}

/**
 * ログイン画面の共通の器。
 * 左上に碁盤の隅を敷き、その下にブランド、右にフォームを置く（左揃え基調）。
 * 盤は右下へ背景色に溶けるので、文字は必ず溶けきった側に載せる。
 */
function LoginLayout({ children }: { children: ReactNode }) {
  // モバイルは盤を避けて下寄せ、PC は塊ごと画面の縦中央に置く
  return (
    <div className="relative flex min-h-screen w-full items-end overflow-hidden lg:items-center">
      <BoardCorner className="pointer-events-none absolute -left-16 -top-28 w-[112vw] max-w-[420px] sm:-left-20 lg:w-[44vw] lg:max-w-[500px]" />

      {/* 打ち始める前に自分の見え方を選べるよう、ログイン画面にも置く */}
      <ThemeToggle className="absolute right-4 top-4 z-10" />

      <div className="relative mx-auto w-full max-w-4xl px-6 py-10 lg:py-12">
        <div className="flex w-full flex-col gap-9 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="lg:flex-1 lg:pt-1">
            <h1 className="heading-hero">三村囲碁オンライン</h1>
            <p className="mt-2 text-muted">ログインだけで、仲間に会える。</p>
          </div>

          <div className="w-full lg:w-[21rem] lg:shrink-0">{children}</div>
        </div>
      </div>
    </div>
  );
}

function BuildStamp() {
  return (
    <div className="mt-6 select-none font-mono text-[10px] text-muted/60">
      Build: {__BUILD_TIME__} ({__COMMIT_HASH__})
    </div>
  );
}
