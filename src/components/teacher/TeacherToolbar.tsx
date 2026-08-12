import { useRef, useState } from 'react';
import { ConnectionState } from 'livekit-client';

interface TeacherToolbarProps {
  studentJoinInfo: string;
  classroomId?: string | null;
  classroomName?: string;
  onCreateGame: () => void;
  onStartLecture: () => void;
  onLoadSgf: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  isReconnecting: boolean;
  onOpenStudentManager: () => void;
  /** 講師専用の対局別ウィンドウを開く/前面化する */
  onOpenTeacherGameWindow?: () => void;
  onEditClassroom?: () => void;
  onShowStudentLinks?: () => void;
  onAutoPairing?: () => void;
  onOpenTsumegoPicker?: () => void;
  onClearAudioM?: () => void;
  onClearAudioS?: () => void;
  onClearSharing?: () => void;
  /** 回線の状態。切れている時だけ「回線復旧」を朱にするために使う */
  connectionState?: ConnectionState;
}

// 操作卓のボタン。IGCの機能配置はそのままに、見た目はアプリ本体に揃える。
//
// 2026-08-12: 12個のボタンが同じ形・同じ重みで並び、日常の操作（対局作成）と
// 滅多に押さない操作（退室・回線復旧）が見分けられなかった。授業中に押す手数は
// 増やしたくないので隠さず、重み付けと群分けだけで区別する。

// ボタン面の色から文字色を決める。榧の面には墨、朱の面には生成りを置く。
function faceText(face?: string): string {
  if (face === 'var(--color-accent)') return 'var(--color-accent-ink)';
  if (face === 'var(--color-alert-face)') return '#f8efec';
  return 'var(--color-ink)';
}

/** 群の区切り */
function Divider() {
  return (
    <div
      aria-hidden
      style={{ width: 1, height: 24, background: 'var(--color-field-line)', flexShrink: 0, margin: '0 8px', opacity: 0.5 }}
    />
  );
}

/** 補助操作。主操作より一段小さく、面も持たせない */
function SmallButton({
  label,
  onClick,
  disabled,
  tone = 'quiet',
  title,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** quiet=無彩色の枠だけ / danger=朱の面（切れている時だけ） */
  tone?: 'quiet' | 'danger';
  title?: string;
}) {
  const isDanger = tone === 'danger';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '4px 10px',
        fontSize: 11.5,
        borderRadius: 6,
        border: `1px solid ${isDanger ? 'var(--color-alert-face)' : 'var(--color-line)'}`,
        background: isDanger ? 'var(--color-alert-face)' : 'transparent',
        color: isDanger ? '#f8efec' : 'var(--color-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        transition: 'background-color .15s ease-in-out',
      }}
    >
      {label}
    </button>
  );
}

function IgcButton({
  label,
  color,
  onClick,
  disabled,
  outline,
  'data-testid': testId,
}: {
  label: string;
  color?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** 面は持たせず、枠だけ榧にして主操作の次に強く見せる */
  outline?: boolean;
  'data-testid'?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        padding: '6px 14px',
        fontSize: 12.5,
        fontWeight: 600,
        letterSpacing: '.02em',
        borderRadius: 6,
        border: `1px solid ${outline ? 'var(--color-accent)' : 'var(--color-line)'}`,
        background: outline ? 'transparent' : color || 'var(--color-raised)',
        color: outline ? 'var(--color-accent-text)' : faceText(color),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        transition: 'background-color .15s ease-in-out',
      }}
    >
      {label}
    </button>
  );
}

