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
  participantCount,
}: RoomTabsProps) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-white/10 px-1">
      {/* 全員タブ */}
      <button
        onClick={() => onSelectClassroom(null)}
        className={`px-3 py-1.5 text-sm whitespace-nowrap rounded-t transition-colors ${
          selectedClassroomId === null
            ? 'bg-indigo-600/20 text-indigo-300 border-b-2 border-indigo-500'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
        }`}
      >
        全員
        {participantCount != null && (
          <span className="ml-1 text-xs text-zinc-500">({participantCount})</span>
        )}
      </button>

      {classrooms.map(cls => (
        <button
          key={cls.id}
          onClick={() => onSelectClassroom(cls.id)}
          className={`px-3 py-1.5 text-sm whitespace-nowrap rounded-t transition-colors ${
            selectedClassroomId === cls.id
              ? 'bg-indigo-600/20 text-indigo-300 border-b-2 border-indigo-500'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          {cls.name}
          <span className="ml-1 text-xs text-zinc-500">({cls.studentIds.length})</span>
        </button>
      ))}
    </div>
  );
}
