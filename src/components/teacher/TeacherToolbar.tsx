import { useRef } from 'react';
import {
  Plus, BookOpen, Upload, LogOut, Link, Copy, Check,
  Users, Settings,
} from 'lucide-react';
import { useState } from 'react';

interface TeacherToolbarProps {
  studentJoinInfo: string;
  onCreateGame: () => void;
  onStartLecture: () => void;
  onLoadSgf: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDisconnect: () => void;
  onOpenStudentManager: () => void;
}

export default function TeacherToolbar({
  studentJoinInfo,
  onCreateGame,
  onStartLecture,
  onLoadSgf,
  onDisconnect,
  onOpenStudentManager,
}: TeacherToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    if (!studentJoinInfo) return;
    navigator.clipboard.writeText(studentJoinInfo).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap px-2 py-2 border-t border-white/10 bg-white/[0.02]">
      <button onClick={onCreateGame} className="premium-button flex items-center gap-1.5 text-sm px-3 py-1.5">
        <Plus className="w-4 h-4" /> 対局作成
      </button>

      <button onClick={onStartLecture} className="secondary-button flex items-center gap-1.5 text-sm px-3 py-1.5">
        <BookOpen className="w-4 h-4" /> 授業
      </button>

      <input ref={fileInputRef} type="file" accept=".sgf" onChange={onLoadSgf} className="hidden" />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="secondary-button flex items-center gap-1.5 text-sm px-3 py-1.5"
      >
        <Upload className="w-4 h-4" /> SGF読込
      </button>

      <button onClick={onOpenStudentManager} className="secondary-button flex items-center gap-1.5 text-sm px-3 py-1.5">
        <Users className="w-4 h-4" /> 生徒管理
      </button>

      {/* 区切り */}
      <div className="flex-1" />

      {/* 参加リンク */}
      {studentJoinInfo && (
        <button
          onClick={copyLink}
          className="secondary-button flex items-center gap-1.5 text-sm px-3 py-1.5"
          title="生徒用参加リンクをコピー"
        >
          {copied
            ? <><Check className="w-4 h-4 text-green-400" /> コピー済み</>
            : <><Link className="w-4 h-4" /> 参加リンク</>
          }
        </button>
      )}

      <button
        onClick={onDisconnect}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
      >
        <LogOut className="w-4 h-4" /> 退室
      </button>
    </div>
  );
}
