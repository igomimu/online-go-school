import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Drawing } from './components/GoBoard';
import type { GameNode } from './utils/treeUtilsV2';
import { convertSgfToGameTree } from './utils/treeUtilsV2';
import { parseSGFTree } from './utils/sgfUtils';
import { ClassroomLiveKit } from './utils/classroomLiveKit';
import type { Role, ClassroomMessage, ParticipantInfo, VideoTrackInfo } from './utils/classroomLiveKit';
import type { ViewMode, GameSession, AudioPermissions } from './types/game';
import type { Student, Classroom } from './types/classroom';
import { fetchToken } from './utils/livekitToken';
import { makeStudentIdentity } from './utils/identityUtils';
import { ConnectionState } from 'livekit-client';
import { useLiveGameList } from './hooks/useLiveGameList';
import { liveRowToSession } from './utils/liveGameApi';
import { loadStudents, loadClassrooms } from './utils/classroomStore';
import { saveAccount, supabaseSignOut, loadAccounts } from './utils/authStore';

import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import GameCreationDialog from './components/GameCreationDialog';
import LectureBoard from './components/LectureBoard';
import ReviewBoard from './components/ReviewBoard';
import MediaControlPanel from './components/MediaControlPanel';
import VideoTiles from './components/VideoTiles';
import StudentManager from './components/StudentManager';
import TeacherDashboard from './components/teacher/TeacherDashboard';
import ClassroomManager from './components/teacher/ClassroomManager';
import ProblemBoard from './components/ProblemBoard';
import { useChat } from './hooks/useChat';
import { useNotificationSound } from './hooks/useNotificationSound';
import type { ChatMessagePayload } from './types/chat';

