import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import GoBoard from './GoBoard';
import type { AnalysisOverlay, Drawing, Marker, PvStone, StoneColor } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import { getMainPath, addMove, removeNode } from '../utils/treeUtilsV2';
import { findNearestDrawingIndex } from '../utils/drawingUtils';
import type { ParticipantInfo, ClassroomLiveKit } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import type { AiAnalysisResult, AiAnalysisSyncPayload, AiSettings } from '../types/ai';
import { fromGtpCoord } from '../utils/katagoClient';
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

  // 生徒用: 先生端末からLiveKitで届いたAI解析
  syncedAiAnalysis?: AiAnalysisSyncPayload;
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
  syncedAiAnalysis,
}: ReviewBoardProps) {
  // PCは最初から碁盤と情報パネルを半々、スマホは碁盤優先で開始する。
  const [isMaximized, setIsMaximized] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 1023px)').matches
      : false
  ));
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);
  const [toolMode, setToolMode] = useState<'play' | 'circle' | 'triangle' | 'square' | 'cross' | 'alpha' | 'num' | 'eraser'>('play');
  const [hoveredCandidate, setHoveredCandidate] = useState<{ nodeId: string; rank: number } | null>(null);

  const boardState = currentNode.board;
  const nodeMarkers = currentNode.markers;

  // AI候補手のハイライト座標（1-indexed）。対象nodeが変わったら表示しない
  const [aiHighlight, setAiHighlight] = useState<{ nodeId: string; x: number; y: number } | null>(null);

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

  // 直近の一手を取り消す（誤クリックで作った分岐をツリーから除去する）。
  // 読み込んだ棋譜の手は削除されず「一手戻る」だけになる（元手順を守る）。
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
    active: isTeacher, // KataGoへの接続は先生端末だけ。生徒は同期結果を表示する。
  });
  const updateAiSettings = aiAnalysis.updateSettings;

  const displayedAi = isTeacher
    ? {
        enabled: aiAnalysis.settings.enabled,
        result: aiAnalysis.result,
        isLoading: aiAnalysis.isLoading,
        error: aiAnalysis.error,
      }
    : {
        enabled: syncedAiAnalysis?.enabled ?? false,
        result: syncedAiAnalysis?.result ?? null,
        isLoading: syncedAiAnalysis?.isLoading ?? false,
        error: syncedAiAnalysis?.error ?? null,
      };

  const localHoveredCandidateIndex = hoveredCandidate?.nodeId === currentNode.id
    ? hoveredCandidate.rank
    : null;
  const allowStudentInteraction = !isTeacher && syncedAiAnalysis?.allowStudentInteraction === true;
  const hoveredCandidateIndex = displayedAi.enabled
    ? (isTeacher
        ? localHoveredCandidateIndex
        // 講師が手順を示している間は常に講師操作を優先する。
        : (syncedAiAnalysis?.hoveredCandidateRank ?? (allowStudentInteraction ? localHoveredCandidateIndex : null)))
    : null;

  const handleCandidateHover = useCallback((rank: number | null) => {
    setHoveredCandidate(rank === null ? null : { nodeId: currentNode.id, rank });
  }, [currentNode.id]);

  const markers = useMemo<Marker[] | undefined>(() => {
    if (!displayedAi.enabled || !aiHighlight || aiHighlight.nodeId !== currentNode.id) return nodeMarkers;
    const overlay: Marker = { x: aiHighlight.x, y: aiHighlight.y, type: 'SYMBOL', value: 'SQR' };
    return nodeMarkers ? [...nodeMarkers, overlay] : [overlay];
  }, [displayedAi.enabled, nodeMarkers, aiHighlight, currentNode.id]);

  const handleHighlightMove = useCallback((x: number, y: number) => {
    setAiHighlight(prev => (
      prev && prev.nodeId === currentNode.id && prev.x === x && prev.y === y
        ? null
        : { nodeId: currentNode.id, x, y }
    ));
  }, [currentNode.id]);

  // 別の棋譜を読み込んで検討を始め直したら、AIは必ずオフから始める。
  // （前の検討でONのままだと、開いた瞬間に新しい局面の解析がKataGoへ飛ぶ）
  const updateAiSettingsRef = useRef(updateAiSettings);
  updateAiSettingsRef.current = updateAiSettings;
  useEffect(() => {
    updateAiSettingsRef.current({ enabled: false });
    setHoveredCandidate(null);
    setAiHighlight(null);
    // rootNode（＝読み込んだ棋譜）が変わった時だけ走らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootNode.id]);

  const handleUpdateAiSettings = useCallback((newSettings: Partial<AiSettings>) => {
    if (newSettings.enabled === false) {
      setHoveredCandidate(null);
      setAiHighlight(null);
    }
    updateAiSettings(newSettings);
  }, [updateAiSettings]);

  // LiveKitのデータパケットを大きくしすぎないよう、授業表示に必要な上位5手と
  // 各PVの先頭40手だけを共有する（ownership 361点は送らない）。
  const sharedAiResult = useMemo<AiAnalysisResult | null>(() => {
    if (!aiAnalysis.settings.enabled || !aiAnalysis.result) return null;
    return {
      winrate: aiAnalysis.result.winrate,
      scoreLead: aiAnalysis.result.scoreLead,
      analysisTime: aiAnalysis.result.analysisTime,
      topMoves: aiAnalysis.result.topMoves.slice(0, 5).map(move => ({
        ...move,
        pv: move.pv.slice(0, 40),
      })),
    };
  }, [aiAnalysis.settings.enabled, aiAnalysis.result]);

  const participantCount = participants?.length ?? 0;
  useEffect(() => {
    if (!isTeacher) return;
    const payload: AiAnalysisSyncPayload = {
      enabled: aiAnalysis.settings.enabled,
      nodeId: aiAnalysis.settings.enabled ? currentNode.id : null,
      result: sharedAiResult,
      isLoading: aiAnalysis.settings.enabled && aiAnalysis.isLoading,
      error: aiAnalysis.settings.enabled ? aiAnalysis.error : null,
      hoveredCandidateRank: aiAnalysis.settings.enabled ? hoveredCandidateIndex : null,
      allowStudentInteraction: aiAnalysis.settings.allowStudentInteraction,
    };
    classroomRef.current?.broadcast({ type: 'AI_ANALYSIS_UPDATE', payload });
  }, [
    isTeacher,
    currentNode.id,
    aiAnalysis.settings.enabled,
    aiAnalysis.isLoading,
    aiAnalysis.error,
    aiAnalysis.settings.allowStudentInteraction,
    hoveredCandidateIndex,
    sharedAiResult,
    classroomRef,
    participantCount, // 途中参加した生徒にも現在の結果を再送する
  ]);

  const analysisOverlay = useMemo<AnalysisOverlay[]>(() => {
    if (!displayedAi.enabled || !displayedAi.result) return [];
    return displayedAi.result.topMoves.slice(0, 5).flatMap((move, rank) => {
      const coord = fromGtpCoord(move.move, boardSize);
      return coord ? [{ ...coord, rank, winrate: move.winrate, scoreLead: move.scoreLead, visits: move.visits }] : [];
    });
  }, [displayedAi.enabled, displayedAi.result, boardSize]);

  const currentMoveColor = currentNode.move?.color;
  const pvOverlay = useMemo<PvStone[] | undefined>(() => {
    if (hoveredCandidateIndex === null || !displayedAi.enabled || !displayedAi.result) return undefined;
    const candidate = displayedAi.result.topMoves[hoveredCandidateIndex];
    if (!candidate?.pv?.length) return undefined;
    let color: 'B' | 'W' = currentMoveColor
      ? (currentMoveColor === 'BLACK' ? 'W' : 'B')
      : (currentNode.activeColor === 'BLACK' ? 'B' : 'W');
    const seen = new Set<string>();
    const stones: PvStone[] = [];
    candidate.pv.forEach((gtp, index) => {
      const coord = fromGtpCoord(gtp, boardSize);
      if (!coord) return;
      const key = `${coord.x},${coord.y}`;
      if (seen.has(key)) return;
      seen.add(key);
      stones.push({ ...coord, color, number: index + 1 });
      color = color === 'B' ? 'W' : 'B';
    });
    return stones.length > 0 ? stones : undefined;
  }, [hoveredCandidateIndex, displayedAi.enabled, displayedAi.result, currentMoveColor, currentNode.activeColor, boardSize]);

  // Build win rate graph data from main path
  const winRateData = useMemo(() => {
    if (!displayedAi.enabled) return [];
    const mainPath = getMainPath(rootNode);
    const data: { moveNumber: number; winrate: number }[] = [];
    for (const node of mainPath) {
      const moveNum = node.move ? node.nextNumber - 1 : 0;
      // We only have data for cached nodes
      // For now, just show a flat line at 50 if no data
      data.push({ moveNumber: moveNum, winrate: 50 });
    }
    // Override with actual result for current node
    if (displayedAi.result) {
      data.push({ moveNumber: currentMoveNumber, winrate: displayedAi.result.winrate });
    }
    return data;
  }, [displayedAi.enabled, displayedAi.result, rootNode, currentMoveNumber]);

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
    <div className="flex flex-col lg:flex-row gap-4 w-full lg:h-full lg:min-h-0" data-testid="review-workspace">
      <div className={`${isMaximized ? 'w-full' : 'w-full lg:flex-1 lg:basis-0'} space-y-2 sm:space-y-4 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden`} data-testid="review-board-column">
        {/* 検討/授業ヘッダー。
            狭い画面ではボタンの語を落として必ず1行に収める。2行に膨らむと、その分
            下の操作列が画面の外へ押し出される（390×667 実測 2026-08-04）。
            語の途中で折れる（「検討モ／ード」）のを防ぐため、ラベルは折り返さない。 */}
        <div className="glass-panel px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 sm:px-3 bg-raised hover:bg-line border border-line text-ink rounded-lg text-sm font-semibold whitespace-nowrap transition-colors duration-150"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">閉じてホーム</span>
                <span className="sm:hidden">閉じる</span>
              </button>
            )}
            <span className="font-bold text-sm sm:text-base sm:ml-2 whitespace-nowrap">検討モード</span>
            <span className="text-sm text-muted whitespace-nowrap">
              {currentMoveNumber}手目
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 bg-raised hover:bg-line border border-line text-ink hover:text-ink rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {/* 生徒側はAI欄が出ないので「チャットを表示」と正しく名乗る。
                  狭い画面ではアイコンだけにする（語を出すと1行に収まらない） */}
              <span className="hidden sm:inline">
                {isMaximized ? (isTeacher ? 'AI・チャットを表示' : 'チャットを表示') : '碁盤を広げる'}
              </span>
            </button>
            {isTeacher && currentNode.children.length > 1 && (
              <div className="flex items-center gap-1.5 text-accent-text text-sm whitespace-nowrap">
                <GitBranch className="w-4 h-4" />
                <span>{currentNode.children.length}変化</span>
              </div>
            )}
          </div>
        </div>

        {/* 碁盤: 高さは親(flex-1 min-h-0)の実際の余りに追従させる。
            固定の calc(100dvh - Nrem) だと、ナビ・ツール列のぶんだけ碁盤が大きくなり、
            PCでは下のボタン列に重なり、スマホでは画面からはみ出して見切れる
            （対局盤で同じ問題を解決済みの方式に揃えた 2026-08-01）。 */}
        <div className="glass-panel p-2 sm:p-4 flex justify-center items-center shadow-2xl overflow-hidden lg:flex-1 lg:min-h-0">
          <GoBoard
            boardState={boardState}
            boardSize={boardSize}
            className="w-full max-w-full lg:!w-auto lg:h-full"
            maxHeight="100%"
            markers={markers}
            drawings={drawings}
            analysisOverlay={analysisOverlay}
            pvOverlay={pvOverlay}
            hoveredCandidateIndex={hoveredCandidateIndex}
            onCandidateHover={isTeacher || allowStudentInteraction ? handleCandidateHover : undefined}
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
          <div className="flex flex-col gap-2 sm:gap-3 w-full items-center">
            {/* ステップ移動 */}
            <div className="flex justify-center gap-2">
              <button onClick={goToRoot} disabled={!currentNode.parent} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30">
                <ChevronFirst />
              </button>
              <button onClick={goBack} disabled={!currentNode.parent} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30">
                <ChevronLeft />
              </button>
              <button onClick={goForward} disabled={currentNode.children.length === 0} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30">
                <ChevronRight />
              </button>
              <button onClick={goLast} disabled={currentNode.children.length === 0} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30">
                <ChevronLast />
              </button>
              <div className="w-px h-8 bg-ink/8 mx-1 self-center" />
              <button
                onClick={handleUndo}
                disabled={!currentNode.parent}
                title={currentNode.fromRecord
                  ? '棋譜の手は消えません（一手戻ります）'
                  : '検討で置いた直近の一手を取り消す (Delete / Ctrl+Z)'}
                className="p-2.5 sm:p-3 glass-panel hover:bg-alert/10 hover:text-alert-text disabled:opacity-30"
              >
                <Undo2 />
              </button>
            </div>

            {/* アノテーション & 描画ツールバー */}
            <div className="flex flex-wrap justify-center items-center gap-1.5 p-2 bg-ground/60 border border-line rounded-xl max-w-full">
              {/* 着手モード */}
              <button
                onClick={() => { setToolMode('play'); setDrawMode('off'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  toolMode === 'play' && drawMode === 'off'
                    ? 'bg-accent border-accent text-accent-ink'
                    : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="通常の着手を行います (石を置く)"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-current inline-block" />
                着手
              </button>

              <div className="w-px h-5 bg-raised mx-1" />

              {/* 記号マーク */}
              <button
                onClick={() => { setToolMode('circle'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'circle' ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="丸印 (CIR)"
              >
                <Circle className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('triangle'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'triangle' ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="三角印 (TRI)"
              >
                <Triangle className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('square'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'square' ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="四角印 (SQR)"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setToolMode('cross'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'cross' ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="バツ印 (X)"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-raised mx-1" />

              {/* 文字・数字マーク */}
              <button
                onClick={() => { setToolMode('alpha'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all flex items-center gap-1 ${
                  toolMode === 'alpha' ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="アルファベット順ラベル (A, B, C...)"
              >
                <Type className="w-4 h-4" />
                <span className="text-[10px] font-bold">A-Z</span>
              </button>
              <button
                onClick={() => { setToolMode('num'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all flex items-center gap-1 ${
                  toolMode === 'num' ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="数字順ラベル (1, 2, 3...)"
              >
                <Hash className="w-4 h-4" />
                <span className="text-[10px] font-bold">1-9</span>
              </button>

              <div className="w-px h-5 bg-raised mx-1" />

              {/* 線・矢印 */}
              <button
                onClick={() => {
                  setDrawMode(drawMode === 'line' ? 'off' : 'line');
                  setToolMode('play');
                }}
                className={`p-2 rounded-lg border transition-all ${
                  drawMode === 'line' ? 'bg-alert/15 border-alert text-alert-text' : 'bg-raised border-line text-muted hover:text-ink'
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
                  drawMode === 'arrow' ? 'bg-alert/15 border-alert text-alert-text' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="矢印を描く"
              >
                <ArrowRightIcon className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-raised mx-1" />

              {/* 消去 */}
              <button
                onClick={() => { setToolMode('eraser'); setDrawMode('off'); }}
                className={`p-2 rounded-lg border transition-all ${
                  toolMode === 'eraser' ? 'bg-alert border-alert text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title="クリックしたマークを消去"
              >
                <Eraser className="w-4 h-4" />
              </button>
              {(drawings.length > 0 || (currentNode.markers && currentNode.markers.length > 0)) && (
                <button
                  onClick={clearAnnotations}
                  className="p-2 rounded-lg border border-alert/35 text-muted hover:text-alert-text hover:bg-alert/10 transition-all ml-1.5"
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
              className={`p-2 glass-panel hover:bg-ink/10 ${autoReplay.isPlaying ? 'bg-accent/15 text-accent-text' : ''}`}
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
                      ? 'bg-accent/15 text-accent-text'
                      : 'bg-ink/5 text-muted hover:bg-ink/10'
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
              <MessageSquare className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
              <div className="text-ink whitespace-pre-wrap">{currentNode.comment}</div>
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
                className="px-3 py-1 bg-ink/5 border border-line rounded text-sm hover:bg-accent/15"
              >
                変化{idx + 1} ({child.move ? (child.move.color === 'BLACK' ? '黒' : '白') : '?'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PCでは碁盤と1:1になる授業情報カラム。生徒にもAI結果を同じ大きさで表示する。 */}
      {!isMaximized && (
        <aside className="w-full lg:flex-1 lg:basis-0 space-y-4 lg:overflow-y-auto lg:min-h-0 pr-0 lg:pr-1" data-testid="review-info-column">
          {/* 生徒側はAIがオンで配信されている時だけAI欄を出す（オフの間は存在ごと隠す） */}
          {(isTeacher || displayedAi.enabled) && (
          <AiAnalysisPanel
            result={displayedAi.result}
            isLoading={displayedAi.isLoading}
            error={displayedAi.error}
            settings={{
              enabled: displayedAi.enabled,
              maxVisits: aiAnalysis.settings.maxVisits,
              allowStudentInteraction: isTeacher
                ? aiAnalysis.settings.allowStudentInteraction
                : allowStudentInteraction,
            }}
            onUpdateSettings={handleUpdateAiSettings}
            boardSize={boardSize}
            onHighlightMove={isTeacher || allowStudentInteraction ? handleHighlightMove : undefined}
            onCandidateHover={isTeacher || allowStudentInteraction ? handleCandidateHover : undefined}
            readOnly={!isTeacher}
            allowCandidateInteraction={allowStudentInteraction}
          />
          )}

          {displayedAi.enabled && winRateData.length > 0 && (
            <WinRateGraph data={winRateData} currentMove={currentMoveNumber} />
          )}

          <div className={`grid gap-4 ${isTeacher && studentParticipants.length > 0 && chatMessages && onChatSend ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
            {isTeacher && studentParticipants.length > 0 && (
              <div className="glass-panel p-4 space-y-3">
                <h3 className="font-bold text-sm">配信先の生徒</h3>
                <button
                  onClick={selectAllStudents}
                  className={`w-full text-sm py-1 rounded-lg transition-all ${
                    targetStudents?.length === 0 ? 'bg-accent/15 text-accent-text' : 'bg-ink/5 hover:bg-ink/10'
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
                          isSelected ? 'bg-accent/12 text-accent-text' : 'bg-ink/5 text-muted'
                        }`}
                      >
                        {s.name || getDisplayName(s.identity, registeredStudents ?? [])}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {chatMessages && onChatSend && (
              <div className="glass-panel p-0 overflow-hidden min-h-[320px]">
                <ChatPanel
                  messages={chatMessages}
                  participants={participants ?? []}
                  students={registeredStudents ?? []}
                  localIdentity={localIdentity ?? ''}
                  onSend={onChatSend}
                  showTargetSelector={isTeacher}
                />
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
