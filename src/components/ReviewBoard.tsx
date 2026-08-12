import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import GoBoard from './GoBoard';
import type { AnalysisOverlay, Drawing, Marker, PvStone } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import { getMainPath, removeNode } from '../utils/treeUtilsV2';
import { playReviewMove } from '../utils/reviewMove';
import { isSharingTarget, toggleSharingTarget, type SharingTargets } from '../utils/sharingTargets';
import { findNearestDrawingIndex } from '../utils/drawingUtils';
import type { ParticipantInfo, ClassroomLiveKit, ClassroomMessage } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import type { AiAnalysisResult, AiAnalysisSyncPayload, AiSettings } from '../types/ai';
import { fromGtpCoord } from '../utils/katagoClient';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, GitBranch, Pen, ArrowRight as ArrowRightIcon, Trash2, Play, Pause, MessageSquare, Circle, Triangle, Square, X, Type, Hash, Eraser, Maximize2, Minimize2, Undo2, Eye, EyeOff } from 'lucide-react';
import { getDisplayName } from '../utils/identityUtils';
import { useAutoReplay, REPLAY_SPEEDS } from '../hooks/useAutoReplay';
import { useAiAnalysis } from '../hooks/useAiAnalysis';
import AiAnalysisPanel from './AiAnalysisPanel';
import WinRateGraph from './WinRateGraph';
import ChatPanel from './teacher/ChatPanel';
import { useHostWindow } from '../hooks/useHostWindow';

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
  /** 検討の参加者（null=全員 / 空配列=誰にも配信しない） */
  targetStudents?: SharingTargets;
  onSetTargetStudents?: (students: SharingTargets) => void;
  onBack?: () => void;

  // 着手権限（先生: 生徒ごとの許可 / 生徒: 自分が許可されているか）
  movePermissions?: string[];
  onToggleMovePermission?: (identity: string) => void;
  canPlay?: boolean;
  onStudentMove?: (x: number, y: number) => void;
  /**
   * 生徒が自分の棋譜履歴から開いた、自分だけの検討。
   * 先生の検討盤と同じ操作（並べ替え・着手・記号・描画・自動再生）ができる。
   * AI は付けない（三村さんの指示 2026-08-13）。盤は誰にも配信しない。
   */
  selfReview?: boolean;

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
  movePermissions,
  onToggleMovePermission,
  canPlay,
  onStudentMove,
  selfReview = false,
  registeredStudents,
  chatMessages,
  onChatSend,
  syncedAiAnalysis,
}: ReviewBoardProps) {
  // 別ウィンドウに描かれているときは、キー操作の宛先がそのウィンドウになる
  const hostWindow = useHostWindow();
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
  const [showCandidates, setShowCandidates] = useState(true);
  const [toolMode, setToolMode] = useState<'play' | 'circle' | 'triangle' | 'square' | 'cross' | 'alpha' | 'num' | 'eraser'>('play');
  const [hoveredCandidate, setHoveredCandidate] = useState<{ nodeId: string; rank: number } | null>(null);

  const boardState = currentNode.board;
  const nodeMarkers = currentNode.markers;

  // AI候補手のハイライト座標（1-indexed）。対象nodeが変わったら表示しない
  const [aiHighlight, setAiHighlight] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  // 検討の配信はすべてここを通す。「配信先の生徒」で選んでいれば、その生徒にだけ送る
  // （以前は broadcast を直に呼んでおり、選んでも全員へ届いていた 2026-08-04）。
  const sendToTargets = useCallback((message: ClassroomMessage) => {
    // 生徒が自分の棋譜を並べているだけのときは、盤を誰にも配信しない。
    // 操作は先生と同じでも、配信は先生の検討だけの役目。
    if (!isTeacher) return;
    void classroomRef.current?.sendToOrAll(message, targetStudents);
  }, [classroomRef, targetStudents, isTeacher]);

  // 盤を操作できるか。先生と、自分の棋譜を開いた生徒。
  const canEdit = isTeacher || selfReview;

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
    if (!canEdit) return;
    if (delta > 0) goForward();
    else if (delta < 0) goBack();
  }, [canEdit, goForward, goBack]);

  // 右クリックで、クリック位置に最も近い描画(線・矢印)を1つ消す（pokekata踏襲、石は対象外）
  const handleCellRightClick = useCallback((x: number, y: number) => {
    if (!canEdit || drawings.length === 0) return;
    const idx = findNearestDrawingIndex(drawings, x, y);
    if (idx < 0) return;
    const updated = drawings.filter((_, i) => i !== idx);
    setDrawings(updated);
    sendToTargets({ type: 'DRAW_UPDATE', payload: updated });
  }, [canEdit, drawings, sendToTargets]);

  // キーボードショートカット（pokekata踏襲）。チャット等の入力中は無効化する。
  useEffect(() => {
    if (!canEdit) return;
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
      // 候補手の表示切替はAIの機能なので先生だけ
      else if (isTeacher && !ctrl && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); setShowCandidates(prev => !prev); }
      else if (e.key === 'Escape') { setToolMode('play'); setDrawMode('off'); }
    };
    // 別ウィンドウに描かれているときは、そのウィンドウに張らないとキーが効かない
    hostWindow.addEventListener('keydown', handleKeyDown);
    return () => hostWindow.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, isTeacher, handleUndo, goBack, goForward, goToRoot, goLast, hostWindow]);

  // 描画ハンドラ
  const handleDrawDragStart = useCallback((x: number, y: number) => {
    if (canEdit && drawMode !== 'off') {
      setDrawStart({ x, y });
      drawLastCell.current = { x, y };
    }
  }, [canEdit, drawMode]);

  const handleDrawDragMove = useCallback((x: number, y: number) => {
    if (canEdit && drawMode !== 'off') {
      drawLastCell.current = { x, y };
    }
  }, [canEdit, drawMode]);

  const handleDrawDragEnd = useCallback(() => {
    if (canEdit && drawMode !== 'off' && drawStart && drawLastCell.current) {
      const end = drawLastCell.current;
      if (drawStart.x !== end.x || drawStart.y !== end.y) {
        const newDrawing: Drawing = {
          fromX: drawStart.x, fromY: drawStart.y,
          toX: end.x, toY: end.y,
          type: drawMode,
        };
        const updated = [...drawings, newDrawing];
        setDrawings(updated);
        sendToTargets({ type: 'DRAW_UPDATE', payload: updated });
      }
      setDrawStart(null);
      drawLastCell.current = null;
    }
  }, [canEdit, drawMode, drawStart, drawings, sendToTargets]);

  const clearAnnotations = useCallback(() => {
    setDrawings([]);
    sendToTargets({ type: 'DRAW_CLEAR', payload: null });
    if (currentNode.markers && currentNode.markers.length > 0) {
      onSetCurrentNode({ ...currentNode, markers: [] });
    }
  }, [currentNode, sendToTargets, onSetCurrentNode]);

  // Click handler for board (making moves or annotations)
  const handleCellClick = useCallback((x: number, y: number) => {
    if (!canEdit) return;
    if (drawMode !== 'off') return;

    if (toolMode === 'play') {
      const played = playReviewMove(currentNode, x, y, boardSize);
      if (played) onSetCurrentNode(played);
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
    canEdit,
    boardSize,
    currentNode,
    drawMode,
    toolMode,
    onSetCurrentNode,
  ]);

  // 許可された生徒の着手。自分の盤には置かず先生へ送り、先生の盤経由で返ってくるのを待つ
  // （打てるかどうかの判定は先生側が正本）。
  const handleStudentCellClick = useCallback((x: number, y: number) => {
    if (canEdit || !canPlay || !onStudentMove) return;
    if (boardState[y - 1]?.[x - 1]) return;
    onStudentMove(x, y);
  }, [canEdit, canPlay, onStudentMove, boardState]);

  // カーソル共有
  const handleCellMouseEnter = useCallback((x: number, y: number) => {
    if (isTeacher) {
      sendToTargets({ type: 'CURSOR_MOVE', payload: { x, y } });
    }
  }, [isTeacher, sendToTargets]);

  const handleCellMouseLeave = useCallback(() => {
    if (isTeacher) {
      sendToTargets({ type: 'CURSOR_CLEAR', payload: null });
    }
  }, [isTeacher, sendToTargets]);

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
  // AIは動かしたまま、盤の上の候補手だけ消せるようにする（Pocket KataGo と同じ F キー）。
  // 候補手を見せて説明する場面と、見せずに読ませる場面を切り替えるため。
  const candidatesOnBoard = isTeacher ? showCandidates : (syncedAiAnalysis?.showCandidates ?? true);
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
  // ref の書き換えはレンダー中に行わない。StrictMode の二重レンダーで
  // 書き込みが二度走る形になり、React の想定から外れる。
  const updateAiSettingsRef = useRef(updateAiSettings);
  useEffect(() => {
    updateAiSettingsRef.current = updateAiSettings;
  }, [updateAiSettings]);

  // 棋譜が変わったときの畳み込みは、effect ではなくレンダー中に行う
  // （effect 内の同期 setState は余分な再描画を呼ぶため error 扱い）。
  const [seenRootId, setSeenRootId] = useState(rootNode.id);
  if (seenRootId !== rootNode.id) {
    setSeenRootId(rootNode.id);
    setHoveredCandidate(null);
    setAiHighlight(null);
  }
  // AI を切るのは外側への副作用なので、こちらは effect のまま。
  useEffect(() => {
    updateAiSettingsRef.current({ enabled: false });
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
      showCandidates,
    };
    sendToTargets({ type: 'AI_ANALYSIS_UPDATE', payload });
  }, [
    isTeacher,
    currentNode.id,
    aiAnalysis.settings.enabled,
    aiAnalysis.isLoading,
    aiAnalysis.error,
    aiAnalysis.settings.allowStudentInteraction,
    hoveredCandidateIndex,
    showCandidates,
    sharedAiResult,
    sendToTargets,
    participantCount, // 途中参加した生徒にも現在の結果を再送する
  ]);

  const analysisOverlay = useMemo<AnalysisOverlay[]>(() => {
    if (!candidatesOnBoard || !displayedAi.enabled || !displayedAi.result) return [];
    return displayedAi.result.topMoves.slice(0, 5).flatMap((move, rank) => {
      const coord = fromGtpCoord(move.move, boardSize);
      return coord ? [{ ...coord, rank, winrate: move.winrate, scoreLead: move.scoreLead, visits: move.visits }] : [];
    });
  }, [candidatesOnBoard, displayedAi.enabled, displayedAi.result, boardSize]);

  const currentMoveColor = currentNode.move?.color;
  const pvOverlay = useMemo<PvStone[] | undefined>(() => {
    if (!candidatesOnBoard) return undefined;
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
  }, [candidatesOnBoard, hoveredCandidateIndex, displayedAi.enabled, displayedAi.result, currentMoveColor, currentNode.activeColor, boardSize]);

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

  // 参加者の選び方は教室ホームの「共有」列と同じ規則（utils/sharingTargets）
  const toggleStudent = (identity: string) => {
    if (targetStudents === undefined || !onSetTargetStudents) return;
    onSetTargetStudents(
      toggleSharingTarget(targetStudents, identity, studentParticipants.map(s => s.identity)),
    );
  };

  const selectAllStudents = () => {
    onSetTargetStudents?.(null);
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
            {!canEdit && canPlay && (
              <span className="truncate rounded-lg bg-accent/15 px-2 py-1 text-xs text-accent-text">
                打てます
              </span>
            )}
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
            {canEdit && currentNode.children.length > 1 && (
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
            readOnly={!canEdit && !canPlay}
            onCellClick={canEdit ? handleCellClick : (canPlay ? handleStudentCellClick : undefined)}
            onCellRightClick={canEdit ? handleCellRightClick : undefined}
            onBoardWheel={canEdit ? handleBoardWheel : undefined}
            onCellMouseEnter={handleCellMouseEnter}
            onCellMouseLeave={handleCellMouseLeave}
            onDragStart={drawMode !== 'off' ? handleDrawDragStart : undefined}
            onDragMove={drawMode !== 'off' ? handleDrawDragMove : undefined}
            onDragEnd={drawMode !== 'off' ? handleDrawDragEnd : undefined}
          />
        </div>

        {/* ナビゲーション */}
        {canEdit && (
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

              {/* 候補手はAIの機能なので、生徒の自分用検討には出さない（三村さんの指示 2026-08-13） */}
              {isTeacher && (
                <>
                  <div className="w-px h-5 bg-raised mx-1" />

                  {/* 盤上の候補手だけを消す（AIは動かしたまま）。Pocket KataGo と同じく F キーでも切り替わる。
                      候補手を見せて説明する場面と、見せずに読ませる場面を行き来するためのもの。 */}
                  <button
                    data-testid="toggle-candidates"
                    onClick={() => setShowCandidates(prev => !prev)}
                    aria-pressed={showCandidates}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold transition-all ${
                      showCandidates ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                    }`}
                    title={showCandidates ? 'AIの候補手を盤から消す (F)' : 'AIの候補手を盤に出す (F)'}
                  >
                    {showCandidates ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    候補手
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 自動再生コントロール */}
        {canEdit && (
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
        {canEdit && currentNode.children.length > 1 && (
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
                <h3 className="font-bold text-sm">検討の参加者</h3>
                <button
                  onClick={selectAllStudents}
                  className={`w-full text-sm py-1 rounded-lg transition-all ${
                    targetStudents === null ? 'bg-accent/15 text-accent-text' : 'bg-ink/5 hover:bg-ink/10'
                  }`}
                >
                  全員に配信
                </button>
                <div className="space-y-1">
                  {studentParticipants.map(s => {
                    const isSelected = isSharingTarget(targetStudents ?? null, s.identity);
                    const canStudentPlay = movePermissions?.includes(s.identity) ?? false;
                    return (
                      <div key={s.identity} className="flex items-center gap-1">
                        <button
                          onClick={() => toggleStudent(s.identity)}
                          className={`flex-1 min-w-0 text-left px-3 py-1.5 rounded-lg text-sm truncate transition-all ${
                            isSelected ? 'bg-accent/12 text-accent-text' : 'bg-ink/5 text-muted'
                          }`}
                        >
                          {s.name || getDisplayName(s.identity, registeredStudents ?? [])}
                        </button>
                        {onToggleMovePermission && (
                          <button
                            data-testid={`review-permission-${s.identity}`}
                            onClick={() => onToggleMovePermission(s.identity)}
                            title={canStudentPlay ? 'この生徒は盤に打てます（押すと戻す）' : '押すとこの生徒が盤に打てるようになります'}
                            aria-pressed={canStudentPlay}
                            className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${
                              canStudentPlay
                                ? 'bg-accent text-accent-ink font-bold'
                                : 'bg-ink/5 text-muted hover:bg-ink/10'
                            }`}
                          >
                            {canStudentPlay ? '打てる' : '打たせる'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {onToggleMovePermission && (
                  <p className="text-xs text-muted leading-relaxed">
                    「打たせる」を押した生徒は、この検討盤に打てます。打たれた手は先生の盤にも入ります。
                  </p>
                )}
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
