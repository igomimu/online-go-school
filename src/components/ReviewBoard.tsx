import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import GoBoard from './GoBoard';
import type { Drawing, Marker, StoneColor } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import { getMainPath, addMove, removeNode } from '../utils/treeUtilsV2';
import { findNearestDrawingIndex } from '../utils/drawingUtils';
import type { ParticipantInfo, ClassroomLiveKit } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, GitBranch, Pen, ArrowRight as ArrowRightIcon, Trash2, Play, Pause, MessageSquare, Circle, Triangle, Square, X, Type, Hash, Eraser, Maximize2, Minimize2, Undo2 } from 'lucide-react';
import { checkCapture } from '../utils/gameLogic';
import { getDisplayName } from '../utils/identityUtils';
import { useAutoReplay, REPLAY_SPEEDS } from '../hooks/useAutoReplay';
import { useAiAnalysis } from '../hooks/useAiAnalysis';
import AiAnalysisPanel from './AiAnalysisPanel';
import WinRateGraph from './WinRateGraph';
import ChatPanel from './teacher/ChatPanel';

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

  // チャット
  registeredStudents?: Student[];
  chatMessages?: ChatMessage[];
  onChatSend?: (text: string, target: 'all' | string) => void;
}

// Helper functions for markers
const toggleMarker = (
  markers: Marker[],
  x: number,
  y: number,
  type: 'LABEL' | 'SYMBOL',
  value: string
): Marker[] => {
  const existingIdx = (markers || []).findIndex(m => m.x === x && m.y === y);
  if (existingIdx >= 0) {
    const existing = markers[existingIdx];
    if (existing.type === type && existing.value === value) {
      return markers.filter((_, idx) => idx !== existingIdx);
    } else {
      const copy = [...markers];
      copy[existingIdx] = { x, y, type, value };
      return copy;
    }
  } else {
    return [...(markers || []), { x, y, type, value }];
  }
};

const getNextAlphaValue = (markers: Marker[]): string => {
  const letters = (markers || [])
    .filter(m => m.type === 'LABEL' && m.value.length === 1 && m.value >= 'A' && m.value <= 'Z')
    .map(m => m.value.charCodeAt(0));
  if (letters.length === 0) return 'A';
  const maxCode = Math.max(...letters);
  if (maxCode >= 90) return 'A';
  return String.fromCharCode(maxCode + 1);
};

