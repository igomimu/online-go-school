import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import GoBoard from './GoBoard';
import type { AnalysisOverlay, Drawing, Marker, NumberMode, PvStone } from './GoBoard';
import type { GameNode } from '../utils/treeUtilsV2';
import { getMainPath, removeNode, withBranchNumbers } from '../utils/treeUtilsV2';
import { generateSGFTree } from '../utils/sgfUtils';
import { copyBoardToClipboard, copySgfToClipboard, downloadBoardAsPNG, downloadSgf } from '../utils/boardExport';
import { playReviewMove } from '../utils/reviewMove';
import { isSharingTarget, toggleSharingTarget, type SharingTargets } from '../utils/sharingTargets';
import { findNearestDrawingIndex } from '../utils/drawingUtils';
import type { ParticipantInfo, ClassroomRtc, ClassroomMessage } from '../utils/classroomRtc';
import { useThrottledCursor } from '../hooks/useThrottledCursor';

/**
 * ホイールの回転を溜めてまとめる間隔。
 *
 * 短すぎるとまとめる意味がない（16ms では毎秒60回も画面を更新することになり、
 * 詰まりが解消しなかった 2026-08-26）。100ms なら1秒間に10回で、
 * その間の回転はすべて1回の移動にまとまる。早送りの速さは変わらない。
 */
const WHEEL_BATCH_MS = 100;
import type { Student } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import type { AiAnalysisResult, AiAnalysisSyncPayload, AiSettings } from '../types/ai';
import { fromGtpCoord } from '../utils/katagoClient';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, GitBranch, Pen, ArrowRight as ArrowRightIcon, Trash2, Play, Pause, MessageSquare, Circle, Triangle, Square, X, Type, Hash, Eraser, Maximize2, Minimize2, Undo2, Eye, EyeOff, Menu } from 'lucide-react';
import { getDisplayName } from '../utils/identityUtils';
import { useAutoReplay, REPLAY_SPEEDS } from '../hooks/useAutoReplay';
import { useAiAnalysis, toBlackWinrate } from '../hooks/useAiAnalysis';
import AiAnalysisPanel from './AiAnalysisPanel';
import WinRateGraph from './WinRateGraph';
import ChatPanel from './teacher/ChatPanel';
import { useHostWindow } from '../hooks/useHostWindow';

interface ReviewBoardProps {
  rootNode: GameNode;
  currentNode: GameNode;
  boardSize: number;
  komi?: number;
  onSetCurrentNode: (node: GameNode) => void;
  isTeacher: boolean;
  classroomRef: React.RefObject<ClassroomRtc | null>;

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

  /** 石の手番号の見せ方。先生が切り替え、生徒の盤にも同じ値が配られる */
  numberMode?: NumberMode;
  onNumberModeChange?: (mode: NumberMode) => void;
  /** 「分」で 1 から数え直す起点の手（L キー / 「ここから」ボタンで決める） */
  branchStartId?: string | null;
  onToggleBranchStart?: (nodeId: string) => void;

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
  komi = 6.5,
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
  numberMode = 'off',
  onNumberModeChange,
  branchStartId = null,
  onToggleBranchStart,
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
  // 石に出す手番号。Pocket KataGo と同じく off→全→分 の循環（M キー）
  const cycleNumberMode = useCallback(() => {
    onNumberModeChange?.(numberMode === 'off' ? 'all' : numberMode === 'all' ? 'branch' : 'off');
  }, [numberMode, onNumberModeChange]);

  // 今いる手を「1」にする（もう一度で解除）。Pocket KataGo の L キーと同じ
  const toggleBranchStart = useCallback(() => {
    if (!currentNode.parent) return; // 0手目は起点にできない
    onToggleBranchStart?.(currentNode.id);
  }, [currentNode, onToggleBranchStart]);
  const branchStartIsHere = branchStartId !== null && branchStartId === currentNode.id;

  // 盤の書き出し（画像・SGF）。操作は Pocket KataGo に合わせる
  const boardSvgRef = useRef<SVGSVGElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // 「コピーしました」を数秒だけ出す。押しても何も起きないように見えるのを防ぐ
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const exportMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashExportMsg = useCallback((text: string) => {
    setExportMsg(text);
    if (exportMsgTimer.current) clearTimeout(exportMsgTimer.current);
    exportMsgTimer.current = setTimeout(() => setExportMsg(null), 2500);
  }, []);
  useEffect(() => () => { if (exportMsgTimer.current) clearTimeout(exportMsgTimer.current); }, []);
  const [toolMode, setToolMode] = useState<'play' | 'circle' | 'triangle' | 'square' | 'cross' | 'alpha' | 'num' | 'eraser'>('play');
  const [hoveredCandidate, setHoveredCandidate] = useState<{ nodeId: string; rank: number } | null>(null);

