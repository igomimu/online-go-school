import { useState, useCallback, useRef, useMemo } from 'react';
import GoBoard from './GoBoard';
import type { Drawing, Marker, StoneColor } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import type { ClassroomLiveKit } from '../utils/classroomLiveKit';
import { createNode, addMove, getMainPath } from '../utils/treeUtilsV2';
import { checkCapture, createEmptyBoard } from '../utils/gameLogic';
import { parseSGFTree } from '../utils/sgfUtils';
import type { SgfMetadata } from '../utils/sgfUtils';
import { convertSgfToGameTree } from '../utils/treeUtilsV2';
import MoveCounter from './MoveCounter';
import {
  ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  GitBranch, Grid3X3, Pen, ArrowRight as ArrowRightIcon, Trash2, Upload,
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
}

const BOARD_SIZES = [19, 17, 15, 13, 11, 9] as const;

export default function LectureBoard({
  isTeacher,
  classroomRef,
  onBack,
  syncedNode,
  syncedBoardSize,
  teacherCursor,
  syncedDrawings,
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
  const broadcastBoard = useCallback((node: GameNode) => {
    if (isTeacher && classroomRef.current?.isConnected) {
      const nextColor: StoneColor = node.move
        ? (node.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
        : 'BLACK';
      classroomRef.current.broadcast({
        type: 'BOARD_UPDATE',
        payload: {
          boardState: node.board,
          boardSize,
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

  // 着手
  const handleCellClick = useCallback((x: number, y: number) => {
    if (!isTeacher) return;
    if (drawMode !== 'off') return;
    if (boardState[y - 1][x - 1]) return;

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
  }, [boardState, derivedNextColor, isTeacher, boardSize, currentNode, drawMode, broadcastBoard]);

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
    broadcastBoard(newRoot);
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

  const clearDrawings = useCallback(() => {
    setDrawings([]);
    classroomRef.current?.broadcast({ type: 'DRAW_CLEAR', payload: null });
  }, [classroomRef]);

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
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      <div className="flex-1 space-y-4">
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
        <div className="glass-panel p-4 flex justify-center shadow-2xl relative">
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
              <button key={idx} onClick={() => goForwardBranch(idx)}
                className="px-3 py-1 bg-white/5 border border-white/10 rounded text-sm hover:bg-blue-500/20">
                変化{idx + 1} ({child.move ? (child.move.color === 'BLACK' ? '黒' : '白') : '?'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* サイドバー（先生のみ） */}
      {isTeacher && (
        <div className="w-full lg:w-80 space-y-4">
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
        </div>
      )}
    </div>
  );
}
