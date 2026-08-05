import { useRef, useState } from 'react';

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
}

// 操作卓のボタン。IGCの機能配置はそのままに、見た目はアプリ本体に揃える。

// ボタン面の色から文字色を決める。榧の面には墨、朱の面には生成りを置く。
function faceText(face?: string): string {
  if (face === 'var(--color-accent)') return 'var(--color-accent-ink)';
  if (face === 'var(--color-alert-face)') return '#f8efec';
  return 'var(--color-ink)';
}

/** 補助操作。主操作より一段小さく、面も持たせない */
function SmallButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 11.5,
        borderRadius: 6,
        border: '1px solid var(--color-line)',
        background: 'transparent',
        color: 'var(--color-muted)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function IgcButton({ label, color, onClick, disabled, 'data-testid': testId }: { label: string; color?: string; onClick?: () => void; disabled?: boolean; 'data-testid'?: string }) {
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
        border: '1px solid var(--color-line)',
        background: color || 'var(--color-raised)',
        color: faceText(color),
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

      {/* 下段: アクションボタン群 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        padding: '8px 12px',
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-line)',
      }}>

        <IgcButton label="退室" color="var(--color-raised)" onClick={onDisconnect} />
        <IgcButton label="共有検討" color="var(--color-raised)" onClick={onStartLecture} />

        <div style={{ flex: 1 }} />

        <IgcButton label="対局作成" color="var(--color-raised)" onClick={onCreateGame} data-testid="create-game-toolbar-button" />
        {onOpenTeacherGameWindow && (
          <IgcButton label="対局ウィンドウ" color="var(--color-accent)" onClick={onOpenTeacherGameWindow} data-testid="open-teacher-game-window-button" />
        )}
        <IgcButton label="自動対局" color="var(--color-raised)" onClick={onAutoPairing} />

        <input ref={fileInputRef} type="file" accept=".sgf" onChange={onLoadSgf} className="hidden" />
        <IgcButton label="SGF読込" color="var(--color-raised)" onClick={() => fileInputRef.current?.click()} />

        {onOpenTsumegoPicker && (
          <IgcButton label="詰碁DB" color="var(--color-raised)" onClick={onOpenTsumegoPicker} />
        )}

        <IgcButton label="生徒入替" color="var(--color-raised)" onClick={onEditClassroom} />
        <IgcButton label="生徒リンク" color="var(--color-raised)" onClick={onShowStudentLinks} />
        <IgcButton label="生徒管理" color="var(--color-raised)" onClick={onOpenStudentManager} />

        {studentJoinInfo && (
          <IgcButton
            label={copied ? '✓ コピー済み' : '参加リンク'}
            color={copied ? 'var(--color-accent)' : 'var(--color-raised)'}
            onClick={copyLink}
          />
        )}

        <IgcButton
          label={isReconnecting ? '復旧中...' : '回線復旧'}
          color="var(--color-alert-face)"
          onClick={onReconnect}
          disabled={isReconnecting}
        />

        {/* 日時表示 */}
        <div style={{
          marginLeft: 8,
          fontSize: 12,
          fontWeight: 'bold',
          color: 'var(--color-alert-text)',
          textAlign: 'right',
          lineHeight: 1.2,
        }}>
          <div>{dateStr}（{dayStr}曜日）</div>
          <div id="igc-clock" style={{ fontSize: 14 }}>
            {now.toLocaleTimeString('ja-JP')}
          </div>
        </div>
      </div>
    </div>
  );
}
