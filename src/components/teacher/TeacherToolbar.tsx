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

// IGC風のボタン
function IgcButton({ label, color, onClick, disabled, 'data-testid': testId }: { label: string; color?: string; onClick?: () => void; disabled?: boolean; 'data-testid'?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        padding: '4px 14px',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'var(--font-inter)',
        border: '1px solid #3f3f46',
        background: color || '#27272a',
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
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
    <div style={{ fontFamily: 'var(--font-inter)' }}>
      {/* 上段: 教室ID + クリアボタン群 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 4,
        padding: '3px 6px',
        background: '#b45309',
        color: 'white',
      }}>
        <span style={{ fontWeight: 'bold', fontSize: 14, marginRight: 6 }}>
          {classroomName || '三村囲碁オンライン'}
        </span>
        {classroomId && (
          <button
            onClick={copyClassroomId}
            title="クリックで教室IDをコピー"
            style={{
              background: copiedClassroomId ? '#059669' : '#78350f',
              color: '#fff',
              border: '1px solid #d97706',
              borderRadius: 3,
              padding: '1px 10px',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
              marginRight: 16,
              fontFamily: 'var(--font-inter)',
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
              background: copied ? '#059669' : '#78350f',
              color: '#fff',
              border: '1px solid #d97706',
              borderRadius: 3,
              padding: '1px 10px',
              fontSize: 11,
              cursor: 'pointer',
              maxWidth: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? '✓ リンクコピー済み' : `📋 生徒招待リンク: ${studentJoinInfo.substring(0, 50)}...`}
          </button>
        )}

        <div style={{ flex: 1 }} />
        <IgcButton label="【音声M】クリア" color="#57534e" onClick={onClearAudioM} />
        <IgcButton label="【音声S】クリア" color="#57534e" onClick={onClearAudioS} />
        <IgcButton label="【共有】クリア" color="#57534e" onClick={onClearSharing} />
      </div>

      {/* 下段: アクションボタン群 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 4,
        padding: '3px 6px',
        background: '#18181b',
      }}>
        {/* マイクアイコン的な表示 */}
        <span style={{ fontSize: 18, marginRight: 4 }}>🎤</span>

        <IgcButton label="退室" color="#27272a" onClick={onDisconnect} />
        <IgcButton label="共有検討" color="#0d9488" onClick={onStartLecture} />

        <div style={{ flex: 1 }} />

        <IgcButton label="対局作成" color="#16a34a" onClick={onCreateGame} data-testid="create-game-toolbar-button" />
        {onOpenTeacherGameWindow && (
          <IgcButton label="対局ウィンドウ" color="#f59e0b" onClick={onOpenTeacherGameWindow} data-testid="open-teacher-game-window-button" />
        )}
        <IgcButton label="自動対局" color="#059669" onClick={onAutoPairing} />

        <input ref={fileInputRef} type="file" accept=".sgf" onChange={onLoadSgf} className="hidden" />
        <IgcButton label="SGF読込" color="#27272a" onClick={() => fileInputRef.current?.click()} />

        {onOpenTsumegoPicker && (
          <IgcButton label="詰碁DB" color="#7c3aed" onClick={onOpenTsumegoPicker} />
        )}

        <IgcButton label="生徒入替" color="#ca8a04" onClick={onEditClassroom} />
        <IgcButton label="生徒リンク" color="#be123c" onClick={onShowStudentLinks} />
        <IgcButton label="生徒管理" color="#27272a" onClick={onOpenStudentManager} />

        {studentJoinInfo && (
          <IgcButton
            label={copied ? '✓ コピー済み' : '参加リンク'}
            color={copied ? '#059669' : '#d97706'}
            onClick={copyLink}
          />
        )}

        <IgcButton
          label={isReconnecting ? '復旧中...' : '回線復旧'}
          color="#dc2626"
          onClick={onReconnect}
          disabled={isReconnecting}
        />

        {/* 日時表示 */}
        <div style={{
          marginLeft: 8,
          fontSize: 12,
          fontWeight: 'bold',
          color: '#f59e0b',
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