  const boardState = useMemo(
    // 生徒の同期盤は親を持たないので、先生が振った番号入りの盤をそのまま使う
    () => (numberMode === 'branch' && currentNode.parent ? withBranchNumbers(currentNode, branchStartId) : currentNode.board),
    [currentNode, numberMode, branchStartId]
  );
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

  /**
   * いま見ている手順の全体。ここまで来た道（ルート→現在）と、
   * この先の続き（主分岐）をつないだもの。
   * 分岐に入っていても「今いる筋」がそのまま並ぶので、ゲージがずれない。
   */
  const timeline = useMemo(() => {
    const behind: GameNode[] = [];
    let back: GameNode | null = currentNode;
    while (back) { behind.unshift(back); back = back.parent; }
    const ahead: GameNode[] = [];
    let fwd = currentNode;
    while (fwd.children.length > 0) { fwd = fwd.children[0]; ahead.push(fwd); }
    return { nodes: [...behind, ...ahead], index: behind.length - 1 };
  }, [currentNode]);

  /** ゲージや早送りで、手順の好きなところへ飛ぶ */
  const goToIndex = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(timeline.nodes.length - 1, index));
    const target = timeline.nodes[clamped];
    if (target) onSetCurrentNode(target);
  }, [timeline, onSetCurrentNode]);

  const jumpBy = useCallback((delta: number) => {
    goToIndex(timeline.index + delta);
  }, [goToIndex, timeline.index]);

  // 直近の一手を取り消す（誤クリックで作った分岐をツリーから除去する）。
  // 読み込んだ棋譜の手は削除されず「一手戻る」だけになる（元手順を守る）。
  const handleUndo = useCallback(() => {
    const parent = removeNode(currentNode);
    if (parent) onSetCurrentNode(parent);
  }, [currentNode, onSetCurrentNode]);

  /**
   * マウスホイールで手順送り/戻り（pokekata踏襲）。
   *
   * 🔴 ホイールは一度回すと大量のイベントが飛ぶ。1件ごとに一手進めると
   * 画面の更新が積み上がって処理が詰まり、生徒への配信がそこで止まる
   * （2026-08-26 実授業。20手前後で止まり、以降なにも届かない。
   *  同じ経路のシークバーは1回で目的地へ飛ぶので最後まで届いていた）。
   *
   * 溜めておいて、ごく短い間隔で1回だけまとめて動かす。
   * 進む速さは変わらないまま、更新の回数だけが減る。
   *
   * 🔴 requestAnimationFrame は使えない。検討を別ウィンドウで開いていると
   * 描画は背後の本体ウィンドウで動いており、ブラウザは非表示ウィンドウの
   * 描画コマを止めるので、溜めた分が永久に実行されない
   * （2026-08-26。ホイールがまったく効かなくなった）。
   */
  const wheelDebt = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (wheelTimer.current !== null) clearTimeout(wheelTimer.current);
  }, []);

  const handleBoardWheel = useCallback((delta: number) => {
    if (!canEdit || delta === 0) return;
    wheelDebt.current += delta > 0 ? 1 : -1;
    if (wheelTimer.current !== null) return;
    wheelTimer.current = setTimeout(() => {
      wheelTimer.current = null;
      const steps = wheelDebt.current;
      wheelDebt.current = 0;
      if (steps !== 0) jumpBy(steps);
    }, WHEEL_BATCH_MS);
  }, [canEdit, jumpBy]);

  // 右クリックで、クリック位置に最も近い描画(線・矢印)を1つ消す（pokekata踏襲、石は対象外）
  const handleCellRightClick = useCallback((x: number, y: number) => {
    if (!canEdit || drawings.length === 0) return;
    const idx = findNearestDrawingIndex(drawings, x, y);
    if (idx < 0) return;
    const updated = drawings.filter((_, i) => i !== idx);
    setDrawings(updated);
    sendToTargets({ type: 'DRAW_UPDATE', payload: updated });
  }, [canEdit, drawings, sendToTargets]);

  // 検討中の局面を SGF にする。分岐（変化手順）も含めて丸ごと書き出す
  const buildSgf = useCallback(() => generateSGFTree(rootNode, boardSize, { komi: String(komi) }), [rootNode, boardSize, komi]);

  const handleCopySgf = useCallback(async () => {
    const ok = await copySgfToClipboard(buildSgf(), hostWindow);
    flashExportMsg(ok ? 'SGFをコピーしました' : 'コピーできませんでした');
  }, [buildSgf, flashExportMsg, hostWindow]);

  const handleSaveSgf = useCallback(() => {
    downloadSgf(buildSgf(), hostWindow);
    flashExportMsg('SGFを保存しました');
  }, [buildSgf, flashExportMsg, hostWindow]);

  const handleCopyImage = useCallback(async () => {
    if (!boardSvgRef.current) return;
    const ok = await copyBoardToClipboard(boardSvgRef.current);
    flashExportMsg(ok ? '画像をコピーしました' : 'コピーできませんでした');
  }, [flashExportMsg]);

  const handleSaveImage = useCallback(async () => {
    if (!boardSvgRef.current) return;
    try {
      await downloadBoardAsPNG(boardSvgRef.current);
      flashExportMsg('画像を保存しました');
    } catch {
      flashExportMsg('保存できませんでした');
    }
  }, [flashExportMsg]);

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
      // 書き出しは Pocket KataGo と同じ割り当て（Ctrl+C=SGF / Ctrl+S=SGF保存 / Ctrl+F=画像コピー）
      else if (ctrl && e.key === 'c') { e.preventDefault(); void handleCopySgf(); }
      else if (ctrl && e.key === 's') { e.preventDefault(); handleSaveSgf(); }
      else if (ctrl && e.key === 'f') { e.preventDefault(); void handleCopyImage(); }
      // 候補手の表示切替はAIの機能なので先生だけ
      else if (isTeacher && !ctrl && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); setShowCandidates(prev => !prev); }
      else if (!ctrl && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); cycleNumberMode(); }
      // 今の手から 1,2,3… と振り直す（Pocket KataGo と同じ L キー）
      else if (!ctrl && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); toggleBranchStart(); }
      else if (e.key === 'Escape') { setToolMode('play'); setDrawMode('off'); }
    };
    // 別ウィンドウに描かれているときは、そのウィンドウに張らないとキーが効かない
    hostWindow.addEventListener('keydown', handleKeyDown);
    return () => hostWindow.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, isTeacher, handleUndo, goBack, goForward, goToRoot, goLast, hostWindow, cycleNumberMode, toggleBranchStart, handleCopySgf, handleSaveSgf, handleCopyImage]);

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
  // カーソルは間引いて送る。交点をまたぐたびに送ると送信の上限に当たり、
  // 超えた時点から先の配信が丸ごと止まる（2026-08-26 実授業）
  const sendCursor = useCallback((pos: { x: number; y: number }) => {
    sendToTargets({ type: 'CURSOR_MOVE', payload: pos });
  }, [sendToTargets]);
  const cursorThrottle = useThrottledCursor(sendCursor);

  const handleCellMouseEnter = useCallback((x: number, y: number) => {
    if (isTeacher) cursorThrottle.push({ x, y });
  }, [isTeacher, cursorThrottle]);

  const handleCellMouseLeave = useCallback(() => {
    if (!isTeacher) return;
    // 消すほうは間引きに埋もれさせない
    cursorThrottle.cancelPending();
    sendToTargets({ type: 'CURSOR_CLEAR', payload: null });
  }, [isTeacher, sendToTargets, cursorThrottle]);

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

  // SGFのAB/AWなど、初期局面に置かれている石をKataGoへ渡す。
  // 通常の着手石にはnumberが付くため、セットアップ石だけを分離できる。
  const initialStones = useMemo(() => rootNode.board.flatMap((row, y) => (
    row.flatMap((stone, x) => stone && stone.number === undefined
      ? [{ x: x + 1, y: y + 1, color: stone.color }]
      : [])
  )), [rootNode]);

  // KataGoの勝率・目数差は「次に打つ側」基準。白番局面では黒基準へ反転するため、
  // 現局面の次手を明示する。置き碁の初期局面は白番から始まる。
  const aiToPlay: 'BLACK' | 'WHITE' = currentNode.move
    ? (currentNode.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
    : (initialStones.some(stone => stone.color === 'BLACK') ? 'WHITE' : currentNode.activeColor);

  const aiAnalysis = useAiAnalysis(currentNode, moveHistory, {
    boardSize,
    komi,
    initialStones,
    toPlay: aiToPlay,
    active: isTeacher, // KataGoへの接続は先生端末だけ。生徒は同期結果を表示する。
  });
  const updateAiSettings = aiAnalysis.updateSettings;

  const displayedAi = isTeacher
    ? {
        enabled: aiAnalysis.settings.enabled,
        result: aiAnalysis.result,
        isLoading: aiAnalysis.isLoading,
        error: aiAnalysis.error,
        toPlay: aiToPlay,
      }
    : {
        enabled: syncedAiAnalysis?.enabled ?? false,
        result: syncedAiAnalysis?.result ?? null,
        isLoading: syncedAiAnalysis?.isLoading ?? false,
        error: syncedAiAnalysis?.error ?? null,
        // 数字がどちらから見た値かは講師端末が決める。届いていなければ自分の盤から読む。
        toPlay: syncedAiAnalysis?.toPlay ?? aiToPlay,
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
      toPlay: aiToPlay,
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
    aiToPlay,
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
      // グラフの縦軸は黒の勝率で固定する。手番基準のままだと1手ごとに上下が
      // 反転して、形勢がどちらへ動いたのか読めなくなる。
      data.push({
        moveNumber: currentMoveNumber,
        winrate: toBlackWinrate(displayedAi.result.winrate, displayedAi.toPlay),
      });
    }
    return data;
  }, [displayedAi.enabled, displayedAi.result, displayedAi.toPlay, rootNode, currentMoveNumber]);

  // 生徒選択
  const studentParticipants = useMemo(() => {
    if (!participants || !localIdentity) return [];
    // RealtimeKit の接続切替時には、同じ customParticipantId の古い接続と
    // 新しい接続が一時的に同居することがある。通信自体は両方へ届ける必要が
    // あるため接続層では潰さず、この「人」を並べる一覧だけ identity で一意化する。
    const uniqueStudents = new Map<string, ParticipantInfo>();
    participants.forEach((participant) => {
      if (participant.identity !== localIdentity) {
        uniqueStudents.set(participant.identity, participant);
      }
    });
    return Array.from(uniqueStudents.values());
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
            {/* 書き出しメニュー。中身と操作は Pocket KataGo と同じ */}
            <div className="relative">
              <button
                data-testid="export-menu"
                onClick={() => setShowExportMenu(v => !v)}
                aria-expanded={showExportMenu}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-raised hover:bg-line border border-line text-ink rounded-lg text-xs font-semibold transition-all"
                title="画像・SGFの書き出し"
              >
                <Menu className="w-3.5 h-3.5" />
                {/* アイコンだけだと見つけてもらえない（三村さんの指摘 2026-08-24）。
                    狭い画面はヘッダーを1行に保つためアイコンのみに戻す。 */}
                <span className="hidden sm:inline">書き出し</span>
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-line bg-raised py-1 shadow-2xl">
                    <button
                      data-testid="copy-image"
                      onClick={() => { setShowExportMenu(false); void handleCopyImage(); }}
                      className="flex w-full items-center px-3 py-2 text-sm text-ink hover:bg-ink/10"
                    >画像をコピー<span className="ml-auto text-[10px] text-muted">Ctrl+F</span></button>
                    <button
                      data-testid="save-image"
                      onClick={() => { setShowExportMenu(false); void handleSaveImage(); }}
                      className="flex w-full items-center px-3 py-2 text-sm text-ink hover:bg-ink/10"
                    >画像を保存</button>
                    <div className="border-t border-line my-1" />
                    <button
                      data-testid="copy-sgf"
                      onClick={() => { setShowExportMenu(false); void handleCopySgf(); }}
                      className="flex w-full items-center px-3 py-2 text-sm text-ink hover:bg-ink/10"
                    >SGFをコピー<span className="ml-auto text-[10px] text-muted">Ctrl+C</span></button>
                    <button
                      data-testid="save-sgf"
                      onClick={() => { setShowExportMenu(false); handleSaveSgf(); }}
                      className="flex w-full items-center px-3 py-2 text-sm text-ink hover:bg-ink/10"
                    >SGFを保存<span className="ml-auto text-[10px] text-muted">Ctrl+S</span></button>
                  </div>
                </>
              )}
            </div>
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

        {exportMsg && (
          <div data-testid="export-message" className="glass-panel px-3 py-1.5 text-xs text-accent-text">{exportMsg}</div>
        )}

        {/* 碁盤: 高さは親(flex-1 min-h-0)の実際の余りに追従させる。
            固定の calc(100dvh - Nrem) だと、ナビ・ツール列のぶんだけ碁盤が大きくなり、
            PCでは下のボタン列に重なり、スマホでは画面からはみ出して見切れる
            （対局盤で同じ問題を解決済みの方式に揃えた 2026-08-01）。 */}
        <div className="glass-panel p-2 sm:p-4 flex justify-center items-center shadow-2xl overflow-hidden lg:flex-1 lg:min-h-0">
          <GoBoard
            ref={boardSvgRef}
            boardState={boardState}
            boardSize={boardSize}
            numberMode={numberMode}
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

        {/* 手順・注釈・コメント。PCでは高さを固定して内部だけを送る。
            棋譜コメントや変化一覧が手ごとに出入りしても、その上の碁盤へ高さを
            返さないため、ホイール手順移動中に盤が伸び縮みしない。 */}
        <div
          data-testid="review-controls"
          className="space-y-2 sm:space-y-3 lg:h-[190px] lg:shrink-0 lg:overflow-y-auto lg:pr-1"
        >
          {/* ナビゲーション */}
          {canEdit && (
          <div className="flex flex-col gap-2 sm:gap-3 w-full items-center">
            {/* ステップ移動 */}
            <div className="flex justify-center gap-2">
              <button onClick={goToRoot} disabled={!currentNode.parent} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30" title="最初へ">
                <ChevronFirst />
              </button>
              <button onClick={() => jumpBy(-10)} disabled={!currentNode.parent} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30" title="10手戻る">
                <ChevronsLeft />
              </button>
              <button onClick={goBack} disabled={!currentNode.parent} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30" title="一手戻る">
                <ChevronLeft />
              </button>
              <button onClick={goForward} disabled={currentNode.children.length === 0} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30" title="一手進む">
                <ChevronRight />
              </button>
              <button onClick={() => jumpBy(10)} disabled={currentNode.children.length === 0} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30" title="10手進む">
                <ChevronsRight />
              </button>
              <button onClick={goLast} disabled={currentNode.children.length === 0} className="p-2.5 sm:p-3 glass-panel hover:bg-ink/10 disabled:opacity-30" title="最後へ">
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

            {/* 手順のゲージ。200手を超える棋譜でも、見たい場面まで一気に飛べる */}
            {timeline.nodes.length > 1 && (
              <div className="flex w-full items-center gap-2 px-1">
                <span className="tabular text-xs text-muted whitespace-nowrap">
                  {timeline.index}/{timeline.nodes.length - 1}
                </span>
                <input
                  type="range"
                  aria-label="手順の位置"
                  data-testid="review-seek-bar"
                  min={0}
                  max={timeline.nodes.length - 1}
                  value={timeline.index}
                  onChange={(e) => goToIndex(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink/10 accent-accent"
                />
              </div>
            )}

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

              <div className="w-px h-5 bg-raised mx-1" />

              {/* 石の手番号。Pocket KataGo と同じ 123→全→分 の循環（M キー）。
                  「分」は棋譜の続きに置いた検討の手だけに 1 から番号を振る。 */}
              <button
                data-testid="cycle-number-mode"
                onClick={cycleNumberMode}
                aria-pressed={numberMode !== 'off'}
                className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all ${
                  numberMode !== 'off' ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title={
                  numberMode === 'off' ? '手番号を出す (M)'
                    : numberMode === 'all' ? '全部の石に手数を表示中 (M で変化手順だけに)'
                    : '変化手順の石だけ番号を表示中 (M で消す)'
                }
              >
                {numberMode === 'off' ? '123' : numberMode === 'all' ? '全' : '分'}
              </button>

              {/* 今並べている手を 1 にする。空の盤に並べる検討では、これが無いと
                  「分」が通し番号と同じ見え方になる（三村さんの指摘 2026-08-24）。 */}
              <button
                data-testid="branch-start-here"
                onClick={toggleBranchStart}
                disabled={!currentNode.parent}
                aria-pressed={branchStartIsHere}
                className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all disabled:opacity-30 ${
                  branchStartIsHere ? 'bg-accent border-accent text-accent-ink' : 'bg-raised border-line text-muted hover:text-ink'
                }`}
                title={branchStartIsHere
                  ? 'この手からの番号付けをやめる (L)'
                  : 'この手を1として、ここから番号を振る (L)'}
              >
                ここから1
              </button>

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
            toPlay={displayedAi.toPlay}
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
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          data-testid={`review-share-${s.identity}`}
                          onClick={() => toggleStudent(s.identity)}
                          title={isSelected ? '検討に参加中（押すと退出）' : '検討の対象外（押すと参加）'}
                          className={`flex flex-1 min-w-0 items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors duration-150 ${
                            isSelected ? 'bg-accent/12 text-accent-text' : 'bg-ink/5 text-muted hover:bg-ink/10'
                          }`}
                        >
                          {isSelected
                            ? <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                            : <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />}
                          <span className="min-w-0 flex-1 truncate">
                            {s.name || getDisplayName(s.identity, registeredStudents ?? [])}
                          </span>
                          <span className="shrink-0 text-xs font-medium">
                            {isSelected ? '参加中' : '対象外'}
                          </span>
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
