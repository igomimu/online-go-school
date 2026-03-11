import { useState } from 'react';
import type { Student, Classroom } from '../../types/classroom';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';

interface ClassroomManagerProps {
  students: Student[];
  classrooms: Classroom[];
  onLaunchClassroom: (classroomId: string) => void;
  onOpenSettings: () => void;
  onOpenStudentManager: () => void;
  onReloadData: () => void;
}

type TabId = 'classroom' | 'student';

export default function ClassroomManager({
  students,
  classrooms,
  onLaunchClassroom,
  onOpenSettings,
  onOpenStudentManager,
  onReloadData,
}: ClassroomManagerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('classroom');
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);

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
        {/* 左サイドパネル（黄色背景、IGC風） */}
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

          <div style={{ marginTop: 'auto' }}>
            <div style={{ color: '#cc0000', fontWeight: 'bold', marginBottom: 8 }}>
              定期的に教室情報のバックアップをお願いします。
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <IgcButton label="教室情報アップロード" />
              <IgcButton label="教室情報ダウンロード" />
              <IgcButton label="教室情報USBバックアップ" />
              <IgcButton label="教室情報USB復元" />
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
                    <th style={{ ...headerCellStyle, width: 26, textAlign: 'center' }}></th>
                    <th style={{ ...headerCellStyle, width: 36, textAlign: 'center' }}>編集</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>開く</th>
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
                      <td style={{ ...cellStyle, textAlign: 'center', color: '#cc0000' }}>×</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => setEditingClassroom(cls)}
                          style={{
                            padding: '1px 6px',
                            fontSize: 10,
                            border: '1px solid #666',
                            background: '#d8d0c0',
                            cursor: 'pointer',
                          }}
                        >
                          調整
                        </button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => onLaunchClassroom(cls.id)}
                          style={{
                            padding: '1px 6px',
                            fontSize: 10,
                            border: '1px solid #666',
                            background: '#d8d0c0',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          開く
                        </button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button style={{
                          padding: '1px 6px',
                          fontSize: 10,
                          border: '1px solid #666',
                          background: '#d8d0c0',
                          cursor: 'pointer',
                        }}>
                          開始
                        </button>
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
                      <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                        教室がありません — 「生徒管理」からXMLインポートしてください
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* === 生徒情報タブ === */
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>順番</th>
                    <th style={{ ...headerCellStyle, width: 26, textAlign: 'center' }}>×</th>
                    <th style={{ ...headerCellStyle, width: 36, textAlign: 'center' }}>調整</th>
                    <th style={{ ...headerCellStyle, width: 36, textAlign: 'center' }}>編集</th>
                    <th style={{ ...headerCellStyle, width: 36, textAlign: 'center' }}>開く</th>
                    <th style={{ ...headerCellStyle, width: 36, textAlign: 'center' }}>棋譜</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>生徒ID</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>姓名</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>性別</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>棋力</th>
                    <th style={{ ...headerCellStyle, width: 70, textAlign: 'left' }}>生徒種別</th>
                    <th style={{ ...headerCellStyle, width: 40, textAlign: 'center' }}>学年</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>所在地</th>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} style={{
                      background: i % 2 === 0 ? '#f0f0e8' : '#e8e8e0',
                    }}>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <span style={{ color: '#009900' }}>▶</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center', color: '#cc0000' }}>×</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button style={{
                          padding: '1px 4px', fontSize: 10, border: '1px solid #666',
                          background: '#d8d0c0', cursor: 'pointer',
                        }}>調整</button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button style={{
                          padding: '1px 4px', fontSize: 10, border: '1px solid #666',
                          background: '#d8d0c0', cursor: 'pointer',
                        }}>開く</button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button style={{
                          padding: '1px 4px', fontSize: 10, border: '1px solid #666',
                          background: '#d8d0c0', cursor: 'pointer',
                        }}>開く</button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button style={{
                          padding: '1px 4px', fontSize: 10, border: '1px solid #666',
                          background: '#d8d0c0', cursor: 'pointer',
                        }}>棋譜</button>
                      </td>
                      <td style={{ ...cellStyle, fontSize: 10 }}>{s.id}</td>
                      <td style={{
                        ...cellStyle,
                        fontWeight: 'bold',
                        background: '#ffe0b0',
                      }}>
                        {s.name}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>男</td>
                      <td style={{ ...cellStyle, textAlign: 'center', color: '#cc6600' }}>{s.internalRating}</td>
                      <td style={cellStyle}>{s.type}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{s.grade}</td>
                      <td style={cellStyle}>{s.country}</td>
                      <td style={cellStyle}></td>
                    </tr>
                  ))}
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
        <IgcButton label="閉じる" />
        <IgcButton label="棋譜USBバックアップ" />
        <IgcButton label="棋譜USB復元" />
        <div style={{ flex: 1 }} />
        <IgcButton label="教員管理" color="#90c0e0" />
        <IgcButton label="問題集管理" color="#90c0e0" />
        <IgcButton label="生徒種別管理" color="#90c0e0" />
        <IgcButton label="生徒管理" color="#d0d0c8" onClick={onOpenStudentManager} />
        <IgcButton label="設定" color="#f0c060" onClick={onOpenSettings} />

        {/* 日時表示 */}
        <DateTimeDisplay />
      </div>

      {/* 教室設定ダイアログ */}
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
        cursor: 'pointer',
        whiteSpace: 'nowrap',
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