export default function TeacherToolbar({
  studentJoinInfo,
  classroomId,
  classroomName,
  onCreateGame,
  onStartLecture,
  onLoadSgf,
  onDisconnect,
  onReconnect,
  isReconnecting,
  onOpenStudentManager,
  onOpenTeacherGameWindow,
  onEditClassroom,
  onShowStudentLinks,
  onAutoPairing,
  onOpenTsumegoPicker,
  onClearAudioM,
  onClearAudioS,
  onClearSharing,
  connectionState,
}: TeacherToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [copiedClassroomId, setCopiedClassroomId] = useState(false);

  const copyLink = () => {
    if (!studentJoinInfo) return;
    navigator.clipboard.writeText(studentJoinInfo).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyClassroomId = () => {
    if (!classroomId) return;
    navigator.clipboard.writeText(classroomId).catch(() => {});
    setCopiedClassroomId(true);
    setTimeout(() => setCopiedClassroomId(false), 2000);
  };

  // 回線が切れている/繋ぎ直している間だけ朱にする。常時赤いと、緊急時に目立たない。
  // connectionState を渡していない呼び出し元では、朱にしない（＝正常扱い）。
  const isLineTrouble =
    isReconnecting || (connectionState !== undefined && connectionState !== ConnectionState.Connected);

  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayStr = dayNames[now.getDay()];

  return (
    <div>
      {/* 上段: 教室ID + クリアボタン群 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        padding: '7px 12px',
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-line)',
        color: 'var(--color-ink)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '.04em', marginRight: 8 }}>
          {classroomName || '三村囲碁オンライン'}
        </span>
        {classroomId && (
          <button
            onClick={copyClassroomId}
            title="クリックで教室IDをコピー"
            style={{
              background: copiedClassroomId ? 'var(--color-accent)' : 'var(--color-raised)',
              color: copiedClassroomId ? 'var(--color-ground)' : 'var(--color-muted)',
              border: '1px solid var(--color-line)',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              marginRight: 16,
              }}
          >
            {copiedClassroomId ? '✓ 教室IDコピー済み' : `教室ID: ${classroomId}`}
          </button>
        )}

        {/* 生徒招待リンク */}
        {studentJoinInfo && (
          <button
            onClick={copyLink}
            title="クリックでコピー"
            style={{
              background: copied ? 'var(--color-accent)' : 'var(--color-raised)',
              color: copied ? 'var(--color-ground)' : 'var(--color-muted)',
              border: '1px solid var(--color-line)',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 11,
              cursor: 'pointer',
              maxWidth: 300,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? '✓ リンクコピー済み' : `📋 生徒招待リンク: ${studentJoinInfo.substring(0, 50)}...`}
          </button>
        )}

        <div style={{ flex: 1 }} />
        <SmallButton label="音声Mをクリア" onClick={onClearAudioM} />
        <SmallButton label="音声Sをクリア" onClick={onClearAudioS} />
        <SmallButton label="共有を全員に" onClick={onClearSharing} />
      </div>

      {/* 下段: アクションボタン群。
          左＝授業中に使う主操作 / 中＝準備や名簿の副操作（一段小さく）/ 右＝終了と復旧。 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        padding: '8px 12px',
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-line)',
      }}>
        {/* 主操作 */}
        <IgcButton label="対局作成" color="var(--color-accent)" onClick={onCreateGame} data-testid="create-game-toolbar-button" />
        {onOpenTeacherGameWindow && (
          <IgcButton label="対局ウィンドウ" outline onClick={onOpenTeacherGameWindow} data-testid="open-teacher-game-window-button" />
        )}
        <IgcButton label="自動対局" color="var(--color-raised)" onClick={onAutoPairing} />
        <IgcButton label="共有検討" color="var(--color-raised)" onClick={onStartLecture} />

        <Divider />

        {/* 副操作: 教材と名簿。押す手数は増やさず、重みだけ落とす */}
        <input ref={fileInputRef} type="file" accept=".sgf" onChange={onLoadSgf} className="hidden" />
        <SmallButton label="SGF読込" onClick={() => fileInputRef.current?.click()} />
        {onOpenTsumegoPicker && <SmallButton label="詰碁DB" onClick={onOpenTsumegoPicker} />}
        <SmallButton label="生徒入替" onClick={onEditClassroom} />
        <SmallButton label="生徒リンク" onClick={onShowStudentLinks} />
        <SmallButton label="生徒管理" onClick={onOpenStudentManager} />
        {studentJoinInfo && (
          <SmallButton label={copied ? '✓ コピー済み' : '参加リンク'} onClick={copyLink} />
        )}

        <div style={{ flex: 1 }} />

        {/* 終了系。回線の色は「今おかしい」ことを表すためにだけ使い、常時点灯させない */}
        <span
          data-testid="connection-status"
          style={{ fontSize: 11.5, color: isLineTrouble ? 'var(--color-alert-text)' : 'var(--color-muted)', whiteSpace: 'nowrap' }}
        >
          {isLineTrouble ? '回線が不安定です' : '回線 正常'}
        </span>
        <SmallButton
          label={isReconnecting ? '復旧中...' : '回線復旧'}
          onClick={onReconnect}
          disabled={isReconnecting}
          tone={isLineTrouble ? 'danger' : 'quiet'}
          title="音や映像が止まったときに、つなぎ直す"
        />
        <button
          onClick={() => {
            if (!confirm('教室から退室します。よろしいですか？')) return;
            onDisconnect();
          }}
          style={{
            padding: '4px 10px',
            fontSize: 11.5,
            borderRadius: 6,
            border: '1px solid var(--color-alert)',
            background: 'transparent',
            color: 'var(--color-alert-text)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          退室
        </button>

        {/* 日時表示。2行だと右端で折り返して次の行に落ちるので1行に収める */}
        <div style={{
          marginLeft: 8,
          fontSize: 12,
          color: 'var(--color-muted)',
          whiteSpace: 'nowrap',
        }}>
          {dateStr}（{dayStr}）
          <span id="igc-clock" style={{ marginLeft: 6, fontWeight: 700, color: 'var(--color-ink)' }}>
            {now.toLocaleTimeString('ja-JP')}
          </span>
        </div>
      </div>
    </div>
  );
}
