import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import GoBoard from './GoBoard';
import type { Drawing, Marker, StoneColor } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import { getMainPath, addMove } from '../utils/treeUtilsV2';
import type { ParticipantInfo, ClassroomLiveKit } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, GitBranch, Pen, ArrowRight as ArrowRightIcon, Trash2, Play, Pause, MessageSquare, Circle, Triangle, Square, X, Type, Hash, Eraser } from 'lucide-react';
import { checkCapture } from '../utils/gameLogic';
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
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);
  const [toolMode, setToolMode] = useState<'play' | 'circle' | 'triangle' | 'square' | 'cross' | 'alpha' | 'num' | 'eraser'>('play');

  const boardState = currentNode.board;
  const nodeMarkers = currentNode.markers;

  // AI候補手のハイライト座標（1-indexed）。盤面移動時に自動クリア
  const [aiHighlight, setAiHighlight] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { setAiHighlight(null); }, [currentNode]);

  const markers = useMemo<Marker[] | undefined>(() => {
    if (!aiHighlight) return nodeMarkers;
    const overlay: Marker = { x: aiHighlight.x, y: aiHighlight.y, type: 'SYMBOL', value: 'SQR' };
    return nodeMarkers ? [...nodeMarkers, overlay] : [overlay];
  }, [nodeMarkers, aiHighlight]);

  const handleHighlightMove = useCallback((x: number, y: number) => {
    // 同じ手の再クリックでトグル解除（既存パターン: draw mode の re-toggle と同じ感覚）
    setAiHighlight(prev => (prev && prev.x === x && prev.y === y ? null : { x, y }));
  }, []);

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
      <div className="flex-1 space-y-4 lg:min-h-0 lg:flex lg:flex-col lg:overflow-y-auto">
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
        <div className="glass-panel p-4 flex justify-center items-center shadow-2xl lg:flex-1 lg:min-h-0">
          <GoBoard
            boardState={boardState}
            boardSize={boardSize}
            markers={markers}
            drawings={drawings}
            readOnly={!isTeacher}
            onCellClick={isTeacher ? handleCellClick : undefined}
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
            </div>

            {/* アノテーション & 描画ツールバー */}
            <div className="flex flex-wrap justify-center items-center gap-1.5 p-2 bg-zinc-900/60 border border-zinc-800 rounded-xl max-w-full">
              {/* 着手モード */}
              <button
                onClick={() => { setToolMode('play'); setDrawMode('off'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  toolMode === 'play' && drawMode === 'off'
                    ? 'bg-blue-600 border-blue-500 text-white'
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
                  toolMode === 'circle' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="丸印 (CIR)"
              >
                <Circle className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('triangle'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'triangle' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="三角印 (TRI)"
              >
                <Triangle className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('square'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'square' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="四角印 (SQR)"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('cross'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'cross' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
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
                  toolMode === 'alpha' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
                }`}
                title="アルファベット順ラベル (A, B, C...)"
              >
                <Type className="w-4 h-4" />
                <span className="text-[10px] font-bold">A-Z</span>
              </button>
              <button
                onClick={() => { setToolMode('num'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all flex items-center gap-1 ${
                  toolMode === 'num' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
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
              className={`p-2 glass-panel hover:bg-white/10 ${autoReplay.isPlaying ? 'bg-blue-500/20 text-blue-400' : ''}`}
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
                      ? 'bg-blue-500/20 text-blue-400'
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
                className="px-3 py-1 bg-white/5 border border-white/10 rounded text-sm hover:bg-blue-500/20"
              >
                変化{idx + 1} ({child.move ? (child.move.color === 'BLACK' ? '黒' : '白') : '?'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* サイドバー（先生のみ） */}
      {isTeacher && (
        <div className="w-full lg:w-64 space-y-4 lg:overflow-y-auto lg:min-h-0">
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
      {isTeacher && studentParticipants.length > 0 && (
        <div className="w-full lg:w-64 space-y-4 lg:overflow-y-auto lg:min-h-0">
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
              {studentParticipants.map(s => {
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

      {/* チャット（先生・生徒共通） */}
      {chatMessages && onChatSend && (
        <div className="w-full lg:w-64 lg:overflow-y-auto lg:min-h-0">
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
