import { useState, useCallback, useRef, useMemo } from 'react';
import GoBoard from './GoBoard';
import type { Drawing, Marker, StoneColor } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import type { ClassroomLiveKit, ParticipantInfo } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import { createNode, addMove, getMainPath } from '../utils/treeUtilsV2';
import { checkCapture, createEmptyBoard } from '../utils/gameLogic';
import { parseSGFTree } from '../utils/sgfUtils';
import type { SgfMetadata } from '../utils/sgfUtils';
import { convertSgfToGameTree } from '../utils/treeUtilsV2';
import { getDisplayName } from '../utils/identityUtils';
import MoveCounter from './MoveCounter';
import ChatPanel from './teacher/ChatPanel';
import {
  ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  GitBranch, Grid3X3, Pen, ArrowRight as ArrowRightIcon, Trash2, Upload, MessageSquare,
  Circle, Triangle, Square, X, Type, Hash, Eraser
} from 'lucide-react';

interface LectureBoardProps {
  isTeacher: boolean;
  classroomRef: React.RefObject<ClassroomLiveKit | null>;
  userName: string;
  onBack?: () => void;
  // 生徒がreview/lectureで受け取る同期データ
  syncedNode?: GameNode;
  syncedBoardSize?: number;
  teacherCursor?: { x: number; y: number } | null;
  syncedDrawings?: Drawing[];
  // 参加者情報（先生用サイドバー）
  participants?: ParticipantInfo[];
  students?: Student[];
  localIdentity?: string;
  // チャット
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

const BOARD_SIZES = [19, 17, 15, 13, 11, 9] as const;

export default function LectureBoard({
  isTeacher,
  classroomRef,
  onBack,
  syncedNode,
  syncedBoardSize,
  teacherCursor,
  syncedDrawings,
  participants = [],
  students = [],
  localIdentity = '',
  chatMessages,
  onChatSend,
}: LectureBoardProps) {
  // 先生用状態
  const [boardSize, setBoardSize] = useState(syncedBoardSize || 19);
  const [rootNode, setRootNode] = useState<GameNode>(() =>
    syncedNode || createNode(null, createEmptyBoard(19), 1, 'BLACK', 19)
  );
  const [currentNode, setCurrentNode] = useState<GameNode>(syncedNode || rootNode);
  const [sgfMetadata, setSgfMetadata] = useState<SgfMetadata | undefined>();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toolMode, setToolMode] = useState<'play' | 'circle' | 'triangle' | 'square' | 'cross' | 'alpha' | 'num' | 'eraser'>('play');

  // 生徒モード: 同期データを使う
  const effectiveNode = isTeacher ? currentNode : (syncedNode || currentNode);
  const effectiveBoardSize = isTeacher ? boardSize : (syncedBoardSize || boardSize);
  const effectiveDrawings = isTeacher ? drawings : (syncedDrawings || []);

  const boardState = effectiveNode.board;
  const markers = effectiveNode.markers;