const getNextNumValue = (markers: Marker[]): string => {
  const nums = (markers || [])
    .filter(m => m.type === 'LABEL' && !isNaN(Number(m.value)))
    .map(m => Number(m.value));
  if (nums.length === 0) return '1';
  const maxNum = Math.max(...nums);
  return (maxNum + 1).toString();
};

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
  registeredStudents,
  chatMessages,
  onChatSend,
}: ReviewBoardProps) {
  const [isMaximized, setIsMaximized] = useState(true);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);
  const [toolMode, setToolMode] = useState<'play' | 'circle' | 'triangle' | 'square' | 'cross' | 'alpha' | 'num' | 'eraser'>('play');

  const boardState = currentNode.board;
  const nodeMarkers = currentNode.markers;

  // AI候補手のハイライト座標（1-indexed）。対象nodeが変わったら表示しない
  const [aiHighlight, setAiHighlight] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  const markers = useMemo<Marker[] | undefined>(() => {
    if (!aiHighlight || aiHighlight.nodeId !== currentNode.id) return nodeMarkers;
    const overlay: Marker = { x: aiHighlight.x, y: aiHighlight.y, type: 'SYMBOL', value: 'SQR' };
    return nodeMarkers ? [...nodeMarkers, overlay] : [overlay];
  }, [nodeMarkers, aiHighlight, currentNode.id]);

  const handleHighlightMove = useCallback((x: number, y: number) => {
    // 同じ手の再クリックでトグル解除（既存パターン: draw mode の re-toggle と同じ感覚）
    setAiHighlight(prev => (
      prev && prev.nodeId === currentNode.id && prev.x === x && prev.y === y
        ? null
        : { nodeId: currentNode.id, x, y }
    ));
  }, [currentNode.id]);

  const goToRoot = useCallback(() => onSetCurrentNode(rootNode), [rootNode, onSetCurrentNode]);
  const goBack = useCallback(() => {
    if (currentNode.parent) onSetCurrentNode(currentNode.parent);
  }, [currentNode, onSetCurrentNode]);
  const goForward = useCallback(() => {
    if (currentNode.children.length > 0) onSetCurrentNode(currentNode.children[0]);
  }, [currentNode, onSetCurrentNode]);
  const goForwardBranch = (index: number) => {
    if (currentNode.children[index]) onSetCurrentNode(currentNode.children[index]);
  };
  const goLast = useCallback(() => {
    let curr = currentNode;
    while (curr.children.length > 0) curr = curr.children[0];
    onSetCurrentNode(curr);
  }, [currentNode, onSetCurrentNode]);

  // 直近の一手を取り消す（誤クリックで作った分岐をツリーから除去する）
  const handleUndo = useCallback(() => {
    const parent = removeNode(currentNode);
    if (parent) onSetCurrentNode(parent);
  }, [currentNode, onSetCurrentNode]);

  // マウスホイールで手順送り/戻り（pokekata踏襲）
  const handleBoardWheel = useCallback((delta: number) => {
    if (!isTeacher) return;
    if (delta > 0) goForward();
    else if (delta < 0) goBack();
  }, [isTeacher, goForward, goBack]);

  // 右クリックで、クリック位置に最も近い描画(線・矢印)を1つ消す（pokekata踏襲、石は対象外）
  const handleCellRightClick = useCallback((x: number, y: number) => {
    if (!isTeacher || drawings.length === 0) return;
    const idx = findNearestDrawingIndex(drawings, x, y);
    if (idx < 0) return;
    const updated = drawings.filter((_, i) => i !== idx);
    setDrawings(updated);
    classroomRef.current?.broadcast({ type: 'DRAW_UPDATE', payload: updated });
  }, [isTeacher, drawings, classroomRef]);

  // キーボードショートカット（pokekata踏襲）。チャット等の入力中は無効化する。
  useEffect(() => {
    if (!isTeacher) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); goBack(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
      else if (e.key === 'Home') { e.preventDefault(); goToRoot(); }
      else if (e.key === 'End') { e.preventDefault(); goLast(); }
      else if (e.key === 'Delete') { e.preventDefault(); handleUndo(); }
      else if (ctrl && e.key === 'z') { e.preventDefault(); handleUndo(); }
      else if (e.key === 'Escape') { setToolMode('play'); setDrawMode('off'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTeacher, handleUndo, goBack, goForward, goToRoot, goLast]);

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

  const clearAnnotations = useCallback(() => {
    setDrawings([]);
    classroomRef.current?.broadcast({ type: 'DRAW_CLEAR', payload: null });
    if (currentNode.markers && currentNode.markers.length > 0) {
      onSetCurrentNode({ ...currentNode, markers: [] });
    }
  }, [currentNode, classroomRef, onSetCurrentNode]);

  // Click handler for board (making moves or annotations)
  const handleCellClick = useCallback((x: number, y: number) => {
    if (!isTeacher) return;
    if (drawMode !== 'off') return;

    if (toolMode === 'play') {
      if (boardState[y - 1]?.[x - 1]) return;

      const newBoard = boardState.map(row => row.map(cell => cell ? { ...cell } : null));
      const derivedNextColor: StoneColor = currentNode.move
        ? (currentNode.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
        : 'BLACK';

      newBoard[y - 1][x - 1] = { color: derivedNextColor, number: currentNode.nextNumber };

      const { board: capturedBoard } = checkCapture(newBoard, x, y, derivedNextColor, boardSize);

      const realNewNode = addMove(
        currentNode, capturedBoard, currentNode.nextNumber + 1,
        derivedNextColor, boardSize,
        { x, y, color: derivedNextColor }
      );

      onSetCurrentNode(realNewNode);
    } else if (toolMode === 'eraser') {
      const updatedMarkers = (currentNode.markers || []).filter(m => m.x !== x || m.y !== y);
      onSetCurrentNode({ ...currentNode, markers: updatedMarkers });
    } else {
      let type: 'LABEL' | 'SYMBOL' = 'SYMBOL';
      let value = 'CIR';

      if (toolMode === 'circle') {
        type = 'SYMBOL';
        value = 'CIR';
      } else if (toolMode === 'triangle') {
        type = 'SYMBOL';
        value = 'TRI';
      } else if (toolMode === 'square') {
        type = 'SYMBOL';
        value = 'SQR';
      } else if (toolMode === 'cross') {
        type = 'SYMBOL';
        value = 'X';
      } else if (toolMode === 'alpha') {
        type = 'LABEL';
        value = getNextAlphaValue(currentNode.markers || []);
      } else if (toolMode === 'num') {
        type = 'LABEL';
        value = getNextNumValue(currentNode.markers || []);
      }

      const updatedMarkers = toggleMarker(currentNode.markers || [], x, y, type, value);
      onSetCurrentNode({ ...currentNode, markers: updatedMarkers });
    }
  }, [
    boardState,
    isTeacher,
    boardSize,
    currentNode,
    drawMode,
    toolMode,
    onSetCurrentNode,
  ]);

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

  // 自動再生
  const autoReplay = useAutoReplay(currentNode, onSetCurrentNode);

  // AI分析: collect move history from root to current node
  const moveHistory = useMemo(() => {
    const moves: { x: number; y: number; color: 'BLACK' | 'WHITE' }[] = [];
    let node: GameNode | null = currentNode;
    const path: GameNode[] = [];
    while (node) {
      path.unshift(node);
      node = node.parent;
    }
    for (const n of path) {
      if (n.move) moves.push(n.move);
    }
    return moves;
  }, [currentNode]);

  const aiAnalysis = useAiAnalysis(currentNode, moveHistory, {
    boardSize,
    komi: 6.5, // Default; could be passed via props
  });

  // Build win rate graph data from main path
  const winRateData = useMemo(() => {
    if (!aiAnalysis.settings.enabled) return [];
    const mainPath = getMainPath(rootNode);
    const data: { moveNumber: number; winrate: number }[] = [];
    for (const node of mainPath) {
      const moveNum = node.move ? node.nextNumber - 1 : 0;
      // We only have data for cached nodes
      // For now, just show a flat line at 50 if no data
      data.push({ moveNumber: moveNum, winrate: 50 });
    }
    // Override with actual result for current node
    if (aiAnalysis.result) {
      data.push({ moveNumber: currentMoveNumber, winrate: aiAnalysis.result.winrate });
    }
    return data;
  }, [aiAnalysis.settings.enabled, aiAnalysis.result, rootNode, currentMoveNumber]);

  // 生徒選択
  const studentParticipants = useMemo(() => {
    if (!participants || !localIdentity) return [];
    return participants.filter(p => p.identity !== localIdentity);
  }, [participants, localIdentity]);

  const toggleStudent = (identity: string) => {
    if (!targetStudents || !onSetTargetStudents) return;
    if (targetStudents.length === 0) {
      // 全員選択状態から1人外す
      const allNames = studentParticipants.map(s => s.identity).filter(n => n !== identity);
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
    <div className="flex flex-col lg:flex-row gap-6 w-full lg:h-full lg:min-h-0">
      <div className="flex-1 space-y-4 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
        {/* 検討/授業ヘッダー */}
        <div className="glass-panel px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg text-sm font-semibold transition-colors duration-150"
              >
                <X className="w-4 h-4" /> 閉じてホーム
              </button>
            )}
            <span className="font-bold text-base ml-2">検討モード</span>
            <span className="text-sm text-zinc-400">
              {currentMoveNumber}手目
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isTeacher && (
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold transition-all"
              >
                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                {isMaximized ? '操作パネルを表示' : '碁盤のみ最大化'}
              </button>
            )}
            {isTeacher && currentNode.children.length > 1 && (
              <div className="flex items-center gap-2 text-amber-300 text-sm">
                <GitBranch className="w-4 h-4" />
                <span>{currentNode.children.length}変化</span>
              </div>
            )}
          </div>
        </div>

        {/* 碁盤 */}
        <div className="glass-panel p-4 flex justify-center items-center shadow-2xl lg:flex-1 lg:min-h-0">
          <GoBoard
            boardState={boardState}
            boardSize={boardSize}
            className="max-w-[min(100%,calc(100dvh-10rem))]"
            maxHeight="calc(100dvh - 10rem)"
            markers={markers}
            drawings={drawings}
            readOnly={!isTeacher}
            onCellClick={isTeacher ? handleCellClick : undefined}
            onCellRightClick={isTeacher ? handleCellRightClick : undefined}
            onBoardWheel={isTeacher ? handleBoardWheel : undefined}
            onCellMouseEnter={handleCellMouseEnter}
            onCellMouseLeave={handleCellMouseLeave}
            onDragStart={drawMode !== 'off' ? handleDrawDragStart : undefined}
            onDragMove={drawMode !== 'off' ? handleDrawDragMove : undefined}
            onDragEnd={drawMode !== 'off' ? handleDrawDragEnd : undefined}
          />
        </div>

        {/* ナビゲーション */}
        {isTeacher && (
          <div className="flex flex-col gap-3 w-full items-center">
            {/* ステップ移動 */}
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
              <div className="w-px h-8 bg-white/10 mx-1 self-center" />
              <button
                onClick={handleUndo}
                disabled={!currentNode.parent}
                title="直近の一手を取り消す (Delete / Ctrl+Z)"
                className="p-3 glass-panel hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
              >
                <Undo2 />
              </button>
            </div>

            {/* アノテーション & 描画ツールバー */}
            <div className="flex flex-wrap justify-center items-center gap-1.5 p-2 bg-zinc-900/60 border border-zinc-800 rounded-xl max-w-full">
              {/* 着手モード */}
              <button
                onClick={() => { setToolMode('play'); setDrawMode('off'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  toolMode === 'play' && drawMode === 'off'
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="通常の着手を行います (石を置く)"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-current inline-block" />
                着手
              </button>

              <div className="w-px h-5 bg-zinc-800 mx-1" />

              {/* 記号マーク */}
              <button
                onClick={() => { setToolMode('circle'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'circle' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="丸印 (CIR)"
              >
                <Circle className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('triangle'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'triangle' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="三角印 (TRI)"
              >
                <Triangle className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('square'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'square' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="四角印 (SQR)"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('cross'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'cross' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="バツ印 (X)"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-zinc-800 mx-1" />

              {/* 文字・数字マーク */}
              <button
                onClick={() => { setToolMode('alpha'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all flex items-center gap-1 ${
                  toolMode === 'alpha' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="アルファベット順ラベル (A, B, C...)"
              >
                <Type className="w-4 h-4" />
                <span className="text-[10px] font-bold">A-Z</span>
              </button>
              <button
                onClick={() => { setToolMode('num'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all flex items-center gap-1 ${
                  toolMode === 'num' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="数字順ラベル (1, 2, 3...)"
              >
                <Hash className="w-4 h-4" />
                <span className="text-[10px] font-bold">1-9</span>
              </button>

              <div className="w-px h-5 bg-zinc-800 mx-1" />

              {/* 線・矢印 */}
              <button
                onClick={() => {
                  setDrawMode(drawMode === 'line' ? 'off' : 'line');
                  setToolMode('play');
                }}
                className={`p-2 rounded-lg border transition-all ${
                  drawMode === 'line' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="フリーハンド直線を描く"
              >
                <Pen className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setDrawMode(drawMode === 'arrow' ? 'off' : 'arrow');
                  setToolMode('play');
                }}
                className={`p-2 rounded-lg border transition-all ${
                  drawMode === 'arrow' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="矢印を描く"
              >
                <ArrowRightIcon className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-zinc-800 mx-1" />

              {/* 消去 */}
              <button
                onClick={() => { setToolMode('eraser'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'eraser' ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="クリックしたマークを消去"
              >
                <Eraser className="w-4 h-4" />
              </button>
              {(drawings.length > 0 || (currentNode.markers && currentNode.markers.length > 0)) && (
                <button
                  onClick={clearAnnotations}
                  className="p-2 rounded-lg border border-red-500/30 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all ml-1.5"
                  title="すべてのマークと描画を消去"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 自動再生コントロール */}
        {isTeacher && (
          <div className="flex justify-center items-center gap-2">
            <button
              onClick={autoReplay.toggle}
              className={`p-2 glass-panel hover:bg-white/10 ${autoReplay.isPlaying ? 'bg-amber-500/20 text-amber-400' : ''}`}
              title={autoReplay.isPlaying ? '停止' : '自動再生'}
            >
              {autoReplay.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <div className="flex gap-1">
              {REPLAY_SPEEDS.map(s => (
                <button
                  key={s.value}
                  onClick={() => autoReplay.setSpeed(s.value)}
                  className={`px-2 py-1 text-xs rounded ${
                    autoReplay.speed === s.value
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-white/5 text-zinc-500 hover:bg-white/10'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* コメント表示 */}
        {currentNode.comment && (
          <div className="glass-panel px-4 py-3">
            <div className="flex items-start gap-2 text-sm">
              <MessageSquare className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
              <div className="text-zinc-300 whitespace-pre-wrap">{currentNode.comment}</div>
            </div>
          </div>
        )}

        {/* 変化選択 */}
        {isTeacher && currentNode.children.length > 1 && (
          <div className="flex justify-center gap-2 overflow-x-auto p-2">
            {currentNode.children.map((child, idx) => (
              <button
                key={idx}
                onClick={() => goForwardBranch(idx)}
                className="px-3 py-1 bg-white/5 border border-white/10 rounded text-sm hover:bg-amber-500/20"
              >
                変化{idx + 1} ({child.move ? (child.move.color === 'BLACK' ? '黒' : '白') : '?'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* サイドバー（先生のみ） */}
      {!isMaximized && isTeacher && (
        <div className="w-full lg:w-64 space-y-4 lg:overflow-y-auto lg:min-h-0 flex-shrink-0">
          {/* AI分析パネル */}
          <AiAnalysisPanel
            result={aiAnalysis.result}
            isLoading={aiAnalysis.isLoading}
            error={aiAnalysis.error}
            settings={aiAnalysis.settings}
            onUpdateSettings={aiAnalysis.updateSettings}
            boardSize={boardSize}
            onHighlightMove={handleHighlightMove}
          />

          {/* 勝率グラフ */}
          {aiAnalysis.settings.enabled && winRateData.length > 0 && (
            <WinRateGraph
              data={winRateData}
              currentMove={currentMoveNumber}
            />
          )}
        </div>
      )}
      {!isMaximized && isTeacher && studentParticipants.length > 0 && (
        <div className="w-full lg:w-64 space-y-4 lg:overflow-y-auto lg:min-h-0 flex-shrink-0">
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold text-sm">配信先の生徒</h3>
            <button
              onClick={selectAllStudents}
              className={`w-full text-sm py-1 rounded-lg transition-all ${
                targetStudents?.length === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              全員に配信
            </button>
            <div className="space-y-1">
              {studentParticipants.map(s => {
                const isSelected = !targetStudents || targetStudents.length === 0 || targetStudents.includes(s.identity);
                return (
                  <button
                    key={s.identity}
                    onClick={() => toggleStudent(s.identity)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all ${
                      isSelected ? 'bg-amber-500/10 text-amber-300' : 'bg-white/5 text-zinc-500'
                    }`}
                  >
                    {s.name || getDisplayName(s.identity, registeredStudents ?? [])}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* チャット（先生・生徒共通） */}
      {!isMaximized && chatMessages && onChatSend && (
        <div className="w-full lg:w-64 lg:overflow-y-auto lg:min-h-0 flex-shrink-0">
          <div className="glass-panel p-0 overflow-hidden" style={{ height: 320 }}>
            <ChatPanel
              messages={chatMessages}
              participants={participants ?? []}
              students={registeredStudents ?? []}
              localIdentity={localIdentity ?? ''}
              onSend={onChatSend}
              showTargetSelector={isTeacher}
            />
          </div>
        </div>
      )}
    </div>
  );
}
