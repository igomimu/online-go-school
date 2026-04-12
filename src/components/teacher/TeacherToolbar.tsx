import { useRef, useState } from 'react';

interface TeacherToolbarProps {
  studentJoinInfo: string;
  classroomId?: string | null;
  classroomName?: string;
  onCreateGame: () => void;
  onStartLecture: () => void;
  onLoadSgf: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDisconnect: () => void;
  onOpenStudentManager: () => void;
  onEditClassroom?: () => void;
  onShowStudentLinks?: () => void;
  onAutoPairing?: () => void;
  onLoadProblem?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

// IGC風のボタン
function IgcButton({ label, color, onClick, 'data-testid': testId }: { label: string; color?: string; onClick?: () => void; 'data-testid'?: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      style={{
        padding: '4px 14px',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'MS Gothic, monospace',
        border: '1px solid #666',
        background: color || '#d0d0c8',
        cursor: 'pointer',
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
  onOpenStudentManager,
  onEditClassroom,
  onShowStudentLinks,
  onAutoPairing,
  onLoadProblem,
}: TeacherToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const problemInputRef = useRef<HTMLInputElement>(null);
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
    <div style={{ fontFamily: 'MS Gothic, monospace' }}>
      {/* 上段: 教室ID + クリアボタン群 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        background: '#4040a0',
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
              background: copiedClassroomId ? '#90ee90' : '#2020a0',
              color: copiedClassroomId ? '#333' : '#ffff00',
              border: '1px solid #6060c0',
              borderRadius: 3,
              padding: '1px 10px',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
              marginRight: 16,
              fontFamily: 'MS Gothic, monospace',
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
              background: copied ? '#90ee90' : '#2020a0',
              color: copied ? '#333' : '#aaccff',
              border: '1px solid #6060c0',
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
        <IgcButton label="【音声M】クリア" color="#d8d0c0" />
        <IgcButton label="【音声S】クリア" color="#d8d0c0" />
        <IgcButton label="【共有】クリア" color="#d8d0c0" />
        <IgcButton label="座席チェック" color="#ffa500" />
      </div>

      {/* 下段: アクションボタン群 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        background: '#c0c0b8',
      }}>
        {/* マイクアイコン的な表示 */}
        <span style={{ fontSize: 18, marginRight: 4 }}>🎤</span>

        <IgcButton label="退室" color="#d0d0c8" onClick={onDisconnect} />
        <IgcButton label="共有検討" color="#6090d0" onClick={onStartLecture} />

        <div style={{ flex: 1 }} />

        <IgcButton label="対局作成" color="#90d060" onClick={onCreateGame} data-testid="create-game-toolbar-button" />
        <IgcButton label="自動対局" color="#60c090" onClick={onAutoPairing} />

        <input ref={fileInputRef} type="file" accept=".sgf" onChange={onLoadSgf} className="hidden" />
        <IgcButton label="SGF読込" color="#d0d0c8" onClick={() => fileInputRef.current?.click()} />

        {onLoadProblem && (
          <>
            <input ref={problemInputRef} type="file" accept=".sgf" onChange={onLoadProblem} className="hidden" />
            <IgcButton label="詰碁" color="#e0b0ff" onClick={() => problemInputRef.current?.click()} />
          </>
        )}

        <IgcButton label="生徒入替" color="#f0e060" onClick={onEditClassroom} />
        <IgcButton label="生徒リンク" color="#a0d0f0" onClick={onShowStudentLinks} />
        <IgcButton label="生徒管理" color="#d0d0c8" onClick={onOpenStudentManager} />

        {studentJoinInfo && (
          <IgcButton
            label={copied ? '✓ コピー済み' : '参加リンク'}
            color={copied ? '#90ee90' : '#f0c060'}
            onClick={copyLink}
          />
        )}

        <IgcButton label="回線復旧" color="#ff6060" />
        <IgcButton label="ビデオリセット" color="#d0a0d0" />
        <IgcButton label="設定" color="#d0d0c8" />

        {/* 日時表示 */}
        <div style={{
          marginLeft: 8,
          fontSize: 12,
          fontWeight: 'bold',
          color: '#cc0000',
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
