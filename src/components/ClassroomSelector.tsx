import { ChevronDown, Users, Settings2 } from 'lucide-react';
import { useState } from 'react';
import type { Student, Classroom } from '../types/classroom';

interface ClassroomSelectorProps {
  classrooms: Classroom[];
  students: Student[];
  selectedClassroomId: string | null;
  onSelectClassroom: (id: string | null) => void;
  onOpenManager: () => void;
}

export default function ClassroomSelector({
  classrooms,
  students,
  selectedClassroomId,
  onSelectClassroom,
  onOpenManager,
}: ClassroomSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selected = classrooms.find(c => c.id === selectedClassroomId);

  // 選択中の教室の生徒
  const classroomStudents = selected
    ? selected.studentIds
        .map(sid => students.find(s => s.id === sid))
        .filter(Boolean) as Student[]
    : [];

  return (
    <div className="space-y-3">
      {/* 教室セレクター */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              {selected ? selected.name : '教室を選択'}
            </span>
            <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-white/10 rounded-lg shadow-xl z-10 overflow-hidden">
              <button
                onClick={() => { onSelectClassroom(null); setIsOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                  !selectedClassroomId ? 'bg-blue-500/10 text-blue-400' : ''
                }`}
              >
                全生徒
              </button>
              {classrooms.map(c => {
                const count = c.studentIds.filter(sid => students.some(s => s.id === sid)).length;
                return (
                  <button
                    key={c.id}
                    onClick={() => { onSelectClassroom(c.id); setIsOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 flex justify-between ${
                      selectedClassroomId === c.id ? 'bg-blue-500/10 text-blue-400' : ''
                    }`}
                  >
                    <span>{c.name}</span>
                    <span className="text-zinc-500">{count}名</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={onOpenManager}
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
          title="生徒・教室管理"
        >
          <Settings2 className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* 教室の生徒一覧 */}
      {selected && classroomStudents.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-zinc-500 px-1">
            {selected.name} ({classroomStudents.length}/{selected.maxCapacity}名)
          </div>
          <div className="space-y-0.5">
            {classroomStudents.map(s => (
              <div key={s.id} className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs">
                <span>{s.name}</span>
                <div className="flex items-center gap-1">
                  {s.rank && (
                    <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                      {s.rank}
                    </span>
                  )}
                  {s.internalRating && (
                    <span className="text-zinc-500">{s.internalRating}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