  const derivedNextColor: StoneColor = effectiveNode.move
    ? (effectiveNode.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
    : 'BLACK';

  const totalMoves = useMemo(() => {
    return isTeacher ? getMainPath(rootNode).length - 1 : 0;
  }, [rootNode, isTeacher]);

  const currentMoveNumber = effectiveNode.move ? effectiveNode.nextNumber - 1 : 0;

  // 碁盤同期
  const broadcastBoard = useCallback((node: GameNode, overrideBoardSize?: number) => {
    if (isTeacher && classroomRef.current?.isConnected) {
      const nextColor: StoneColor = node.move
        ? (node.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
        : 'BLACK';
      classroomRef.current.broadcast({
        type: 'BOARD_UPDATE',
        payload: {
          boardState: node.board,
          boardSize: overrideBoardSize ?? boardSize,
          nextColor,
          markers: node.markers,
          moveNumber: node.move ? node.nextNumber - 1 : 0,
        },
      });
    }
  }, [isTeacher, classroomRef, boardSize]);

  // ナビゲーション
  const goToRoot = () => { setCurrentNode(rootNode); broadcastBoard(rootNode); };
  const goBack = () => {
    if (currentNode.parent) { setCurrentNode(currentNode.parent); broadcastBoard(currentNode.parent); }
  };
  const goForward = () => {
    if (currentNode.children.length > 0) {
      setCurrentNode(currentNode.children[0]);
      broadcastBoard(currentNode.children[0]);
    }
  };
  const goForwardBranch = (index: number) => {
    if (currentNode.children[index]) {
      setCurrentNode(currentNode.children[index]);
      broadcastBoard(currentNode.children[index]);
    }
  };
  const goLast = () => {
    let curr = currentNode;
    while (curr.children.length > 0) curr = curr.children[0];
    setCurrentNode(curr);
    broadcastBoard(curr);
  };

  // キーボードナビゲーション
  // (useEffectはApp.tsxで管理するか、ここでも追加可能)

  // SGF読込
  const handleSgfLoad = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      const parsed = parseSGFTree(content);
      const newSize = parsed.size;
      const newRoot = convertSgfToGameTree(parsed.root, null, newSize, 1, parsed.board);
      setBoardSize(newSize);
      setSgfMetadata(parsed.metadata);
      setRootNode(newRoot);
      setCurrentNode(newRoot);
      broadcastBoard(newRoot);
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [broadcastBoard]);

  // 着手・アノテーション配置
  const handleCellClick = useCallback((x: number, y: number) => {
    if (!isTeacher) return;
    if (drawMode !== 'off') return;

    if (toolMode === 'play') {
      if (boardState[y - 1]?.[x - 1]) return;

      let newBoard = boardState.map(row => row.map(cell => cell ? { ...cell } : null));
      newBoard[y - 1][x - 1] = { color: derivedNextColor, number: currentNode.nextNumber };

      const { board: capturedBoard } = checkCapture(newBoard, x, y, derivedNextColor, boardSize);

      const realNewNode = addMove(
        currentNode, capturedBoard, currentNode.nextNumber + 1,
        derivedNextColor, boardSize,
        { x, y, color: derivedNextColor }
      );

      setCurrentNode(realNewNode);
      broadcastBoard(realNewNode);
    } else if (toolMode === 'eraser') {
      const updatedMarkers = (currentNode.markers || []).filter(m => m.x !== x || m.y !== y);
      const updatedNode = { ...currentNode, markers: updatedMarkers };
      setCurrentNode(updatedNode);
      broadcastBoard(updatedNode);
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
      const updatedNode = { ...currentNode, markers: updatedMarkers };
      setCurrentNode(updatedNode);
      broadcastBoard(updatedNode);
    }
  }, [boardState, derivedNextColor, isTeacher, boardSize, currentNode, drawMode, toolMode, broadcastBoard]);

  // 碁盤リセット
  const resetBoard = () => {
    const empty = createEmptyBoard(boardSize);
    const newRoot = createNode(null, empty, 1, 'WHITE', boardSize);
    setRootNode(newRoot);
    setCurrentNode(newRoot);
    setSgfMetadata(undefined);
    broadcastBoard(newRoot);
  };

  const changeBoardSize = (newSize: number) => {
    setBoardSize(newSize);
    const empty = createEmptyBoard(newSize);
    const newRoot = createNode(null, empty, 1, 'WHITE', newSize);
    setRootNode(newRoot);
    setCurrentNode(newRoot);
    setSgfMetadata(undefined);
    broadcastBoard(newRoot, newSize);
  };

  // 描画
  const handleDrawDragStart = useCallback((x: number, y: number) => {
    if (isTeacher && drawMode !== 'off') {
      setDrawStart({ x, y });
      drawLastCell.current = { x, y };
    }
  }, [isTeacher, drawMode]);

  const handleDrawDragMove = useCallback((x: number, y: number) => {
    if (isTeacher && drawMode !== 'off') drawLastCell.current = { x, y };
  }, [isTeacher, drawMode]);

  const handleDrawDragEnd = useCallback(() => {
    if (isTeacher && drawMode !== 'off' && drawStart && drawLastCell.current) {
      const end = drawLastCell.current;
      if (drawStart.x !== end.x || drawStart.y !== end.y) {
        const newDrawing: Drawing = {
          fromX: drawStart.x, fromY: drawStart.y,
          toX: end.x, toY: end.y, type: drawMode,
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
      const updatedNode = { ...currentNode, markers: [] };
      setCurrentNode(updatedNode);
      broadcastBoard(updatedNode);
    }
  }, [currentNode, classroomRef, broadcastBoard]);

  // カーソル
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

  // カーソルマーカー（生徒用）
  const cursorMarkers: Marker[] = useMemo(() => {
    const base = markers || [];
    if (!teacherCursor || isTeacher) return base;
    return [...base, { x: teacherCursor.x, y: teacherCursor.y, type: 'SYMBOL' as const, value: 'CIR' }];
  }, [markers, teacherCursor, isTeacher]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full lg:h-full lg:min-h-0">
      <div className="flex-1 space-y-4 lg:min-h-0 lg:flex lg:flex-col lg:overflow-y-auto">
        {/* ヘッダー */}
        <div className="glass-panel px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm">
                &larr; ロビーに戻る
              </button>
            )}
            <span className="font-bold">授業モード</span>
          </div>
          <MoveCounter currentMove={currentMoveNumber} totalMoves={totalMoves} />
        </div>

        {/* 碁盤 */}
        <div className="glass-panel p-4 flex justify-center items-center shadow-2xl relative lg:flex-1 lg:min-h-0">
          {isTeacher && currentNode.children.length > 1 && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-blue-500/20 px-3 py-1 rounded-full text-blue-300 text-sm">
              <GitBranch className="w-4 h-4" />
              <span>{currentNode.children.length}変化</span>
            </div>
          )}
          <GoBoard
            boardState={boardState}
            boardSize={effectiveBoardSize}
            onCellClick={isTeacher ? handleCellClick : undefined}
            markers={cursorMarkers}
            drawings={effectiveDrawings}
            readOnly={!isTeacher}
            onCellMouseEnter={isTeacher ? handleCellMouseEnter : undefined}
            onCellMouseLeave={isTeacher ? handleCellMouseLeave : undefined}
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
              <button key={idx} onClick={() => goForwardBranch(idx)}
                className="px-3 py-1 bg-white/5 border border-white/10 rounded text-sm hover:bg-blue-500/20">
                変化{idx + 1} ({child.move ? (child.move.color === 'BLACK' ? '黒' : '白') : '?'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* サイドバー（先生は全パネル、生徒はチャットのみ） */}
      {(isTeacher || (chatMessages && onChatSend)) && (
        <div className="w-full lg:w-80 space-y-4 lg:overflow-y-auto lg:min-h-0">
          {isTeacher && (
            <>
          {/* SGF読込 */}
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold border-b border-white/5 pb-2">SGFライブラリ</h3>
            <input ref={fileInputRef} type="file" accept=".sgf" onChange={handleSgfLoad} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="secondary-button w-full flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="w-4 h-4" /> SGFファイルを読込
            </button>
            {sgfMetadata && (
              <div className="text-sm bg-white/5 p-3 rounded-xl space-y-1">
                {sgfMetadata.gameName && <div className="font-bold">{sgfMetadata.gameName}</div>}
                {sgfMetadata.blackName && <div>黒: {sgfMetadata.blackName}</div>}
                {sgfMetadata.whiteName && <div>白: {sgfMetadata.whiteName}</div>}
                {sgfMetadata.result && <div className="text-zinc-400">結果: {sgfMetadata.result}</div>}
              </div>
            )}
          </div>

          {/* 碁盤設定 */}
          <div className="glass-panel p-4 space-y-4">
            <h3 className="font-bold border-b border-white/5 pb-2">碁盤設定</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <Grid3X3 className="w-4 h-4" />
                <span>碁盤サイズ</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {BOARD_SIZES.map((size) => (
                  <button key={size} onClick={() => changeBoardSize(size)}
                    className={`px-2 py-1 rounded-lg text-sm font-medium transition-all ${
                      boardSize === size ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10'
                    }`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-400">次の手番</span>
              <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl">
                <div className={`w-3 h-3 rounded-full border border-white/20 ${derivedNextColor === 'BLACK' ? 'bg-black' : 'bg-white'}`} />
                <span className="font-bold text-sm">{derivedNextColor === 'BLACK' ? '黒' : '白'}</span>
              </div>
            </div>

            <button onClick={resetBoard} className="secondary-button w-full text-sm border-red-500/20 hover:bg-red-500/10 hover:text-red-400">
              碁盤をリセット
            </button>
          </div>

          {/* 参加生徒リスト */}
          {participants.length > 0 && (
            <div className="glass-panel p-4 space-y-3">
              <h3 className="font-bold border-b border-white/5 pb-2">
                参加生徒 ({participants.filter(p => p.identity !== localIdentity).length})
              </h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {participants
                  .filter(p => p.identity !== localIdentity)
                  .map(p => {
                    const name = getDisplayName(p.identity, students);
                    return (
                      <div
                        key={p.identity}
                        className="flex items-center justify-between px-2 py-1.5 rounded bg-white/5 text-sm"
                      >
                        <span className="truncate">{name}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
            </>
          )}

          {/* チャット（先生・生徒共通） */}
          {chatMessages && onChatSend && (
            <div className="glass-panel p-0 overflow-hidden" style={{ height: 320 }}>
              <ChatPanel
                messages={chatMessages}
                participants={participants}
                students={students}
                localIdentity={localIdentity}
                onSend={onChatSend}
                showTargetSelector={isTeacher}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
