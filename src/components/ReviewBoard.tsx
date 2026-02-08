import { useState, useCallback, useRef, useMemo } from 'react';
import GoBoard from './GoBoard';
import type { Drawing } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import type { ParticipantInfo, ClassroomLiveKit } from '../utils/classroomLiveKit';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, GitBranch, Pen, ArrowRight as ArrowRightIcon, Trash2 } from 'lucide-react';

interface ReviewBoardProps {
  rootNode: GameNode;
  currentNode: GameNode;
  boardSize: number;
  onSetCurrentNode: (node: GameNode) => void;
  isTeacher: boolean;
  classroomRef: React.RefObject<ClassroomLiveKit | null>;

  // 先生用
  participants?: ParticipantInfo[];
  localIdentity?: string;
  targetStudents?: string[];
  onSetTargetStudents?: (students: string[]) => void;
  onBack?: () => void;
}

export default function ReviewBoard({
  rootNode,
  currentNode,
  boardSize,
  onSetCurrentNode,
  isTeacher,
  classroomRef,
  participants,
  localIdentity,
  targetStudents,
  onSetTargetStudents,
  onBack,
}: ReviewBoardProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);

  const boardState = currentNode.board;
  const markers = currentNode.markers;

  const goToRoot = () => onSetCurrentNode(rootNode);
  const goBack = () => {
    if (currentNode.parent) onSetCurrentNode(currentNode.parent);
  };
  const goForward = () => {
    if (currentNode.children.length > 0) onSetCurrentNode(currentNode.children[0]);
  };
  const goForwardBranch = (index: number) => {
    if (currentNode.children[index]) onSetCurrentNode(currentNode.children[index]);
  };
  const goLast = () => {
    let curr = currentNode;
    while (curr.children.length > 0) curr = curr.children[0];
    onSetCurrentNode(curr);
  };

  // 描画ハンドラ
  const handleDrawDragStart = useCallback((x: number, y: number) => {
    if (isTeacher && drawMode !== 'off') {
      setDrawStart({ x, y });
      drawLastCell.current = { x, y };
    }
  }, [isTeacher, drawMode]);

  const handleDrawDragMove = useCallback((x: number, y: number) => {
    if (isTeacher && drawMode !== 'off') {
      drawLastCell.current = { x, y };
    }
  }, [isTeacher, drawMode]);

  const handleDrawDragEnd = useCallback(() => {
    if (isTeacher && drawMode !== 'off' && drawStart && drawLastCell.current) {
      const end = drawLastCell.current;
      if (drawStart.x !== end.x || drawStart.y !== end.y) {
        const newDrawing: Drawing = {
          fromX: drawStart.x, fromY: drawStart.y,
          toX: end.x, toY: end.y,
          type: drawMode,
        };
        const updated = [...drawings, newDrawing];
        setDrawings(updated);
        classroomRef.current?.broadcast({ type: 'DRAW_UPDATE', payload: updated });
      }
      setDrawStart(null);
      drawLastCell.current = null;
    }
  }, [isTeacher, drawMode, drawStart, drawings, classroomRef]);

  const clearDrawings = useCallback(() => {
    setDrawings([]);
    classroomRef.current?.broadcast({ type: 'DRAW_CLEAR', payload: null });
  }, [classroomRef]);

  // カーソル共有
  const handleCellMouseEnter = useCallback((x: number, y: number) => {
    if (isTeacher) {
      classroomRef.current?.broadcast({ type: 'CURSOR_MOVE', payload: { x, y } });
    }
  }, [isTeacher, classroomRef]);

  const handleCellMouseLeave = useCallback(() => {
    if (isTeacher) {
      classroomRef.current?.broadcast({ type: 'CURSOR_CLEAR', payload: null });
    }
  }, [isTeacher, classroomRef]);

  const currentMoveNumber = currentNode.move ? currentNode.nextNumber - 1 : 0;

  // 生徒選択
  const students = useMemo(() => {
    if (!participants || !localIdentity) return [];
    return participants.filter(p => p.identity !== localIdentity);
  }, [participants, localIdentity]);

  const toggleStudent = (identity: string) => {
    if (!targetStudents || !onSetTargetStudents) return;
    if (targetStudents.length === 0) {
      // 全員選択状態から1人外す
      const allNames = students.map(s => s.identity).filter(n => n !== identity);
      onSetTargetStudents(allNames);
    } else if (targetStudents.includes(identity)) {
      onSetTargetStudents(targetStudents.filter(n => n !== identity));
    } else {
      onSetTargetStudents([...targetStudents, identity]);
    }
  };

  const selectAllStudents = () => {
    onSetTargetStudents?.([]);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      <div className="flex-1 space-y-4">
        {/* 検討/授業ヘッダー */}
        <div className="glass-panel px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm">
                &larr; ロビーに戻る
              </button>
            )}
            <span className="font-bold">検討モード</span>
            <span className="text-sm text-zinc-500">
              {currentMoveNumber}手目
            </span>
          </div>
          {isTeacher && currentNode.children.length > 1 && (
            <div className="flex items-center gap-2 text-blue-300 text-sm">
              <GitBranch className="w-4 h-4" />
              <span>{currentNode.children.length}変化</span>
            </div>
          )}
        </div>

        {/* 碁盤 */}
        <div className="glass-panel p-4 flex justify-center shadow-2xl">
          <GoBoard
            boardState={boardState}
            boardSize={boardSize}
            markers={markers}
            drawings={drawings}
            readOnly={!isTeacher}
            onCellMouseEnter={handleCellMouseEnter}
            onCellMouseLeave={handleCellMouseLeave}
            onDragStart={drawMode !== 'off' ? handleDrawDragStart : undefined}
            onDragMove={drawMode !== 'off' ? handleDrawDragMove : undefined}
            onDragEnd={drawMode !== 'off' ? handleDrawDragEnd : undefined}
          />
        </div>

        {/* ナビゲーション */}
        {isTeacher && (
          <div className="flex justify-center gap-2">
            <button onClick={goToRoot} disabled={!currentNode.parent} className="p-3 glass-panel hover:bg-white/10 disabled:opacity-30">
              <ChevronFirst />
            </button>
            <button onClick={goBack} disabled={!currentNode.parent} className="p-3 glass-panel hover:bg-white/10 disabled:opacity-30">
              <ChevronLeft />
            </button>
            <button onClick={goForward} disabled={currentNode.children.length === 0} className="p-3 glass-panel hover:bg-white/10 disabled:opacity-30">
              <ChevronRight />
            </button>
            <button onClick={goLast} disabled={currentNode.children.length === 0} className="p-3 glass-panel hover:bg-white/10 disabled:opacity-30">
              <ChevronLast />
            </button>

            <div className="w-px bg-white/10 mx-1" />

            <button
              onClick={() => setDrawMode(drawMode === 'line' ? 'off' : 'line')}
              className={`p-3 glass-panel hover:bg-white/10 ${drawMode === 'line' ? 'bg-red-500/20 text-red-400' : ''}`}
              title="線を描く"
            >
              <Pen className="w-5 h-5" />
            </button>
            <button
              onClick={() => setDrawMode(drawMode === 'arrow' ? 'off' : 'arrow')}
              className={`p-3 glass-panel hover:bg-white/10 ${drawMode === 'arrow' ? 'bg-red-500/20 text-red-400' : ''}`}
              title="矢印を描く"
            >
              <ArrowRightIcon className="w-5 h-5" />
            </button>
            {drawings.length > 0 && (
              <button onClick={clearDrawings} className="p-3 glass-panel hover:bg-white/10 text-zinc-400 hover:text-red-400" title="描画を消去">
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* 変化選択 */}
        {isTeacher && currentNode.children.length > 1 && (
          <div className="flex justify-center gap-2 overflow-x-auto p-2">
            {currentNode.children.map((child, idx) => (
              <button
                key={idx}
                onClick={() => goForwardBranch(idx)}
                className="px-3 py-1 bg-white/5 border border-white/10 rounded text-sm hover:bg-blue-500/20"
              >
                変化{idx + 1} ({child.move ? (child.move.color === 'BLACK' ? '黒' : '白') : '?'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* サイドバー（先生のみ: 生徒選択） */}
      {isTeacher && students.length > 0 && (
        <div className="w-full lg:w-64 space-y-4">
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold text-sm">配信先の生徒</h3>
            <button
              onClick={selectAllStudents}
              className={`w-full text-sm py-1 rounded-lg transition-all ${
                targetStudents?.length === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              全員に配信
            </button>
            <div className="space-y-1">
              {students.map(s => {
                const isSelected = !targetStudents || targetStudents.length === 0 || targetStudents.includes(s.identity);
                return (
                  <button
                    key={s.identity}
                    onClick={() => toggleStudent(s.identity)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all ${
                      isSelected ? 'bg-blue-500/10 text-blue-300' : 'bg-white/5 text-zinc-500'
                    }`}
                  >
                    {s.identity}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
