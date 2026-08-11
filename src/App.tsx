import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Drawing } from './components/GoBoard';
import type { GameNode } from './utils/treeUtilsV2';
import { convertSgfToGameTree } from './utils/treeUtilsV2';
import { parseSGFTree } from './utils/sgfUtils';
import { playReviewMove } from './utils/reviewMove';
import { toggleSharingTarget, type SharingTargets } from './utils/sharingTargets';
import { ClassroomLiveKit } from './utils/classroomLiveKit';
import type { Role, ClassroomMessage, ParticipantInfo, VideoTrackInfo } from './utils/classroomLiveKit';
import type { ViewMode, AudioPermissions, SavedGame } from './types/game';
import type { Student, Classroom } from './types/classroom';
import { fetchToken } from './utils/livekitToken';
import { getDisplayName, getTeacherDisplayName, identityMatchesPlayer, makeStudentIdentity, TEACHER_IDENTITY } from './utils/identityUtils';
import { ConnectionState } from 'livekit-client';
import { useLiveGameList } from './hooks/useLiveGameList';
import { liveRowToSession, interruptAllGames, interruptGame, resumeLiveGame } from './utils/liveGameApi';
import { isTimeoutResult, timedOutColorFromResult } from './utils/scoring';
import {
  clearPendingResumeGameId,
  getPendingResumeGameId,
  initUnloadInterruptAuthCache,
  interruptGameOnUnload,
} from './utils/unloadInterrupt';
import { fetchRoster, loadStudents, loadClassrooms } from './utils/classroomStore';
import { saveAccount, supabaseSignOut, loadAccounts, getSupabaseSessionClaims } from './utils/authStore';

import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import PopupPortal from './components/PopupPortal';
import NigiriAnnouncement from './components/NigiriAnnouncement';
import ClassroomAlerts, { type ClassroomAlert, type NewClassroomAlert } from './components/teacher/ClassroomAlerts';
import { postTeacherAlert } from './utils/teacherAlertChannel';
import LoginScreen from './components/LoginScreen';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import TeacherGameWindow from './components/teacher/TeacherGameWindow';
import GameCreationDialog from './components/GameCreationDialog';
import LectureBoard from './components/LectureBoard';
import ReviewBoard from './components/ReviewBoard';
import MediaControlPanel from './components/MediaControlPanel';
import VideoTiles from './components/VideoTiles';
import StudentManager from './components/StudentManager';
import TeacherDashboard from './components/teacher/TeacherDashboard';
import ClassroomManager from './components/teacher/ClassroomManager';
import ProblemBoard from './components/ProblemBoard';
import ProblemMonitorPanel from './components/teacher/ProblemMonitorPanel';
import { useChat } from './hooks/useChat';
import { useNotificationSound } from './hooks/useNotificationSound';
import type { ChatMessagePayload } from './types/chat';
import type { AiAnalysisSyncPayload } from './types/ai';
import { resolveEffectiveViewMode } from './utils/viewMode';

import { Settings } from 'lucide-react';

