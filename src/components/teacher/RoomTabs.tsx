import type { Classroom } from '../../types/classroom';

interface RoomTabsProps {
  classrooms: Classroom[];
  selectedClassroomId: string | null;
  onSelectClassroom: (id: string | null) => void;
  participantCount?: number;
}

export default function RoomTabs({
  classrooms,
  selectedClassroomId,
  onSelectClassroom,
}: RoomTabsProps) {
  // IGC: 最下部の部屋タブ「部屋1(1~)」「部屋2(11~)」形式
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: 0,
      background: '#c0c0b8',
      borderTop: '1px solid #999',
      paddingLeft: 2,
      fontFamily: 'MS Gothic, monospace',
    }}>
      {classrooms.map((cls, i) => {
        const isSelected = selectedClassroomId === cls.id;
        const startNum = i * 10 + 1;
        return (
          <button
            key={cls.id}
            onClick={() => onSelectClassroom(cls.id)}
            style={{
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 'bold',
              border: '1px solid #999',
              borderBottom: isSelected ? '1px solid #e8e8e0' : '1px solid #999',
              background: isSelected ? '#e8e8e0' : '#d0d0c8',
              cursor: 'pointer',
              marginBottom: -1,
              borderRadius: '4px 4px 0 0',
              color: '#333',
            }}
          >
            部屋{i + 1}({startNum}〜)
          </button>
        );
      })}

      {classrooms.length === 0 && (
        <button
          onClick={() => onSelectClassroom(null)}
          style={{
            padding: '4px 12px',
            fontSize: 13,
            fontWeight: 'bold',
            border: '1px solid #999',
            borderBottom: '1px solid #e8e8e0',
            background: '#e8e8e0',
            borderRadius: '4px 4px 0 0',
            color: '#333',
          }}
        >
          部屋1(1〜)
        </button>
      )}
    </div>
  );
}