import { Settings } from 'lucide-react';

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
  const [showGameCreation, setShowGameCreation] = useState(false);
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

  // 検討モード用
  const [reviewRootNode, setReviewRootNode] = useState<GameNode | null>(null);
  const [reviewCurrentNode, setReviewCurrentNode] = useState<GameNode | null>(null);
  const [reviewBoardSize, setReviewBoardSize] = useState(19);
  const [reviewTargetStudents, setReviewTargetStudents] = useState<string[]>([]);

  // 詰碁モード用
  const [activeProblem, setActiveProblem] = useState<import('./types/problem').Problem | null>(null);

  // オーディオデバッグ
  const [audioDebug, setAudioDebug] = useState('');

  // 生徒・教室データ
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [classrooms, setClassrooms] = useState<Classroom[]>(() => loadClassrooms());
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [showStudentManager, setShowStudentManager] = useState(false);

  // 生徒ID認証
  const [studentId, setStudentId] = useState<string | null>(null);
  // 教室ID（ログイン画面 or URLパラメータから）
  const [studentClassroomId, setStudentClassroomId] = useState<string | null>(null);
  // URLから事前設定された教室ID
  const [prefilledClassroomId, setPrefilledClassroomId] = useState<string | undefined>(undefined);

  // 生徒自動接続の重複防止
  const studentAutoConnectRef = useRef(false);

  const reloadClassroomData = useCallback(() => {
    setStudents(loadStudents());
    setClassrooms(loadClassrooms());
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

  // 旧GameSession形に変換（ロビー/サムネイル等の既存コンポーネント互換）
  // 注意: boardState/moveNumber はプレースホルダ。実盤面は useLiveGame 経由で取得
  const games = useMemo(
    () => liveGameList.games.map(liveRowToSession),
    [liveGameList.games],
  );

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
    return acct?.studentName || studentId;
  }, [role, studentId]);

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
            id: 'synced',
            parent: null,
            children: [],
            board: p.boardState,
            nextNumber: (p.moveNumber ?? 0) + 1,
            activeColor: p.nextColor === 'BLACK' ? 'WHITE' : 'BLACK',
            boardSize: p.boardSize,
            markers: p.markers || [],
          };
          setSyncedBoardSize(p.boardSize);
          setSyncedNode(dummyNode);
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

        // 検討モード開始（生徒用）
        if (msg.type === 'REVIEW_START' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as { sgf: string; boardSize: number };
          const parsed = parseSGFTree(p.sgf);
          const root = convertSgfToGameTree(parsed.root, null, p.boardSize, 1, parsed.board);
          setReviewRootNode(root);
          setReviewCurrentNode(root);
          setReviewBoardSize(p.boardSize);
          setViewMode('review');
        }
        // 詰碁配信（生徒用）
        if (msg.type === 'PROBLEM_ASSIGN' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as import('./types/problem').ProblemAssignPayload;
          setActiveProblem(p.problem);
          setViewMode('problem');
        }

        if (msg.type === 'REVIEW_END' && connectRole === 'STUDENT') {
          // 先生がロビーに戻った: 検討/授業/詰碁の全セッション状態をクリア
          setViewMode('lobby');
          setReviewRootNode(null);
          setReviewCurrentNode(null);
          setSyncedNode(null);
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
      onParticipantJoined: () => {
        notificationSound.play('connect');
      },
      onParticipantLeft: () => {
        notificationSound.play('disconnect');
      },
      onParticipantsChanged: (p: ParticipantInfo[]) => {
        setParticipants(p);
      },
      onConnectionStateChanged: (state: ConnectionState) => {
        setConnectionState(state);
        // 生徒接続成功時にアカウントを保存
        if (state === ConnectionState.Connected && connectRole === 'STUDENT' && studentId && studentClassroomId) {
          saveAccount(studentId, studentClassroomId);
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
  }, [roomName, livekitUrl, studentId, studentClassroomId, selectedClassroomId]);

  // URL params for student auto-join
  useEffect(() => {
    // 起動時に既存の古い/壊れた認証セッションを強制クリア（ゾンビセッション対策）
    void supabaseSignOut();

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
        if (urlStudentName) setUserName(decodeURIComponent(urlStudentName));
      }
      if (urlClassroomId) setStudentClassroomId(urlClassroomId);
      setRole('STUDENT');
    }

    if (urlClassroomId || urlLkUrl || urlToken) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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

  // キーボードナビゲーション（レビューモード用）
  useEffect(() => {
    if (viewMode !== 'review' || !reviewCurrentNode || role !== 'TEACHER') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (reviewCurrentNode.parent) setReviewCurrentNode(reviewCurrentNode.parent);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (reviewCurrentNode.children.length > 0) setReviewCurrentNode(reviewCurrentNode.children[0]);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, reviewCurrentNode, role]);

  // 検討モード: currentNode変更時に碁盤同期
  useEffect(() => {
    if (role !== 'TEACHER' || viewMode !== 'review' || !reviewCurrentNode) return;
    if (!classroomRef.current?.isConnected) return;
    const node = reviewCurrentNode;
    const nextColor = node.move
      ? (node.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
      : 'BLACK';
    classroomRef.current.broadcast({
      type: 'BOARD_UPDATE',
      payload: {
        boardState: node.board,
        boardSize: reviewBoardSize,
        nextColor,
        markers: node.markers,
        moveNumber: node.move ? node.nextNumber - 1 : 0,
      },
    });
  }, [reviewCurrentNode, role, viewMode, reviewBoardSize]);

  // 音声操作
  const handleToggleMic = async () => {
    if (!classroomRef.current?.isConnected) return;
    try {
      const enabled = await classroomRef.current.toggleMicrophone();
      setIsMicEnabled(enabled);
    } catch (err) {
      setAudioDebug(`マイクエラー: ${err instanceof Error ? err.message : String(err)}`);
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
    if (!classroomRef.current?.isConnected) return;
    try {
      const enabled = await classroomRef.current.toggleCamera();
      setIsCameraEnabled(enabled);
    } catch (err) {
      setAudioDebug(`カメラエラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDisconnect = () => {
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
      void supabaseSignOut();
    }
  };

  // 回線復旧: 現在の Room を畳んで同じ識別情報で再接続。viewMode や teacherPhase は維持。
  // 「ユーザー意図」のマイク/カメラ状態は React state を信じて復元する（getter は切断後に false を返すため）。
  const handleReconnect = useCallback(async () => {
    if (!role || isReconnecting) return;
    const wantMic = isMicEnabled;
    const wantCam = isCameraEnabled;
    const identity = role === 'TEACHER'
      ? (userName.trim() || 'teacher')
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

  // 対局選択
  const handleSelectGame = (gameId: string) => {
    setActiveGameId(gameId);
    setViewMode('game');
  };

  // 対局作成（Supabase insert、Realtime経由で全員に配信）
  const handleCreateGame = async (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock?: import('./types/game').GameClock;
  }) => {
    await liveGameList.createGame(opts);
    setShowGameCreation(false);
  };

  // 詰碁: 配信
  const handleProblemAssign = (problem: import('./types/problem').Problem) => {
    if (role !== 'TEACHER') return;
    setActiveProblem(problem);
    setViewMode('problem');
    classroomRef.current?.broadcast({
      type: 'PROBLEM_ASSIGN',
      payload: { problem, targetStudents: [] },
    });
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
      setViewMode('review');

      // 生徒にも通知
      classroomRef.current?.broadcast({
        type: 'REVIEW_START',
        payload: { sgf: content, boardSize: parsed.size },
      });
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  // 授業モード開始
  const handleStartLecture = () => {
    setViewMode('lecture');
  };

  // ロビーに戻る
  const handleBackToLobby = () => {
    setViewMode('lobby');
    setActiveGameId(null);
    // 検討/授業モードなら生徒にも通知
    if (role === 'TEACHER') {
      classroomRef.current?.broadcast({ type: 'REVIEW_END', payload: {} });
    }
  };

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

  const handleResetVideo = useCallback(async () => {
    if (!classroomRef.current || !classroomRef.current.isConnected) return;
    try {
      setAudioDebug(prev => prev + ' [ビデオリセット開始]');
      await classroomRef.current.room.localParticipant.setCameraEnabled(false);
      setIsCameraEnabled(false);
      await new Promise(resolve => setTimeout(resolve, 500));
      await classroomRef.current.room.localParticipant.setCameraEnabled(true);
      setIsCameraEnabled(true);
      setAudioDebug(prev => prev + ' [ビデオリセット成功]');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAudioDebug(prev => prev + ` [ビデオリセットエラー: ${msg}]`);
    }
  }, []);

  // --- 別タブ対局専用モード ---
  const params = new URLSearchParams(window.location.search);
  const isDedicatedGameMode = params.get('mode') === 'game';
  const paramGameId = params.get('gameId');
  const paramIdentity = params.get('identity');
  const paramRole = params.get('role');

  if (isDedicatedGameMode && paramGameId && paramIdentity) {
    const isTeacherRole = paramRole === 'TEACHER';
    return (
      <div className="w-full h-screen bg-zinc-950 text-white p-4 overflow-y-auto">
        <GameBoard
          gameId={paramGameId}
          myIdentity={decodeURIComponent(paramIdentity)}
          isTeacher={isTeacherRole}
        />
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
            <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white text-xl">&times;</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">LiveKitサーバーURL</label>
              <input type="text" value={livekitUrl} onChange={e => setLivekitUrl(e.target.value)}
                placeholder="wss://your-app.livekit.cloud"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">ルーム名</label>
              <input type="text" value={roomName} onChange={e => setRoomName(e.target.value)}
                placeholder="go-classroom"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <button onClick={saveSettings} className="premium-button w-full">設定を保存</button>
          <p className="text-xs text-zinc-600 text-center">設定はブラウザのlocalStorageに保存されます</p>
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
          onStudentLogin={(sid, cid) => {
            // Supabase Session は LoginScreen 側で確立済み（失敗時はここに来ない）
            setStudentId(sid);
            setStudentClassroomId(cid);
            setRoomName(`go-${cid}`);
            setUserName(sid); // 先生側で名前解決されるまでIDを表示名に
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
                <label className="block text-sm text-zinc-400 mb-1">LiveKit URL</label>
                <input value={livekitUrl} onChange={e => setLivekitUrl(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
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
          className="glass-panel p-8 w-full max-w-lg space-y-6 border-blue-400/40"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.10))',
          }}
        >
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-blue-300 uppercase tracking-wider">接続先</p>
            <h2 className="text-2xl font-bold text-white">
              {currentClassroomName || '教室'}
            </h2>
            {currentStudentName && (
              <p className="text-sm text-zinc-300">{currentStudentName} さん</p>
            )}
          </div>

          {connectionState === ConnectionState.Connecting ? (
            <div className="text-center text-blue-400">接続中...</div>
          ) : connectionError ? (
            <div className="space-y-4">
              <div className="text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">{connectionError}</div>
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
            <div className="text-center text-zinc-400 space-y-4">
              <p>接続情報がありません</p>
              <p className="text-xs text-zinc-600">先生がまだ教室を開いていない可能性があります</p>
            </div>
          ) : (
            <div className="text-center text-zinc-400">準備中...</div>
          )}

          <button onClick={handleDisconnect} className="text-zinc-600 hover:text-zinc-400 text-sm w-full text-center">
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
            const newRoomName = `go-${launchClassroomId}`;
            setRoomName(newRoomName);
            setTeacherPhase('classroom');
            connectLiveKit('TEACHER', userName.trim() || 'teacher', newRoomName, launchClassroomId);
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStudentManager={() => setShowStudentManager(true)}
          onReloadData={reloadClassroomData}
          onBack={() => setRole(null)}
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
          (g.blackPlayer === myIdentityForGame || g.whitePlayer === myIdentityForGame),
      )
    : null;

  // 生徒の自動ビュー判定
  const effectiveViewMode: ViewMode = (() => {
    if (role === 'STUDENT') {
      if (syncedNode && viewMode !== 'game') return 'lecture';
      if (myGame && viewMode === 'lobby') return 'lobby'; // ロビーに留まる（ボタンで遷移）
    }
    return viewMode;
  })();

  // アクティブなゲーム
  const activeGame: GameSession | undefined = activeGameId
    ? games.find(g => g.id === activeGameId)
    : undefined;

  return (
    <div className="flex flex-col gap-4 w-full h-screen overflow-hidden">
      {/* ヘッダー */}
      <Header
        role={role}
        userName={userName}
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

      {/* ビデオタイル（教師ロビー時はTeacherDashboard内に表示） */}
      {videoElements.size > 0 && !(role === 'TEACHER' && effectiveViewMode === 'lobby') && (
        <VideoTiles
          videoElements={videoElements}
          localIdentity={classroomRef.current?.localIdentity ?? ''}
        />
      )}

      {/* 接続エラー */}
      {connectionError && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-2 rounded-xl text-sm">
          {connectionError}
        </div>
      )}

      {/* オーディオデバッグ */}
      {audioDebug && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 px-4 py-2 rounded-xl text-sm flex items-center gap-3">
          <span className="flex-1 text-xs">{audioDebug}</span>
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
            className="px-3 py-1 bg-green-500/30 border border-green-500/50 rounded-lg text-green-300 text-xs whitespace-nowrap"
          >
            音声を開始
          </button>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* ロビー: 教師はTeacherDashboard、生徒はLobby */}
        {effectiveViewMode === 'lobby' && role === 'TEACHER' && (
          <TeacherDashboard
            participants={participants}
            localIdentity={classroomRef.current?.localIdentity ?? ''}
            students={students}
            classrooms={classrooms}
            selectedClassroomId={selectedClassroomId}
            onSelectClassroom={setSelectedClassroomId}
            games={games}
            audioPermissions={audioPermissions}
            onToggleHear={handleToggleHear}
            onToggleMic={handleToggleStudentMic}
            chatMessages={chat.messages}
            onChatSend={chat.sendMessage}
            videoElements={videoElements}
            studentJoinInfo={studentJoinInfo}
            onCreateGame={() => setShowGameCreation(true)}
            onStartLecture={handleStartLecture}
            onLoadSgf={handleSgfLoadFromLobby}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            isReconnecting={isReconnecting}
            onOpenStudentManager={() => setShowStudentManager(true)}
            onReloadData={reloadClassroomData}
            onCreateGames={async (pairs) => {
              for (const p of pairs) {
                await liveGameList.createGame(p);
              }
            }}
            onProblemAssign={handleProblemAssign}
            onClearAudioM={handleClearAudioM}
            onClearAudioS={handleClearAudioS}
            onClearSharing={() => setReviewTargetStudents([])}
            onResetVideo={handleResetVideo}
          />
        )}

        {effectiveViewMode === 'lobby' && role === 'STUDENT' && (
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
          />
        )}

        {/* 対局画面 */}
        {effectiveViewMode === 'game' && activeGame && (
          <GameBoard
            gameId={activeGame.id}
            myIdentity={classroomRef.current?.localIdentity ?? userName}
            isTeacher={role === 'TEACHER'}
            onBack={handleBackToLobby}
          />
        )}

        {/* 授業モード */}
        {effectiveViewMode === 'lecture' && (
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

        {/* 検討モード */}
        {effectiveViewMode === 'review' && reviewRootNode && reviewCurrentNode && (
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
            onBack={role === 'TEACHER' ? handleBackToLobby : undefined}
            registeredStudents={students}
            chatMessages={chat.messages}
            onChatSend={chat.sendMessage}
          />
        )}

        {/* 詰碁モード */}
        {effectiveViewMode === 'problem' && activeProblem && (
          <ProblemBoard
            problem={activeProblem}
            isTeacher={role === 'TEACHER'}
            onBack={() => {
              setViewMode('lobby');
              setActiveProblem(null);
            }}
            onResult={(result) => {
              // 生徒: 結果を先生に送信
              if (role === 'STUDENT') {
                classroomRef.current?.broadcast({
                  type: 'PROBLEM_RESULT',
                  payload: {
                    problemId: activeProblem.id,
                    result,
                    moveCount: 0,
                  },
                });
              }
            }}
          />
        )}
      </div>

      {/* 先生用: 音声映像制御パネル（ロビー以外のviewMode時に表示 — ロビーはTeacherDashboardのStudentTableで制御） */}
      {role === 'TEACHER' && isConnected && effectiveViewMode !== 'lobby' && participants.length > 1 && (
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
          teacherName={classroomRef.current?.localIdentity || userName || '先生'}
          onClose={() => setShowGameCreation(false)}
          onCreate={handleCreateGame}
          registeredStudents={students}
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