// 講師専用の対局別ウィンドウの固定名。同名指定によりwindow.openが既存ウィンドウを再利用・前面化する。
const TEACHER_GAME_WINDOW_NAME = 'teacher-game-window';
// 講師専用の検討別ウィンドウ。中身は本体からポータルで描く（PopupPortal 参照）。
const TEACHER_REVIEW_WINDOW_NAME = 'teacher-review-window';

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [userName, setUserName] = useState('');

  // LiveKit接続
  const [livekitUrl, setLivekitUrl] = useState(() => import.meta.env.VITE_LIVEKIT_URL || localStorage.getItem('lk-url') || '');
  const [roomName, setRoomName] = useState('go-classroom');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [connectionError, setConnectionError] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);

  // 画面状態
  const [viewMode, setViewMode] = useState<ViewMode>('lobby');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [autoOpenedGameId, setAutoOpenedGameId] = useState<string | null>(null);
  const [showGameCreation, setShowGameCreation] = useState(false);
  const [gameCreationBlack, setGameCreationBlack] = useState<string | null>(null); // 生徒一覧から開始した時の黒番プリセット
  const [showSettings, setShowSettings] = useState(false);

  // 教師フェーズ: manage=教室管理, classroom=授業中
  const [teacherPhase, setTeacherPhase] = useState<'manage' | 'classroom'>('manage');

  // 音声・映像
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [audioPermissions, setAudioPermissions] = useState<AudioPermissions>({});

  // 参加者
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);

  // ビデオ要素
  const [videoElements, setVideoElements] = useState<Map<string, HTMLVideoElement>>(new Map());

  // 参加リンク
  const [studentJoinInfo, setStudentJoinInfo] = useState('');

  // 生徒用: 授業/検討の同期データ
  const [syncedNode, setSyncedNode] = useState<GameNode | null>(null);
  const [syncedBoardSize, setSyncedBoardSize] = useState(19);
  const [teacherCursor, setTeacherCursor] = useState<{ x: number; y: number } | null>(null);
  const [syncedDrawings, setSyncedDrawings] = useState<Drawing[]>([]);
  const [syncedAiAnalysis, setSyncedAiAnalysis] = useState<AiAnalysisSyncPayload>({
    enabled: false,
    nodeId: null,
    result: null,
    isLoading: false,
    error: null,
    hoveredCandidateRank: null,
    allowStudentInteraction: false,
  });

  // 検討モード用
  const [reviewRootNode, setReviewRootNode] = useState<GameNode | null>(null);
  const [reviewCurrentNode, setReviewCurrentNode] = useState<GameNode | null>(null);
  const [reviewBoardSize, setReviewBoardSize] = useState(19);
  // 検討の参加者。null=全員 / 配列=その生徒だけ / 空配列=誰にも配信しない
  const [reviewTargetStudents, setReviewTargetStudents] = useState<SharingTargets>(null);
  // 検討開始（棋譜を開いた瞬間）は useCallback の中から送るので、最新の参加者を ref で読む
  const reviewTargetStudentsRef = useRef<SharingTargets>(null);
  useEffect(() => { reviewTargetStudentsRef.current = reviewTargetStudents; }, [reviewTargetStudents]);
  // 生徒が自分の対局を持っているか。LiveKitのメッセージ処理は接続時に作った関数の中で
  // 走るので、そこから最新の状態を見るために ref に写す
  const myLiveGameIdRef = useRef<string | null>(null);
  // 検討中に盤へ打てる生徒（先生が保持する正本）。既定は誰も打てない
  const [reviewMovePermissions, setReviewMovePermissions] = useState<string[]>([]);
  // LiveKitのメッセージ処理は接続時に作った関数の中で走るため、最新の許可をrefで見る
  const reviewMovePermissionsRef = useRef<string[]>([]);
  // 生徒側: 自分が今この検討盤に打てるか
  const [reviewCanPlay, setReviewCanPlay] = useState(false);
  // 講師への即時通知（接続切れ・時間切れ）。音だけだと何が起きたか分からないので一緒に出す
  const [alerts, setAlerts] = useState<ClassroomAlert[]>([]);
  const dismissAlert = useCallback((id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);
  const alertSeqRef = useRef(0);
  /** 同じ相手の同じ知らせは重ねない。時間切れは操作が要るので自分では消えない */
  const pushAlert = useCallback((alert: NewClassroomAlert) => {
    const id = ++alertSeqRef.current;
    const withId = { ...alert, id } as ClassroomAlert;
    setAlerts(prev => [
      ...prev.filter(a => !(a.kind === alert.kind && a.identity === alert.identity)),
      withId,
    ]);
    // 対局ウィンドウを前面にしていても気づけるよう、同じ知らせをあちらにも渡す
    postTeacherAlert(withId);
    if (alert.kind !== 'timeout') {
      window.setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== id));
      }, 12_000);
    }
  }, []);

  // 対局者に見せるニギリ（先生が押すたびに届く。drawIdで引き直しも作り直す）
  const [nigiriDraw, setNigiriDraw] = useState<{ iAmBlack: boolean; opponent: string; drawId: number } | null>(null);
  // ポップアップを塞がれていて検討の別ウィンドウを開けなかった（全面表示に落とす）
  const [reviewWindowBlocked, setReviewWindowBlocked] = useState(false);

  // 詰碁モード用
  const [activeProblem, setActiveProblem] = useState<import('./types/problem').Problem | null>(null);
  // 先生用: 生徒identityごとの解答状況(PROBLEM_RESULT受信結果)
  const [problemResults, setProblemResults] = useState<Record<string, { result: 'correct' | 'incorrect'; moveCount: number }>>({});

  // オーディオデバッグ
  const [audioDebug, setAudioDebug] = useState('');

  // 生徒・教室データ
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [classrooms, setClassrooms] = useState<Classroom[]>(() => loadClassrooms());
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [showStudentManager, setShowStudentManager] = useState(false);

  // 生徒ID認証
  const [studentId, setStudentId] = useState<string | null>(null);
  // ログイン時に入力された生の生徒コード（UUIDではなく4桁などのコードをlocalStorageに保存するため）
  const [rawStudentCode, setRawStudentCode] = useState<string>('');
  // 教室ID（ログイン画面 or URLパラメータから）
  const [studentClassroomId, setStudentClassroomId] = useState<string | null>(null);
  // URLから事前設定された教室ID
  const [prefilledClassroomId, setPrefilledClassroomId] = useState<string | undefined>(undefined);

  // 生徒自動接続の重複防止
  const studentAutoConnectRef = useRef(false);

  const reloadClassroomData = useCallback(async () => {
    try {
      const roster = await fetchRoster();
      setStudents(roster.students);
      setClassrooms(roster.classrooms);
    } catch (err) {
      console.error('[Classroom roster] fetch failed, using local cache:', err);
      setStudents(loadStudents());
      setClassrooms(loadClassrooms());
    }
  }, []);


  const classroomRef = useRef<ClassroomLiveKit | null>(null);

  // チャット
  const chat = useChat(classroomRef);

  // 通知音
  const notificationSound = useNotificationSound();

  // Supabase権威型 対局リスト（先生・生徒共通、Realtime購読）
  const effectiveClassroomId =
    role === 'TEACHER' ? selectedClassroomId : studentClassroomId;
  const liveGameList = useLiveGameList(effectiveClassroomId);

  // 自分（生徒）の進行中の対局。上の ref に写して、メッセージ処理から見られるようにする
  useEffect(() => {
    if (role !== 'STUDENT') {
      myLiveGameIdRef.current = null;
      return;
    }
    const me = classroomRef.current?.localIdentity ?? userName;
    const mine = liveGameList.games.find(g =>
      (g.status === 'playing' || g.status === 'scoring') &&
      (identityMatchesPlayer(me, g.black_player) || identityMatchesPlayer(me, g.white_player)),
    );
    myLiveGameIdRef.current = mine?.id ?? null;
  }, [liveGameList.games, role, userName]);

  // 旧GameSession形に変換（ロビー/サムネイル等の既存コンポーネント互換）
  // 注意: boardState/moveNumber はプレースホルダ。実盤面は useLiveGame 経由で取得
  const games = useMemo(
    () => liveGameList.games.map(liveRowToSession),
    [liveGameList.games],
  );

  useEffect(() => {
    initUnloadInterruptAuthCache();
  }, []);

  // 生徒側の Lobby ヘッダー用（どの教室に入ったか/自分の名前の表示）。
  // 生徒のブラウザには先生が管理する classrooms/students は無いので、
  // ログイン時に保存された SavedAccount の classroomName / studentName を使う
  const currentClassroomName = useMemo(() => {
    if (role !== 'STUDENT' || !studentClassroomId) return undefined;
    const acct = loadAccounts().find(
      a => a.classroomId === studentClassroomId && a.studentId === studentId,
    );
    return acct?.classroomName || studentClassroomId;
  }, [role, studentClassroomId, studentId]);

  const currentStudentName = useMemo(() => {
    if (role !== 'STUDENT' || !studentId) return undefined;
    const acct = loadAccounts().find(a => a.studentId === studentId);
    return userName || acct?.studentName || studentId;
  }, [role, studentId, userName]);

  // 音声デバッグ更新
  const updateAudioDebug = useCallback(() => {
    if (!classroomRef.current) return;
    const audioEls = document.querySelectorAll('audio').length;
    const remote = classroomRef.current.room.remoteParticipants.size;
    const local = classroomRef.current.room.localParticipant;
    const localAudio = local ? Array.from(local.audioTrackPublications.values()) : [];
    const localInfo = `Local: ${localAudio.length}トラック`;
    let trackInfo = '';
    classroomRef.current.room.remoteParticipants.forEach((p) => {
      const audioTracks = Array.from(p.audioTrackPublications.values());
      trackInfo += `${p.identity}: ${audioTracks.length}; `;
    });
    setAudioDebug(`マイク: ${isMicEnabled ? 'ON' : 'OFF'}, ${localInfo}, Audio要素: ${audioEls}, リモート: ${remote}, [${trackInfo || 'なし'}]`);
  }, [isMicEnabled]);

  // オーディオデバッグタイマー
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    updateAudioDebug();
    const interval = setInterval(updateAudioDebug, 2000);
    return () => clearInterval(interval);
  }, [connectionState, updateAudioDebug]);

  // LiveKit接続
  const connectLiveKit = useCallback(async (connectRole: Role, connectUserName: string, overrideRoomName?: string, overrideClassroomId?: string) => {
    const effectiveRoomName = overrideRoomName || roomName;
    const effectiveClassroomId = overrideClassroomId ?? selectedClassroomId ?? '';
    classroomRef.current?.destroy();
    const classroom = new ClassroomLiveKit();
    classroomRef.current = classroom;

    classroom.setHandlers({
      onMessage: (msg: ClassroomMessage, sender?: string) => {
        // 対局関連メッセージをカスタムイベントで通知（低遅延同期用）
        if (msg.type === 'GAME_MOVE' || msg.type === 'GAME_PASS' || msg.type === 'GAME_RESIGN') {
          window.dispatchEvent(
            new CustomEvent('live-game-message', {
              detail: { msg, sender },
            })
          );
        }

        // 先生: 対局メッセージ処理
        // 対局関連メッセージはSupabase側で扱うのでここでは不要
        void sender;

        // 授業/検討の碁盤同期（生徒用）
        if (msg.type === 'BOARD_UPDATE' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as {
            boardState: GameNode['board'];
            boardSize: number;
            nextColor: 'BLACK' | 'WHITE';
            markers: GameNode['markers'];
            moveNumber: number;
          };
          if (!Array.isArray(p.boardState) || typeof p.boardSize !== 'number') return;
          const dummyNode: GameNode = {
            id: `synced-${p.moveNumber ?? 0}`,
            parent: null,
            children: [],
            board: p.boardState,
            nextNumber: (p.moveNumber ?? 0) + 1,
            // GameNode.activeColorは「直前に打った色」。同期盤では次手番の反対色を保持する。
            activeColor: p.nextColor === 'BLACK' ? 'WHITE' : 'BLACK',
            boardSize: p.boardSize,
            markers: p.markers || [],
            move: (p.moveNumber ?? 0) > 0
              ? { x: 0, y: 0, color: p.nextColor === 'BLACK' ? 'WHITE' : 'BLACK' }
              : undefined,
          };
          setSyncedBoardSize(p.boardSize);
          setSyncedNode(dummyNode);
          // 検討画面はreviewCurrentNodeを表示するため、授業用の同期盤面も同時に更新する。
          setReviewCurrentNode(prev => prev ? dummyNode : prev);
        }

        // AI解析同期（生徒用）。KataGoへの問い合わせは先生端末だけで行う。
        if (msg.type === 'AI_ANALYSIS_UPDATE' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as Partial<AiAnalysisSyncPayload>;
          const validResult = p.result === null || (
            typeof p.result === 'object' &&
            typeof p.result?.winrate === 'number' &&
            typeof p.result?.scoreLead === 'number' &&
            Array.isArray(p.result?.topMoves)
          );
          if (typeof p.enabled === 'boolean' && typeof p.isLoading === 'boolean' && validResult) {
            setSyncedAiAnalysis({
              enabled: p.enabled,
              nodeId: typeof p.nodeId === 'string' ? p.nodeId : null,
              result: p.result ?? null,
              isLoading: p.enabled && p.isLoading,
              error: typeof p.error === 'string' ? p.error : null,
              hoveredCandidateRank: typeof p.hoveredCandidateRank === 'number' && p.hoveredCandidateRank >= 0
                ? p.hoveredCandidateRank
                : null,
              allowStudentInteraction: p.allowStudentInteraction === true,
            });
          }
        }

        // カーソル同期（生徒用）
        if (msg.type === 'CURSOR_MOVE' && connectRole === 'STUDENT' && msg.payload) {
          const c = msg.payload as { x: number; y: number };
          if (typeof c.x === 'number' && typeof c.y === 'number') {
            setTeacherCursor({ x: c.x, y: c.y });
          }
        }
        if (msg.type === 'CURSOR_CLEAR' && connectRole === 'STUDENT') {
          setTeacherCursor(null);
        }

        // 描画同期（生徒用）
        if (msg.type === 'DRAW_UPDATE' && connectRole === 'STUDENT' && Array.isArray(msg.payload)) {
          setSyncedDrawings(msg.payload as Drawing[]);
        }
        if (msg.type === 'DRAW_CLEAR' && connectRole === 'STUDENT') {
          setSyncedDrawings([]);
        }

        // ニギリ（対局者用）。自分が絡む抽選だけ出す
        if (msg.type === 'NIGIRI_DRAW' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as import('./types/game').NigiriDrawPayload;
          const me = classroomRef.current?.localIdentity;
          if (me && (p.blackPlayer === me || p.whitePlayer === me)) {
            setNigiriDraw({
              iAmBlack: p.blackPlayer === me,
              opponent: p.blackPlayer === me ? p.whitePlayer : p.blackPlayer,
              drawId: Date.now(),
            });
          }
        }

        // 検討モード開始（生徒用）
        if (msg.type === 'REVIEW_START' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as { sgf: string; boardSize: number };
          const parsed = parseSGFTree(p.sgf);
          const root = convertSgfToGameTree(parsed.root, null, p.boardSize, 1, parsed.board);
          setReviewRootNode(root);
          setReviewCurrentNode(root);
          setReviewBoardSize(p.boardSize);
          setSyncedAiAnalysis({ enabled: false, nodeId: null, result: null, isLoading: false, error: null, hoveredCandidateRank: null, allowStudentInteraction: false });
          // 新しい検討が始まったら前回の許可は引き継がない（先生が改めて許可する）
          setReviewCanPlay(false);
          setViewMode('review');
        }
        // 詰碁配信（生徒用）
        if (msg.type === 'PROBLEM_ASSIGN' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as import('./types/problem').ProblemAssignPayload;
          setActiveProblem(p.problem);
          setViewMode('problem');
        }

        // 詰碁の解答結果（先生用: 生徒ごとの挑戦中/正解/不正解を集計する）
        if (msg.type === 'PROBLEM_RESULT' && connectRole === 'TEACHER' && msg.payload && sender) {
          const p = msg.payload as import('./types/problem').ProblemResultPayload;
          setProblemResults(prev => ({ ...prev, [sender]: { result: p.result, moveCount: p.moveCount } }));
        }

        // 着手権限の配布（生徒用）。自分が入っていれば打てる
        if (msg.type === 'REVIEW_PERMISSIONS' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as import('./types/game').ReviewPermissionsPayload;
          const me = classroomRef.current?.localIdentity;
          setReviewCanPlay(Array.isArray(p.allowed) && !!me && p.allowed.includes(me));
        }

        // 許可した生徒の着手（先生用）。打てるかどうかの判定はここが正本
        if (msg.type === 'REVIEW_STUDENT_MOVE' && connectRole === 'TEACHER' && msg.payload && sender) {
          const p = msg.payload as import('./types/game').ReviewStudentMovePayload;
          if (
            reviewMovePermissionsRef.current.includes(sender) &&
            typeof p.x === 'number' && typeof p.y === 'number'
          ) {
            // 打った結果は通常のBOARD_UPDATE（reviewCurrentNodeのeffect）で全員へ返る
            setReviewCurrentNode(prev => (prev ? playReviewMove(prev, p.x, p.y) ?? prev : prev));
          }
        }

        if (msg.type === 'REVIEW_END' && connectRole === 'STUDENT') {
          // 先生がロビーに戻った: 検討/授業/詰碁の全セッション状態をクリア。
          // ただし自分が対局中なら自分の盤へ戻す。ロビーに落とすと対局から締め出され、
          // 自分で入り直すまで打てなくなる（自動で開き直す仕組みは初回しか働かない）。
          if (myLiveGameIdRef.current) {
            setActiveGameId(myLiveGameIdRef.current);
            setViewMode('game');
          } else {
            setViewMode('lobby');
          }
          setReviewRootNode(null);
          setReviewCurrentNode(null);
          setReviewCanPlay(false);
          setSyncedNode(null);
          setSyncedAiAnalysis({ enabled: false, nodeId: null, result: null, isLoading: false, error: null, hoveredCandidateRank: null, allowStudentInteraction: false });
          setActiveProblem(null);
        }

        // 音声制御（生徒用）
        if (msg.type === 'AUDIO_CONTROL' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as { canHear: boolean };
          if (!p.canHear) {
            // 先生の音声をミュート
            classroomRef.current?.room.remoteParticipants.forEach(rp => {
              rp.audioTrackPublications.forEach(pub => {
                if (pub.track) pub.track.mediaStreamTrack.enabled = false;
              });
            });
          } else {
            classroomRef.current?.room.remoteParticipants.forEach(rp => {
              rp.audioTrackPublications.forEach(pub => {
                if (pub.track) pub.track.mediaStreamTrack.enabled = true;
              });
            });
          }
        }

        // メディア制御（生徒用）
        if (msg.type === 'MEDIA_CONTROL' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as { micAllowed: boolean; cameraAllowed: boolean };
          if (!p.micAllowed && classroomRef.current?.isMicrophoneEnabled) {
            classroomRef.current.disableMicrophone();
            setIsMicEnabled(false);
          }
        }

        // チャットメッセージ
        if (msg.type === 'CHAT_MESSAGE' && msg.payload) {
          chat.handleChatMessage(msg.payload as ChatMessagePayload);
          notificationSound.play('chat');
        }

        // 対局終了時の通知音
        if (msg.type === 'GAME_ENDED') {
          notificationSound.play('gameEnd');
        }
      },
      onParticipantJoined: (identity: string) => {
        notificationSound.play('connect');
        // 戻ってきたことも講師には見せる（切れたきり戻らないのか、復旧したのかが分かる）
        if (connectRole === 'TEACHER') pushAlert({ kind: 'rejoin', identity });
      },
      onParticipantLeft: (identity: string) => {
        notificationSound.play('disconnect');
        if (connectRole === 'TEACHER') pushAlert({ kind: 'disconnect', identity });
      },
      onParticipantsChanged: (p: ParticipantInfo[]) => {
        setParticipants(p);
      },
      onConnectionStateChanged: (state: ConnectionState) => {
        setConnectionState(state);
        // 生徒接続成功時にアカウントを保存
        if (state === ConnectionState.Connected && connectRole === 'STUDENT' && studentId && studentClassroomId) {
          saveAccount(rawStudentCode || studentId, studentClassroomId);
        }
      },
      onActiveSpeakersChanged: (speakers: string[]) => {
        setActiveSpeakers(speakers);
      },
    });

    // ビデオトラック変更コールバック
    classroom.onVideoTrackChanged = (info: VideoTrackInfo) => {
      setVideoElements(prev => {
        const next = new Map(prev);
        if (info.element) {
          next.set(info.identity, info.element);
        } else {
          next.delete(info.identity);
        }
        return next;
      });
    };

    try {
      // URLから 'token' (一時参加トークン) を取得
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token') || undefined;

      const connectToken = await fetchToken({
        roomName: effectiveRoomName,
        identity: connectUserName,
        token: urlToken,
        username:
          connectRole === 'STUDENT'
            ? (userName || connectUserName)
            : getTeacherDisplayName(),
      });

      await classroom.connect(livekitUrl, connectToken);
      setConnectionError('');

      if (connectRole === 'TEACHER') {
        const baseUrl = `${window.location.origin}${window.location.pathname}`;
        setStudentJoinInfo(`${baseUrl}?classroomId=${effectiveClassroomId}`);
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : '接続に失敗しました');
    }
    // chat / notificationSound は中身が ref と updater で書かれていて、古い closure を
    // 掴んでも取りこぼさない（useChat.handleChatMessage は依存 [] ＋ setMessages(prev=>…)、
    // notificationSound.play は ref 経由）。依存に入れると毎レンダー作り直しになり、
    // かえって接続処理が張り直される。rawStudentCode は studentId と同時に更新される。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, livekitUrl, studentId, studentClassroomId, selectedClassroomId, userName]);

  // URL params for student auto-join
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const urlClassroomId = params.get('classroomId');
    const urlLkUrl = params.get('url');
    const urlRoom = params.get('room');
    const urlRole = params.get('role');
    const urlToken = params.get('token');

    if (urlClassroomId) setPrefilledClassroomId(urlClassroomId);

    if (urlLkUrl) setLivekitUrl(urlLkUrl);
    if (urlRoom) setRoomName(urlRoom);

    if (urlRole === 'STUDENT' && urlRoom) {
      const urlStudentId = params.get('studentId');
      const urlStudentName = params.get('studentName');
      if (urlStudentId) {
        setStudentId(urlStudentId);
        // params.get は復号済みの値を返す。ここで decodeURIComponent を重ねると
        // 名前に % が入っていたとき URIError で画面ごと落ちる。
        if (urlStudentName) setUserName(urlStudentName);
      }
      if (urlClassroomId) setStudentClassroomId(urlClassroomId);
      setRole('STUDENT');
    } else if (params.get('mode') !== 'game') {
      // 通常ロード: 既存セッションからログイン状態を復元（リロードで再ログイン不要に）。
      // ゾンビ対策の起動時 signOut は廃止（永続化を妨げていたため）。app_role が無い
      // セッションはロールを復元しない＝ログイン画面のままで無害。
      void (async () => {
        const claims = await getSupabaseSessionClaims();
        if (claims?.app_role === 'teacher') {
          setRole('TEACHER');
          const lastCls = localStorage.getItem('go-school-last-classroom');
          if (lastCls) {
            const rn = `go-${lastCls}`;
            setSelectedClassroomId(lastCls);
            setRoomName(rn);
            setTeacherPhase('classroom');
            void connectLiveKit('TEACHER', TEACHER_IDENTITY, rn, lastCls);
          } else {
            setTeacherPhase('manage');
          }
        } else {
          // 生徒セッションの復元
          const lastRole = localStorage.getItem('go-school-last-role');
          if (lastRole === 'STUDENT') {
            const sid = localStorage.getItem('go-school-last-student-id');
            const code = localStorage.getItem('go-school-last-student-code');
            const cid = localStorage.getItem('go-school-last-student-classroom-id');
            const name = localStorage.getItem('go-school-last-student-name');
            if (sid && cid && name) {
              setStudentId(sid);
              setRawStudentCode(code || sid);
              setStudentClassroomId(cid);
              setRoomName(`go-${cid}`);
              setUserName(name);
              setRole('STUDENT');
            }
          }
        }
      })();
    }

    if (urlClassroomId || urlLkUrl || urlToken) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // 読み込み時に一度だけ走らせる（URL の教室ID・トークンからの自動参加）。
    // connectLiveKit を依存に入れると、接続状態が変わるたび再入して二重接続になる。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (role === 'TEACHER' || mode === 'game') {
      void reloadClassroomData();
    }
  }, [role, reloadClassroomData]);

  // 生徒自動接続
  useEffect(() => {
    if (role === 'STUDENT' && connectionState === ConnectionState.Disconnected && studentId && !studentAutoConnectRef.current) {
      if (livekitUrl && roomName) {
        studentAutoConnectRef.current = true;
        connectLiveKit('STUDENT', makeStudentIdentity(studentId));
      }
    }
    if (role !== 'STUDENT') {
      studentAutoConnectRef.current = false;
    }
  }, [role, connectionState, studentId, livekitUrl, roomName, connectLiveKit]);

  // 検討の矢印キーは ReviewBoard 側が扱う（Home/End/Delete も含めて一式そこにある）。
  // ここにも同じ処理があったが、検討を別ウィンドウに出すと本体（教室ホーム）で矢印を
  // 押しただけで手順が動いてしまうため、重複していたこちらを外した（2026-08-05）。

  // 検討モード: currentNode変更時に碁盤同期
  useEffect(() => {
    if (role !== 'TEACHER' || viewMode !== 'review' || !reviewCurrentNode) return;
    if (!classroomRef.current?.isConnected) return;
    const node = reviewCurrentNode;
    const nextColor = node.move
      ? (node.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
      : 'BLACK';
    // 「配信先の生徒」で絞れるようにする。空なら全員（以前は常に全員へ送っていた）
    void classroomRef.current.sendToOrAll({
      type: 'BOARD_UPDATE',
      payload: {
        boardState: node.board,
        boardSize: reviewBoardSize,
        nextColor,
        markers: node.markers,
        moveNumber: node.move ? node.nextNumber - 1 : 0,
      },
    }, reviewTargetStudents);
  }, [reviewCurrentNode, role, viewMode, reviewBoardSize, reviewTargetStudents]);

  // 検討モード: 着手権限を生徒へ配る。
  // 許可を外された生徒にも届く必要があるので、配信先の絞り込みとは別に必ず全員へ送る。
  useEffect(() => {
    reviewMovePermissionsRef.current = reviewMovePermissions;
    if (role !== 'TEACHER' || viewMode !== 'review') return;
    if (!classroomRef.current?.isConnected) return;
    void classroomRef.current.broadcast({
      type: 'REVIEW_PERMISSIONS',
      payload: { allowed: reviewMovePermissions },
    });
    // participants: 途中から入ってきた生徒にも現在の許可が届くように送り直す
  }, [reviewMovePermissions, role, viewMode, participants]);

  // 生徒が検討盤に打ったとき。自分では置かず先生へ送り、先生の盤経由で返るのを待つ
  const handleStudentReviewMove = useCallback((x: number, y: number) => {
    void classroomRef.current?.sendTo({ type: 'REVIEW_STUDENT_MOVE', payload: { x, y } }, [TEACHER_IDENTITY]);
  }, []);

  // 生徒一覧の「共有」列。対局中の生徒を検討から外せるようにするためのもの
  const toggleSharingStudent = useCallback((identity: string) => {
    const all = (classroomRef.current?.participants ?? [])
      .map(p => p.identity)
      .filter(id => id !== classroomRef.current?.localIdentity);
    setReviewTargetStudents(prev => toggleSharingTarget(prev, identity, all));
  }, []);

  const toggleReviewMovePermission = useCallback((identity: string) => {
    setReviewMovePermissions(prev => (
      prev.includes(identity) ? prev.filter(id => id !== identity) : [...prev, identity]
    ));
  }, []);

  // 音声操作
  // getUserMedia系の失敗をユーザーに分かる日本語にする（本番はaudioDebugが非表示のため、無言で失敗させない）
  const mediaErrorMessage = (err: unknown, device: 'マイク' | 'カメラ'): string => {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return `${device}の使用がブラウザでブロックされています。アドレスバーの鍵マーク（🔒）から${device}を「許可」に変更してください。`;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return `${device}が見つかりません。端末に${device}が接続されているか確認してください。`;
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return `${device}を他のアプリが使用中の可能性があります。他のアプリを閉じてからお試しください。`;
    }
    return `${device}を開始できませんでした: ${err instanceof Error ? err.message : String(err)}`;
  };

  const handleToggleMic = async () => {
    if (!classroomRef.current?.isConnected) {
      alert('教室との接続が切れています。ページを再読み込みしてから、もう一度お試しください。');
      return;
    }
    try {
      const enabled = await classroomRef.current.toggleMicrophone();
      setIsMicEnabled(enabled);
    } catch (err) {
      setAudioDebug(`マイクエラー: ${err instanceof Error ? err.message : String(err)}`);
      alert(mediaErrorMessage(err, 'マイク'));
    }
  };

  const handleToggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      if (classroomRef.current?.room) {
        classroomRef.current.room.remoteParticipants.forEach(p => {
          p.audioTrackPublications.forEach(pub => {
            if (pub.track) pub.track.mediaStreamTrack.enabled = !next;
          });
        });
      }
      return next;
    });
  };

  const handleToggleCamera = async () => {
    if (!classroomRef.current?.isConnected) {
      alert('教室との接続が切れています。ページを再読み込みしてから、もう一度お試しください。');
      return;
    }
    try {
      const enabled = await classroomRef.current.toggleCamera();
      setIsCameraEnabled(enabled);
    } catch (err) {
      setAudioDebug(`カメラエラー: ${err instanceof Error ? err.message : String(err)}`);
      alert(mediaErrorMessage(err, 'カメラ'));
    }
  };

  const handleDisconnect = async () => {
    // 生徒用自動ログイン情報の消去
    localStorage.removeItem('go-school-last-role');
    localStorage.removeItem('go-school-last-student-id');
    localStorage.removeItem('go-school-last-student-code');
    localStorage.removeItem('go-school-last-student-classroom-id');
    localStorage.removeItem('go-school-last-student-name');

    // ログアウト時、自分が打ち手の進行中対局を「中断」にする（playing/scoringで放置しない）
    const myId = classroomRef.current?.localIdentity ?? userName;
    const myActiveGame = games.find(
      g => (g.status === 'playing' || g.status === 'scoring') &&
        (identityMatchesPlayer(myId, g.blackPlayer) || identityMatchesPlayer(myId, g.whitePlayer)),
    );

    // 中断にしてからサインアウト（順序重要: signOut前に認証付きで実行）
    if (role !== 'TEACHER' && myActiveGame) {
      try {
        await interruptGame(myActiveGame.id);
      } catch (err) {
        console.error('Failed to suspend game on disconnect:', err);
      }
    } else if (role === 'TEACHER') {
      const classroomId = selectedClassroomId ?? studentClassroomId;
      if (classroomId) {
        try {
          await interruptAllGames(classroomId);
        } catch (err) {
          console.error('Failed to interrupt classroom games on disconnect:', err);
        }
      }
    }

    classroomRef.current?.destroy();
    classroomRef.current = null;
    setConnectionState(ConnectionState.Disconnected);
    setParticipants([]);
    setVideoElements(new Map());
    setStudentJoinInfo('');
    setViewMode('lobby');
    setActiveGameId(null);
    // 教師は教室管理ページに戻る、生徒はロール選択に戻る
    if (role === 'TEACHER') {
      setTeacherPhase('manage');
    } else {
      setRole(null);
      await supabaseSignOut().catch(() => {});
    }
  };

  // 回線復旧: 現在の Room を畳んで同じ識別情報で再接続。viewMode や teacherPhase は維持。
  // 「ユーザー意図」のマイク/カメラ状態は React state を信じて復元する（getter は切断後に false を返すため）。
  const handleReconnect = useCallback(async () => {
    if (!role || isReconnecting) return;
    const wantMic = isMicEnabled;
    const wantCam = isCameraEnabled;
    const identity = role === 'TEACHER'
      ? TEACHER_IDENTITY
      : (studentId ? makeStudentIdentity(studentId) : userName);
    setIsReconnecting(true);
    try {
      // connectLiveKit が内部で旧 Room を destroy → new ClassroomLiveKit → connect する
      setParticipants([]);
      setVideoElements(new Map());
      await connectLiveKit(role, identity, roomName, selectedClassroomId ?? studentClassroomId ?? '');
      const classroom = classroomRef.current;
      if (wantMic && classroom) {
        await classroom.enableMicrophone();
        setIsMicEnabled(true);
      }
      if (wantCam && classroom) {
        await classroom.enableCamera();
        setIsCameraEnabled(true);
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : '回線復旧に失敗しました');
    } finally {
      setIsReconnecting(false);
    }
  }, [role, isReconnecting, isMicEnabled, isCameraEnabled, userName, studentId, roomName, selectedClassroomId, studentClassroomId, connectLiveKit]);

  const saveSettings = () => {
    localStorage.setItem('lk-url', livekitUrl);
    setShowSettings(false);
  };

  // 検討を別ウィンドウに出している間も本体（教室ホーム）は操作できる。
  // そこから授業・詰碁・対局へ移るときは、検討を畳んで生徒にも終了を伝える
  // （伝えないと生徒だけ検討画面に取り残される。全面表示だった頃は起こり得なかった経路）。
  const endReviewIfOpen = useCallback(() => {
    if (role !== 'TEACHER' || viewMode !== 'review') return;
    classroomRef.current?.broadcast({ type: 'REVIEW_END', payload: {} });
    setReviewRootNode(null);
    setReviewCurrentNode(null);
    setReviewMovePermissions([]);
  }, [role, viewMode]);

  // 対局選択
  const handleSelectGame = (gameId: string) => {
    endReviewIfOpen();
    setSyncedDrawings([]);
    setActiveGameId(gameId);
    setViewMode('game');
  };

  // 講師専用の対局別ウィンドウを開く/前面化する（固定ウィンドウ名により、既存ウィンドウがあれば再利用される）。
  const openTeacherGameWindow = useCallback((classroomId: string) => {
    const identity = classroomRef.current?.localIdentity ?? TEACHER_IDENTITY;
    const url = `${window.location.origin}${window.location.pathname}?mode=game&role=TEACHER&teacherClassroomId=${encodeURIComponent(classroomId)}&identity=${encodeURIComponent(identity)}`;
    const win = window.open(url, TEACHER_GAME_WINDOW_NAME, 'width=700,height=800,menubar=no,toolbar=no,location=no,status=no');
    win?.focus();
  }, []);

  // ニギリを対局者の画面にも出す。視覚効果は本来この人たちのためのもの（2026-08-05 三村さん）。
  // 押した時点で結果ごと送り、向こうでも同じ間合いで石が止まる。
  const handleNigiriDraw = useCallback((black: string, white: string) => {
    const me = classroomRef.current?.localIdentity;
    const targets = [black, white].filter(id => id !== me);
    if (targets.length === 0) return;
    void classroomRef.current?.sendTo(
      { type: 'NIGIRI_DRAW', payload: { blackPlayer: black, whitePlayer: white } },
      targets,
    );
  }, []);

  // 対局作成（Supabase insert、Realtime経由で全員に配信）
  const handleCreateGame = async (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock?: import('./types/game').GameClock;
  }) => {
    // 先生自身が対局者（黒/白）なら講師専用の別ウィンドウ（常に1盤表示・手番ローテーション）で開く。
    // ポップアップブロッカー対策のため、await createGame() より前・クリックの同期区間内で呼ぶ。
    // 全画面の対局盤に埋め込むと対局追加など他の操作ができなくなるため、
    // 講師の対局は面数に関わらず別ウィンドウに一本化する（2026-07-14 三村さん指示、07-15 別ウィンドウ方式へ再設計）。
    const me = classroomRef.current?.localIdentity ?? userName;
    if (selectedClassroomId && (identityMatchesPlayer(me, opts.blackPlayer) || identityMatchesPlayer(me, opts.whitePlayer))) {
      openTeacherGameWindow(selectedClassroomId);
    }
    await liveGameList.createGame(opts);
    setShowGameCreation(false);
    setGameCreationBlack(null);
  };

  // 詰碁: 配信
  const handleProblemAssign = (problem: import('./types/problem').Problem) => {
    if (role !== 'TEACHER') return;
    endReviewIfOpen();
    setActiveProblem(problem);
    setProblemResults({});
    setViewMode('problem');
    classroomRef.current?.broadcast({
      type: 'PROBLEM_ASSIGN',
      payload: { problem, targetStudents: [] },
    });
  };

  // 詰碁: 配信終了（先生用）。生徒側にもREVIEW_ENDを送って詰碁モードから戻す。
  const handleProblemMonitorBack = () => {
    setViewMode('lobby');
    setActiveProblem(null);
    classroomRef.current?.broadcast({ type: 'REVIEW_END', payload: {} });
  };

  // SGF読込（ロビーから）
  const handleSgfLoadFromLobby = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      const parsed = parseSGFTree(content);
      const root = convertSgfToGameTree(parsed.root, null, parsed.size, 1, parsed.board);
      setReviewRootNode(root);
      setReviewCurrentNode(root);
      setReviewBoardSize(parsed.size);
      // 検討を開き直したら着手の許可は持ち越さない
      setReviewMovePermissions([]);
      setViewMode('review');

      // 参加者に選ばれている生徒にだけ知らせる。
      // ここを broadcast にしていたため、講師が参加者を選んでも全員の画面が
      // 検討に切り替わっていた（対局中の生徒は対局から引き剥がされる 2026-08-05）。
      void classroomRef.current?.sendToOrAll({
        type: 'REVIEW_START',
        payload: { sgf: content, boardSize: parsed.size },
      }, reviewTargetStudentsRef.current);
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  // 保存された棋譜を検討モードで開く
  const handleSelectSavedGame = useCallback((game: SavedGame) => {
    try {
      const parsed = parseSGFTree(game.sgf);
      const root = convertSgfToGameTree(parsed.root, null, parsed.size, 1, parsed.board);
      setReviewRootNode(root);
      setReviewCurrentNode(root);
      setReviewBoardSize(parsed.size);
      // 検討を開き直したら着手の許可は持ち越さない
      setReviewMovePermissions([]);
      setViewMode('review');

      // 先生が開いた棋譜だけ、選択中の参加者へ共有する。
      // 生徒が自分の履歴を開いた場合は本人の端末内だけで検討する。
      if (role === 'TEACHER') {
        void classroomRef.current?.sendToOrAll({
          type: 'REVIEW_START',
          payload: { sgf: game.sgf, boardSize: parsed.size },
        }, reviewTargetStudentsRef.current);
      }
    } catch {
      alert('棋譜の読み込みに失敗しました');
    }
  }, [role]);

  // 授業モード開始
  const handleStartLecture = () => {
    endReviewIfOpen();
    setViewMode('lecture');
  };

  // ロビーに戻る
  const handleBackToLobby = useCallback(() => {
    // 検討/授業モードから戻るときだけ生徒にセッション終了を通知する。
    // 対局盤から戻るときに送ると、REVIEW_ENDを受けた対局中の生徒の碁盤まで閉じてしまう
    // （先生が対局者として盤を自動オープン→閉じる経路が d976887 で常用になった）。
    if (role === 'TEACHER' && (viewMode === 'review' || viewMode === 'lecture')) {
      classroomRef.current?.broadcast({ type: 'REVIEW_END', payload: {} });
    }
    setViewMode('lobby');
    setActiveGameId(null);
    setReviewMovePermissions([]);
  }, [role, viewMode]);

  // 対局の再開処理
  const handleResumeGame = useCallback(async (gameId: string) => {
    // 先生自身が対局者なら講師専用の別ウィンドウ（対局作成と同じ動線）、それ以外は全画面盤。
    // ポップアップブロッカー対策のため、await resumeLiveGame() より前・クリックの同期区間内で呼ぶ。
    const row = liveGameList.games.find(g => g.id === gameId);
    const me = classroomRef.current?.localIdentity ?? userName;
    const teacherIsParticipant = role === 'TEACHER' && !!row &&
      (identityMatchesPlayer(me, row.black_player) || identityMatchesPlayer(me, row.white_player));
    if (teacherIsParticipant && selectedClassroomId) {
      openTeacherGameWindow(selectedClassroomId);
    }
    try {
      await resumeLiveGame(gameId);
      if (!teacherIsParticipant) {
        setSyncedDrawings([]);
        setActiveGameId(gameId);
        setViewMode('game');
      }
    } catch (e) {
      alert(`対局の再開に失敗しました: ${e}`);
    }
  }, [liveGameList.games, role, userName, selectedClassroomId, openTeacherGameWindow]);

  // 時間切れを講師に即時知らせる。
  // 時間切れで勝負を付けたくない＝基本は講師が再開する運用なので（2026-08-05 三村さん）、
  // 気づかないと対局が止まったままになる。音と、誰が切れたか＋再開ボタンを出す。
  // 画面を開いた時点で既に終わっている分（時間切れ対局は3時間だけ一覧に残る）は鳴らさない。
  const seenTimeoutGamesRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (role !== 'TEACHER') return;
    const timedOut = liveGameList.games.filter(
      g => g.status === 'finished' && isTimeoutResult(g.result),
    );
    if (seenTimeoutGamesRef.current === null) {
      seenTimeoutGamesRef.current = new Set(timedOut.map(g => g.id));
      return;
    }
    const seen = seenTimeoutGamesRef.current;
    for (const g of timedOut) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      const color = timedOutColorFromResult(g.result);
      const identity = color === 'BLACK' ? g.black_player : g.white_player;
      notificationSound.play('timeout');
      pushAlert({ kind: 'timeout', identity, gameId: g.id });
    }

    // 再開したら（どこから再開しても）その知らせは役目を終える
    const stillTimedOut = new Set(timedOut.map(g => g.id));
    for (const g of liveGameList.games) {
      if (g.status !== 'finished') seen.delete(g.id);
    }
    setAlerts(prev => {
      const next = prev.filter(a => a.kind !== 'timeout' || stillTimedOut.has(a.gameId));
      return next.length === prev.length ? prev : next;
    });
  }, [liveGameList.games, role, pushAlert, notificationSound]);

  // 対局終了/中断時に自動的に閉じる（ロビーに戻る）
  useEffect(() => {
    if (!activeGameId) return;
    const currentGame = games.find(g => g.id === activeGameId);
    // 時間切れ終局は先生が「対局を再開する」を押せるよう、先生の画面は自動で閉じない
    if (role === 'TEACHER' && currentGame?.status === 'finished' && isTimeoutResult(currentGame.result)) return;
    if (currentGame && (currentGame.status === 'finished' || currentGame.status === 'interrupted')) {
      // 終局の読み上げ（投了「〇の中押し勝ちです」）を聞き終える余裕を持たせてから閉じる
      const timer = setTimeout(() => {
        handleBackToLobby();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeGameId, games, handleBackToLobby, role]);

  // 生徒のブラウザ閉じ/リロードは keepalive fetch で中断を試みる。
  useEffect(() => {
    if (role !== 'STUDENT') return;
    const myId = classroomRef.current?.localIdentity ?? userName;
    const myActiveGame = games.find(
      g => (g.status === 'playing' || g.status === 'scoring') &&
        (identityMatchesPlayer(myId, g.blackPlayer) || identityMatchesPlayer(myId, g.whitePlayer)),
    );
    if (!myActiveGame) return;

    const handlePageHide = () => interruptGameOnUnload(myActiveGame.id);
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [role, games, userName]);

  // pagehide 中断後に戻ってきた場合は、中断中の同一対局を自動再開する。
  useEffect(() => {
    if (role !== 'STUDENT') return;
    const pendingGameId = getPendingResumeGameId();
    if (!pendingGameId) return;

    const myId = classroomRef.current?.localIdentity ?? userName;
    const pendingGame = games.find(
      g => g.id === pendingGameId &&
        g.status === 'interrupted' &&
        (identityMatchesPlayer(myId, g.blackPlayer) || identityMatchesPlayer(myId, g.whitePlayer)),
    );
    if (!pendingGame) return;

    clearPendingResumeGameId();
    void resumeLiveGame(pendingGame.id).catch((err) => {
      console.error('Failed to resume pending interrupted game:', err);
    });
  }, [role, games, userName]);

  // 音声制御（先生用）
  const handleToggleHear = (identity: string) => {
    setAudioPermissions(prev => {
      const current = prev[identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
      const updated = { ...prev, [identity]: { ...current, canHear: !current.canHear } };
      classroomRef.current?.sendTo(
        { type: 'AUDIO_CONTROL', payload: { canHear: !current.canHear } },
        [identity]
      );
      return updated;
    });
  };

  const handleToggleStudentMic = (identity: string) => {
    setAudioPermissions(prev => {
      const current = prev[identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
      const updated = { ...prev, [identity]: { ...current, micAllowed: !current.micAllowed } };
      classroomRef.current?.sendTo(
        { type: 'MEDIA_CONTROL', payload: { micAllowed: !current.micAllowed, cameraAllowed: current.cameraAllowed } },
        [identity]
      );
      return updated;
    });
  };

  const handleClearAudioM = async () => {
    if (!classroomRef.current || !classroomRef.current.isConnected) return;
    try {
      setAudioDebug(prev => prev + ' [先生音声状態リセット]');
      await classroomRef.current.room.localParticipant.setMicrophoneEnabled(true);
      setIsMicEnabled(true);
      setIsMuted(false);
    } catch (err) {
      console.error('Clear audio M error:', err);
    }
  };

  const handleClearAudioS = () => {
    if (!classroomRef.current || !classroomRef.current.isConnected) return;
    setAudioDebug(prev => prev + ' [生徒音声状態リセット]');
    const remoteIdentities = classroomRef.current.remoteIdentities;
    if (remoteIdentities.length === 0) return;

    setAudioPermissions(prev => {
      const next = { ...prev };
      remoteIdentities.forEach(identity => {
        next[identity] = { canHear: true, micAllowed: true, cameraAllowed: true };
        classroomRef.current?.sendTo(
          { type: 'MEDIA_CONTROL', payload: { micAllowed: true, cameraAllowed: true } },
          [identity]
        );
        classroomRef.current?.sendTo(
          { type: 'AUDIO_CONTROL', payload: { canHear: true } },
          [identity]
        );
      });
      return next;
    });
  };

  // --- 別タブ対局専用モード ---
  const params = new URLSearchParams(window.location.search);
  const isDedicatedGameMode = params.get('mode') === 'game';
  const paramGameId = params.get('gameId');
  // 生徒招待リンクの `classroomId` パラメータと衝突しないよう別名にする
  // （既存の初期化useEffectが `classroomId` を見て生徒セッション扱いし、URLをreplaceStateで消してしまうため）。
  const paramClassroomId = params.get('teacherClassroomId');
  const paramIdentity = params.get('identity');
  const paramRole = params.get('role');

  // 講師用: 教師が持つ全対局をこのウィンドウ単体で購読し、常に1盤だけ表示（手番になるたびに自動切替）。
  // fixed inset-0 で #root の padding(2rem) をバイパスし、ウィンドウのビューポートに正確に一致させる
  // （h-screen + #root paddingだと必ずビューポートをはみ出しスクロールバーが出ていた）。
  if (isDedicatedGameMode && paramRole === 'TEACHER' && paramClassroomId && paramIdentity) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <ErrorBoundary label="対局ウィンドウ">
        <TeacherGameWindow
          classroomId={paramClassroomId}
          teacherIdentity={decodeURIComponent(paramIdentity)}
          students={students}
        />
        </ErrorBoundary>
      </div>
    );
  }

  // 生徒用: 単一対局のみ表示（変更なし）。
  if (isDedicatedGameMode && paramGameId && paramIdentity) {
    const isTeacherRole = paramRole === 'TEACHER';
    return (
      <div className="fixed inset-0 bg-ground text-ink p-1 overflow-hidden">
        <ErrorBoundary label="対局盤">
          <GameBoard
            gameId={paramGameId}
            myIdentity={decodeURIComponent(paramIdentity)}
            isTeacher={isTeacherRole}
            students={students}
          />
        </ErrorBoundary>
      </div>
    );
  }

  // --- 設定モーダル ---
  if (showSettings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <div className="glass-panel p-8 w-full max-w-lg space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="w-6 h-6" /> LiveKit設定
            </h2>
            <button onClick={() => setShowSettings(false)} className="text-muted hover:text-ink text-xl">&times;</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1">LiveKitサーバーURL</label>
              <input type="text" value={livekitUrl} onChange={e => setLivekitUrl(e.target.value)}
                placeholder="wss://your-app.livekit.cloud"
                className="w-full bg-ink/5 border border-field-line rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">ルーム名</label>
              <input type="text" value={roomName} onChange={e => setRoomName(e.target.value)}
                placeholder="go-classroom"
                className="w-full bg-ink/5 border border-field-line rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
            </div>
          </div>

          <button onClick={saveSettings} className="premium-button w-full">設定を保存</button>
          <p className="text-xs text-muted/75 text-center">設定はブラウザのlocalStorageに保存されます</p>
        </div>
      </div>
    );
  }

  // --- ログイン画面 ---
  if (!role) {
    return (
      <>
        <LoginScreen
          prefilledClassroomId={prefilledClassroomId}
          onStudentLogin={(sid, cid, rawCode, displayName) => {
            // Supabase Session は LoginScreen 側で確立済み（失敗時はここに来ない）
            localStorage.setItem('go-school-last-role', 'STUDENT');
            localStorage.setItem('go-school-last-student-id', sid);
            localStorage.setItem('go-school-last-student-code', rawCode || sid);
            localStorage.setItem('go-school-last-student-classroom-id', cid);
            localStorage.setItem('go-school-last-student-name', displayName || sid);

            setStudentId(sid);
            setRawStudentCode(rawCode || sid);
            setStudentClassroomId(cid);
            setRoomName(`go-${cid}`);
            setUserName(displayName || sid); // 実名を表示名に
            setRole('STUDENT');
          }}
          onTeacherLogin={() => {
            setRole('TEACHER');
            setTeacherPhase('manage');
          }}
        />
        {/* LiveKit設定ダイアログ */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="glass-panel p-6 w-full max-w-lg space-y-4">
              <h2 className="text-xl font-bold">LiveKit設定</h2>
              <div>
                <label className="block text-sm text-muted mb-1">LiveKit URL</label>
                <input value={livekitUrl} onChange={e => setLivekitUrl(e.target.value)} className="w-full bg-ink/5 border border-field-line rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
              </div>

              <div className="flex gap-3">
                <button onClick={saveSettings} className="premium-button flex-1">保存</button>
                <button onClick={() => setShowSettings(false)} className="secondary-button flex-1">キャンセル</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // --- 生徒接続画面 ---
  if (role === 'STUDENT' && connectionState !== ConnectionState.Connected) {
    const hasCredentials = !!(livekitUrl && roomName);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <div
          className="glass-panel p-8 w-full max-w-lg space-y-6 border-accent/40"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.10))',
          }}
        >
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-accent-text uppercase tracking-wider">接続先</p>
            <h2 className="text-2xl font-bold text-ink">
              {currentClassroomName || '教室'}
            </h2>
            {currentStudentName && (
              <p className="text-sm text-ink">{currentStudentName} さん</p>
            )}
          </div>

          {connectionState === ConnectionState.Connecting ? (
            <div className="text-center text-accent-text">接続中...</div>
          ) : connectionError ? (
            <div className="space-y-4">
              <div className="text-alert-text text-sm bg-alert/10 px-3 py-2 rounded-lg">{connectionError}</div>
              <button
                onClick={() => {
                  setConnectionError('');
                  if (studentId) connectLiveKit('STUDENT', makeStudentIdentity(studentId));
                }}
                className="secondary-button w-full"
              >
                再接続
              </button>
            </div>
          ) : !hasCredentials ? (
            <div className="text-center text-muted space-y-4">
              <p>接続情報がありません</p>
              <p className="text-xs text-muted/75">先生がまだ教室を開いていない可能性があります</p>
            </div>
          ) : (
            <div className="text-center text-muted">準備中...</div>
          )}

          <button onClick={handleDisconnect} className="text-muted/75 hover:text-muted text-sm w-full text-center">
            戻る
          </button>
        </div>
      </div>
    );
  }

  // --- 教師: 教室管理ページ ---
  if (role === 'TEACHER' && teacherPhase === 'manage') {
    return (
      <>
        <ClassroomManager
          students={students}
          classrooms={classrooms}
          onLaunchClassroom={(launchClassroomId) => {
            if (!livekitUrl) {
              setShowSettings(true);
              return;
            }
            setSelectedClassroomId(launchClassroomId);
            // リロード復元用に最後に開いた教室を記憶
            try { localStorage.setItem('go-school-last-classroom', launchClassroomId); } catch { /* noop */ }
            const newRoomName = `go-${launchClassroomId}`;
            setRoomName(newRoomName);
            setTeacherPhase('classroom');
            connectLiveKit('TEACHER', TEACHER_IDENTITY, newRoomName, launchClassroomId);
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStudentManager={() => setShowStudentManager(true)}
          onReloadData={reloadClassroomData}
          onBack={() => {
            // 明示ログアウト: セッションを切り、教室復元も解除
            try { localStorage.removeItem('go-school-last-classroom'); } catch { /* noop */ }
            void supabaseSignOut();
            setRole(null);
          }}
        />
      </>
    );
  }

  // --- メイン教室ビュー ---
  const isConnected = connectionState === ConnectionState.Connected;

  // 生徒が対局中なら自動的にゲーム画面に遷移
  const myIdentityForGame = classroomRef.current?.localIdentity || userName;
  const myGame = role === 'STUDENT'
    ? games.find(
        (g) =>
          (g.status === 'playing' || g.status === 'scoring') &&
          (identityMatchesPlayer(myIdentityForGame, g.blackPlayer) || identityMatchesPlayer(myIdentityForGame, g.whitePlayer)),
      )
    : null;
  const myPlayingGame = myGame?.status === 'playing' ? myGame : null;

  if (myPlayingGame && autoOpenedGameId !== myPlayingGame.id) {
    setAutoOpenedGameId(myPlayingGame.id);
    setSyncedDrawings([]);
    setActiveGameId(myPlayingGame.id);
    setViewMode('game');
  } else if (!myPlayingGame && autoOpenedGameId !== null) {
    setAutoOpenedGameId(null);
  }

  // 生徒の自動ビュー判定
  const effectiveViewMode = resolveEffectiveViewMode(role, viewMode, !!syncedNode);

  // 先生の検討は別ウィンドウに出す。IGC と同じく、検討中も教室ホームで生徒の
  // マイク入切・参加者の追加ができるようにするため（2026-08-04 三村さんの選択）。
  // ポップアップを塞がれている場合だけ、従来どおり全面オーバーレイに落とす。
  const reviewInWindow =
    role === 'TEACHER' && effectiveViewMode === 'review' && !reviewWindowBlocked;
  // 別ウィンドウに出ている間、本体は教室ホームを表示する
  const mainViewMode: typeof effectiveViewMode = reviewInWindow ? 'lobby' : effectiveViewMode;

  const isBoardFocusMode =
    mainViewMode === 'game' ||
    mainViewMode === 'review' ||
    mainViewMode === 'problem';

  return (
    <div className="flex flex-col gap-4 w-full h-screen overflow-hidden">
      {/* ヘッダー */}
      {!isBoardFocusMode && (
        <Header
          role={role}
          classroom={classroomRef.current}
          userName={role === 'TEACHER' ? getTeacherDisplayName() : userName}
          connectionState={connectionState}
          remoteCount={classroomRef.current?.remoteParticipantCount ?? 0}
          isMicEnabled={isMicEnabled}
          onToggleMic={handleToggleMic}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          isCameraEnabled={isCameraEnabled}
          onToggleCamera={handleToggleCamera}
          onDisconnect={handleDisconnect}
        />
      )}

      {/* ビデオタイル（教師ロビー時はTeacherDashboard内に表示） */}
      {!isBoardFocusMode && videoElements.size > 0 && !(role === 'TEACHER' && mainViewMode === 'lobby') && (
        <VideoTiles
          videoElements={videoElements}
          localIdentity={classroomRef.current?.localIdentity ?? ''}
          participants={participants}
          students={students}
        />
      )}

      {/* 接続エラー */}
      {!isBoardFocusMode && connectionError && (
        <div className="bg-alert/15 border border-alert/35 text-alert-text px-4 py-2 rounded-xl text-sm">
          {connectionError}
        </div>
      )}

      {/* オーディオデバッグ */}
      {!isBoardFocusMode && audioDebug && (
        <div className="bg-accent/15 border border-accent/35 text-accent-text px-4 py-2 rounded-xl text-sm flex items-center gap-3">
          <span className="flex-1 text-xs">
            {import.meta.env.DEV ? audioDebug : '音声が聞こえない場合は「音声を開始」を押してください'}
          </span>
          <button
            onClick={async () => {
              try {
                await classroomRef.current?.room.startAudio();
                document.querySelectorAll('audio').forEach(el => {
                  (el as HTMLAudioElement).muted = false;
                  (el as HTMLAudioElement).volume = 1;
                  (el as HTMLAudioElement).play().catch(() => {});
                });
                setAudioDebug(prev => prev + ' [音声開始]');
              } catch (e) {
                setAudioDebug(prev => prev + ` [エラー: ${e}]`);
              }
            }}
            className="px-3 py-1 bg-accent hover:bg-accent/85 text-accent-ink font-bold rounded-lg text-xs whitespace-nowrap transition-colors duration-150"
          >
            音声を開始
          </button>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* ロビー: 教師はTeacherDashboard、生徒はLobby */}
        {mainViewMode === 'lobby' && role === 'TEACHER' && (
          <TeacherDashboard
            participants={participants}
            classroom={classroomRef.current}
            localIdentity={classroomRef.current?.localIdentity ?? ''}
            students={students}
            classrooms={classrooms}
            selectedClassroomId={selectedClassroomId}
            onSelectClassroom={setSelectedClassroomId}
            games={games}
            liveGames={liveGameList.games}
            audioPermissions={audioPermissions}
            onToggleHear={handleToggleHear}
            onToggleMic={handleToggleStudentMic}
            chatMessages={chat.messages}
            onChatSend={chat.sendMessage}
            videoElements={videoElements}
            studentJoinInfo={studentJoinInfo}
            onCreateGame={() => { setGameCreationBlack(null); setShowGameCreation(true); }}
            onStartGameWithStudent={(identity) => { setGameCreationBlack(identity); setShowGameCreation(true); }}
            onStartLecture={handleStartLecture}
            onLoadSgf={handleSgfLoadFromLobby}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            isReconnecting={isReconnecting}
            onOpenStudentManager={() => setShowStudentManager(true)}
            onReloadData={reloadClassroomData}
            onCreateGames={async (pairs) => {
              const me = classroomRef.current?.localIdentity ?? userName;
              if (
                selectedClassroomId &&
                pairs.some(p => identityMatchesPlayer(me, p.blackPlayer) || identityMatchesPlayer(me, p.whitePlayer))
              ) {
                openTeacherGameWindow(selectedClassroomId);
              }
              for (const p of pairs) {
                await liveGameList.createGame(p);
              }
            }}
            onProblemAssign={handleProblemAssign}
            onClearAudioM={handleClearAudioM}
            onClearAudioS={handleClearAudioS}
            onClearSharing={() => setReviewTargetStudents(null)}
            sharingTargets={reviewTargetStudents}
            onToggleSharing={toggleSharingStudent}
            onSelectSavedGame={handleSelectSavedGame}
            onResumeGame={handleResumeGame}
            onOpenTeacherGameWindow={() => selectedClassroomId && openTeacherGameWindow(selectedClassroomId)}
          />
        )}

        {mainViewMode === 'lobby' && role === 'STUDENT' && (
          <Lobby
            role={role}
            participants={participants}
            localIdentity={classroomRef.current?.localIdentity ?? ''}
            activeSpeakers={activeSpeakers}
            games={games}
            studentJoinInfo={studentJoinInfo}
            onSelectGame={handleSelectGame}
            myIdentity={classroomRef.current?.localIdentity ?? userName}
            students={students}
            classrooms={classrooms}
            selectedClassroomId={selectedClassroomId}
            onSelectClassroom={setSelectedClassroomId}
            currentClassroomName={currentClassroomName}
            currentStudentName={currentStudentName}
            chatMessages={chat.messages}
            onChatSend={chat.sendMessage}
            onResumeGame={handleResumeGame}
            onSelectSavedGame={handleSelectSavedGame}
          />
        )}

        {/* 対局画面 */}
        {mainViewMode === 'game' && activeGameId && (
          <div className="fixed inset-0 z-50 bg-ground overflow-y-auto p-2 sm:p-4"><ErrorBoundary label="この画面">
            <GameBoard
              gameId={activeGameId}
              myIdentity={classroomRef.current?.localIdentity ?? userName}
              isTeacher={role === 'TEACHER'}
              onBack={handleBackToLobby}
              onMoveSubmitted={undefined}
              classroom={classroomRef.current}
              students={students}
              syncedDrawings={syncedDrawings}
            />
          </ErrorBoundary>
          </div>
        )}

        {/* 授業モード */}
        {mainViewMode === 'lecture' && (
          <LectureBoard
            isTeacher={role === 'TEACHER'}
            classroomRef={classroomRef}
            userName={userName}
            onBack={role === 'TEACHER' ? handleBackToLobby : undefined}
            syncedNode={syncedNode || undefined}
            syncedBoardSize={syncedBoardSize}
            teacherCursor={teacherCursor}
            syncedDrawings={syncedDrawings}
            participants={participants}
            students={students}
            localIdentity={classroomRef.current?.localIdentity ?? ''}
            chatMessages={chat.messages}
            onChatSend={chat.sendMessage}
          />
        )}

        {/* 検討モード。先生は別ウィンドウ、生徒とポップアップを塞がれている場合は全面表示 */}
        {effectiveViewMode === 'review' && reviewRootNode && reviewCurrentNode && (() => {
          const reviewBoard = (
            <ErrorBoundary label="検討画面">
              <ReviewBoard
                rootNode={reviewRootNode}
                currentNode={reviewCurrentNode}
                boardSize={reviewBoardSize}
                onSetCurrentNode={setReviewCurrentNode}
                isTeacher={role === 'TEACHER'}
                classroomRef={classroomRef}
                participants={participants}
                localIdentity={classroomRef.current?.localIdentity ?? ''}
                targetStudents={reviewTargetStudents}
                onSetTargetStudents={setReviewTargetStudents}
                onBack={handleBackToLobby}
                movePermissions={reviewMovePermissions}
                onToggleMovePermission={role === 'TEACHER' ? toggleReviewMovePermission : undefined}
                canPlay={role === 'STUDENT' && reviewCanPlay}
                onStudentMove={handleStudentReviewMove}
                registeredStudents={students}
                chatMessages={chat.messages}
                onChatSend={chat.sendMessage}
                syncedAiAnalysis={syncedAiAnalysis}
              />
            </ErrorBoundary>
          );
          return reviewInWindow ? (
            <PopupPortal
              name={TEACHER_REVIEW_WINDOW_NAME}
              title="検討 — 三村囲碁オンライン"
              className="w-full h-screen overflow-y-auto lg:overflow-hidden bg-ground p-2 sm:p-4"
              onClose={handleBackToLobby}
              onBlocked={() => setReviewWindowBlocked(true)}
            >
              {reviewBoard}
            </PopupPortal>
          ) : (
            <div
              className="fixed inset-0 z-50 bg-ground overflow-y-auto lg:overflow-hidden p-2 sm:p-4"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            >
              {reviewBoard}
            </div>
          );
        })()}

        {/* 詰碁モード: 先生は一緒に解くのではなく、生徒の解答状況を見るモニター画面 */}
        {mainViewMode === 'problem' && activeProblem && role === 'TEACHER' && (
          <div className="fixed inset-0 z-50 bg-ground overflow-y-auto p-2 sm:p-4"><ErrorBoundary label="この画面">
            <ProblemMonitorPanel
              problem={activeProblem}
              students={students}
              participants={participants}
              results={problemResults}
              localIdentity={classroomRef.current?.localIdentity ?? TEACHER_IDENTITY}
              onBack={handleProblemMonitorBack}
            />
          </ErrorBoundary>
          </div>
        )}

        {/* 詰碁モード（生徒） */}
        {mainViewMode === 'problem' && activeProblem && role === 'STUDENT' && (
          <div className="fixed inset-0 z-50 bg-ground overflow-y-auto p-2 sm:p-4"><ErrorBoundary label="この画面">
            <ProblemBoard
              problem={activeProblem}
              onBack={() => {
                setViewMode('lobby');
                setActiveProblem(null);
              }}
              onResult={(result, moveCount) => {
                classroomRef.current?.broadcast({
                  type: 'PROBLEM_RESULT',
                  payload: {
                    problemId: activeProblem.id,
                    result,
                    moveCount,
                  },
                });
              }}
            />
          </ErrorBoundary>
          </div>
        )}
      </div>

      {/* 先生用: 音声映像制御パネル（ロビー以外のviewMode時に表示 — ロビーはTeacherDashboardのStudentTableで制御） */}
      {role === 'TEACHER' && isConnected && !isBoardFocusMode && effectiveViewMode !== 'lobby' && participants.length > 1 && (
        <div className="glass-panel p-4 space-y-3">
          <h3 className="font-bold text-sm">音声・映像制御</h3>
          <MediaControlPanel
            participants={participants}
            localIdentity={classroomRef.current?.localIdentity ?? ''}
            audioPermissions={audioPermissions}
            onToggleHear={handleToggleHear}
            onToggleMic={handleToggleStudentMic}
          />
        </div>
      )}

      {/* 対局作成ダイアログ */}
      {showGameCreation && role === 'TEACHER' && (
        <GameCreationDialog
          students={participants.filter(p => p.identity !== (classroomRef.current?.localIdentity ?? '')).map(p => p.identity)}
          teacherName={classroomRef.current?.localIdentity || TEACHER_IDENTITY}
          onClose={() => { setShowGameCreation(false); setGameCreationBlack(null); }}
          onCreate={handleCreateGame}
          registeredStudents={students}
          initialBlackPlayer={gameCreationBlack ?? undefined}
          onNigiriDraw={handleNigiriDraw}
        />
      )}

      {/* 講師への即時通知（接続切れ・時間切れ） */}
      {role === 'TEACHER' && (
        <ClassroomAlerts
          alerts={alerts}
          students={students}
          onDismiss={dismissAlert}
          onResumeGame={handleResumeGame}
        />
      )}

      {/* ニギリ（対局者の画面）。先生が引き直すたびに作り直す */}
      {nigiriDraw && (
        <NigiriAnnouncement
          key={nigiriDraw.drawId}
          iAmBlack={nigiriDraw.iAmBlack}
          opponentName={getDisplayName(nigiriDraw.opponent, students)}
          onDone={() => setNigiriDraw(null)}
        />
      )}

      {/* 生徒・教室管理モーダル */}
      {showStudentManager && (
        <StudentManager
          students={students}
          classrooms={classrooms}
          onDataChanged={reloadClassroomData}
          onClose={() => setShowStudentManager(false)}
        />
      )}
    </div>
  );
}

export default App;
