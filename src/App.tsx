import { useState, useEffect, useCallback, useRef } from 'react';
import type { Drawing } from './components/GoBoard';
import type { GameNode } from './utils/treeUtilsV2';
import { convertSgfToGameTree } from './utils/treeUtilsV2';
import { parseSGFTree } from './utils/sgfUtils';
import { ClassroomLiveKit } from './utils/classroomLiveKit';
import type { Role, ClassroomMessage, ParticipantInfo } from './utils/classroomLiveKit';
import type { ViewMode, GameSession, SavedGame, AudioPermissions } from './types/game';
import { fetchToken } from './utils/livekitToken';
import { ConnectionState } from 'livekit-client';
import { useGameManager } from './hooks/useGameManager';
import { useGameView } from './hooks/useGameView';

import Header from './components/Header';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import GameCreationDialog from './components/GameCreationDialog';
import LectureBoard from './components/LectureBoard';
import ReviewBoard from './components/ReviewBoard';
import MediaControlPanel from './components/MediaControlPanel';

import { Users, Video, Settings } from 'lucide-react';

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [userName, setUserName] = useState('');

  // LiveKit接続
  const [livekitUrl, setLivekitUrl] = useState(() => import.meta.env.VITE_LIVEKIT_URL || localStorage.getItem('lk-url') || '');
  const [apiKey, setApiKey] = useState(() => import.meta.env.VITE_LIVEKIT_API_KEY || localStorage.getItem('lk-api-key') || '');
  const [apiSecret, setApiSecret] = useState(() => import.meta.env.VITE_LIVEKIT_API_SECRET || localStorage.getItem('lk-api-secret') || '');
  const useServerToken = !!import.meta.env.VITE_LIVEKIT_API_KEY;
  const [roomName, setRoomName] = useState('go-classroom');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [connectionError, setConnectionError] = useState('');

  // 画面状態
  const [viewMode, setViewMode] = useState<ViewMode>('lobby');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [showGameCreation, setShowGameCreation] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 音声・映像
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [audioPermissions, setAudioPermissions] = useState<AudioPermissions>({});

  // 参加者
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);

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

  // オーディオデバッグ
  const [audioDebug, setAudioDebug] = useState('');

  const classroomRef = useRef<ClassroomLiveKit | null>(null);

  // 先生用: 対局管理
  const gameManager = useGameManager(classroomRef);

  // 生徒用: 対局ビュー
  const gameView = useGameView();

  // 現在の対局一覧（先生 or 生徒で分岐）
  const games = role === 'TEACHER' ? gameManager.games : gameView.games;

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
  const connectLiveKit = useCallback(async (connectRole: Role, connectUserName: string) => {
    const classroom = new ClassroomLiveKit();
    classroomRef.current = classroom;

    classroom.setHandlers({
      onMessage: (msg: ClassroomMessage, sender?: string) => {
        // 先生: 対局メッセージ処理
        if (connectRole === 'TEACHER') {
          gameManager.handleGameMessage(msg, sender);
        }

        // 生徒: 対局メッセージ処理
        if (connectRole === 'STUDENT') {
          gameView.handleGameMessage(msg);
        }

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
        if (msg.type === 'REVIEW_END' && connectRole === 'STUDENT') {
          setViewMode('lobby');
          setReviewRootNode(null);
          setReviewCurrentNode(null);
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
      },
      onParticipantJoined: (identity: string) => {
        // 先生: 新参加者に対局一覧を送信
        if (connectRole === 'TEACHER') {
          gameManager.syncGamesToParticipant(identity);
        }
      },
      onParticipantsChanged: (p: ParticipantInfo[]) => {
        setParticipants(p);
      },
      onConnectionStateChanged: (state: ConnectionState) => {
        setConnectionState(state);
      },
      onActiveSpeakersChanged: (speakers: string[]) => {
        setActiveSpeakers(speakers);
      },
    });

    try {
      const connectToken = await fetchToken({
        apiKey,
        apiSecret,
        roomName,
        identity: connectUserName,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
        useServerToken,
      });

      await classroom.connect(livekitUrl, connectToken);
      setConnectionError('');

      if (connectRole === 'TEACHER') {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('url', livekitUrl);
        currentUrl.searchParams.set('room', roomName);
        currentUrl.searchParams.set('key', apiKey);
        currentUrl.searchParams.set('secret', apiSecret);
        currentUrl.searchParams.set('role', 'STUDENT');
        setStudentJoinInfo(currentUrl.toString());
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : '接続に失敗しました');
    }
  }, [apiKey, apiSecret, roomName, livekitUrl, gameManager, gameView]);

  // URL params for student auto-join
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLkUrl = params.get('url');
    const urlRoom = params.get('room');
    const urlKey = params.get('key');
    const urlSecret = params.get('secret');
    const urlRole = params.get('role');

    if (urlLkUrl && urlRoom && urlKey && urlSecret && urlRole === 'STUDENT') {
      setLivekitUrl(urlLkUrl);
      setRoomName(urlRoom);
      setApiKey(urlKey);
      setApiSecret(urlSecret);
      setRole('STUDENT');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
    setRole(null);
    setParticipants([]);
    setStudentJoinInfo('');
    setViewMode('lobby');
    setActiveGameId(null);
  };

  const saveSettings = () => {
    localStorage.setItem('lk-url', livekitUrl);
    localStorage.setItem('lk-api-key', apiKey);
    localStorage.setItem('lk-api-secret', apiSecret);
    setShowSettings(false);
  };

  // 対局選択
  const handleSelectGame = (gameId: string) => {
    setActiveGameId(gameId);
    setViewMode('game');
  };

  // 対局作成
  const handleCreateGame = (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
  }) => {
    gameManager.createGame(opts);
    setShowGameCreation(false);
  };

  // 対局中の着手（先生用ハンドラ）
  const handleGameMove = (gameId: string, x: number, y: number, color: 'BLACK' | 'WHITE') => {
    if (role === 'TEACHER') {
      gameManager.handleMove(gameId, x, y, color);
    } else {
      // 生徒: 先生に着手を送信
      classroomRef.current?.broadcast({
        type: 'GAME_MOVE',
        payload: { gameId, x, y, color },
      });
    }
  };

  const handleGamePass = (gameId: string, color: 'BLACK' | 'WHITE') => {
    if (role === 'TEACHER') {
      gameManager.handlePass(gameId, color);
    } else {
      classroomRef.current?.broadcast({
        type: 'GAME_PASS',
        payload: { gameId, color },
      });
    }
  };

  const handleGameResign = (gameId: string, color: 'BLACK' | 'WHITE') => {
    if (role === 'TEACHER') {
      gameManager.handleResign(gameId, color);
    } else {
      classroomRef.current?.broadcast({
        type: 'GAME_RESIGN',
        payload: { gameId, color },
      });
    }
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

  // 保存棋譜から検討開始
  const handleSelectSavedGame = useCallback((game: SavedGame) => {
    const parsed = parseSGFTree(game.sgf);
    const root = convertSgfToGameTree(parsed.root, null, parsed.size, 1, parsed.board);
    setReviewRootNode(root);
    setReviewCurrentNode(root);
    setReviewBoardSize(parsed.size);
    setViewMode('review');

    classroomRef.current?.broadcast({
      type: 'REVIEW_START',
      payload: { sgf: game.sgf, boardSize: parsed.size },
    });
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
              <label className="block text-sm text-zinc-400 mb-1">APIキー</label>
              <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="APIxxxxxxx"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">APIシークレット</label>
              <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                placeholder="シークレットキー"
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

  // --- ロール選択画面 ---
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-8">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            囲碁教室
          </h1>
          <p className="text-zinc-400 text-xl font-medium">オンライン囲碁指導プラットフォーム</p>
        </div>

        <div className="w-full max-w-sm">
          <input
            type="text"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="お名前を入力"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-center text-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
          <button
            onClick={() => {
              if (!userName.trim()) return;
              if (!livekitUrl || !apiKey || !apiSecret) {
                setShowSettings(true);
                return;
              }
              setRole('TEACHER');
              connectLiveKit('TEACHER', userName.trim());
            }}
            className="glass-panel p-8 flex flex-col items-center gap-4 hover:bg-white/5 transition-all group"
          >
            <div className="p-4 bg-blue-500/10 rounded-2xl group-hover:scale-110 transition-transform">
              <Video className="w-10 h-10 text-blue-400" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold">先生</h3>
              <p className="text-zinc-500 mt-2">教室を作成し授業を行います</p>
            </div>
            <div className="premium-button mt-4 w-full">先生として参加</div>
          </button>

          <button
            onClick={() => {
              if (!userName.trim()) return;
              setRole('STUDENT');
            }}
            className="glass-panel p-8 flex flex-col items-center gap-4 hover:bg-white/5 transition-all group"
          >
            <div className="p-4 bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform">
              <Users className="w-10 h-10 text-indigo-400" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold">生徒</h3>
              <p className="text-zinc-500 mt-2">先生のリンクから教室に参加します</p>
            </div>
            <div className="secondary-button mt-4 w-full">生徒として参加</div>
          </button>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="text-zinc-600 hover:text-zinc-400 text-sm flex items-center gap-1"
        >
          <Settings className="w-4 h-4" /> LiveKit設定
        </button>
      </div>
    );
  }

  // --- 生徒接続画面 ---
  if (role === 'STUDENT' && connectionState !== ConnectionState.Connected) {
    const hasCredentials = livekitUrl && apiKey && apiSecret && roomName;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <div className="glass-panel p-8 w-full max-w-lg space-y-6">
          <h2 className="text-2xl font-bold text-center">教室に参加</h2>

          {connectionState === ConnectionState.Connecting ? (
            <div className="text-center text-blue-400">接続中...</div>
          ) : hasCredentials ? (
            <>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">お名前</label>
                <input
                  type="text" value={userName} onChange={e => setUserName(e.target.value)}
                  placeholder="お名前を入力"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="text-sm text-zinc-500">
                ルーム: <span className="text-zinc-300">{roomName}</span>
              </div>
              {connectionError && (
                <div className="text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">{connectionError}</div>
              )}
              <button
                onClick={() => { if (userName.trim()) connectLiveKit('STUDENT', userName.trim()); }}
                disabled={!userName.trim()}
                className="premium-button w-full disabled:opacity-30"
              >
                参加する
              </button>
            </>
          ) : (
            <div className="text-center text-zinc-400 space-y-4">
              <p>先生から参加リンクを受け取ってください</p>
              <p className="text-xs text-zinc-600">リンクには接続に必要な情報が含まれています</p>
            </div>
          )}

          <button onClick={handleDisconnect} className="text-zinc-600 hover:text-zinc-400 text-sm w-full text-center">
            戻る
          </button>
        </div>
      </div>
    );
  }

  // --- メイン教室ビュー ---
  const isConnected = connectionState === ConnectionState.Connected;

  // 生徒が対局中なら自動的にゲーム画面に遷移
  const myGame = role === 'STUDENT'
    ? gameView.getMyGame(classroomRef.current?.localIdentity || userName)
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
    <div className="flex flex-col gap-4 w-full min-h-screen">
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
      <div className="flex-1">
        {/* ロビー */}
        {effectiveViewMode === 'lobby' && (
          <Lobby
            role={role}
            participants={participants}
            localIdentity={classroomRef.current?.localIdentity ?? ''}
            activeSpeakers={activeSpeakers}
            games={games}
            studentJoinInfo={studentJoinInfo}
            onCreateGame={() => setShowGameCreation(true)}
            onStartLecture={handleStartLecture}
            onLoadSgf={handleSgfLoadFromLobby}
            onSelectSavedGame={handleSelectSavedGame}
            onSelectGame={handleSelectGame}
            myIdentity={classroomRef.current?.localIdentity ?? userName}
          />
        )}

        {/* 対局画面 */}
        {effectiveViewMode === 'game' && activeGame && (
          <GameBoard
            game={activeGame}
            myIdentity={classroomRef.current?.localIdentity ?? userName}
            onMove={handleGameMove}
            onPass={handleGamePass}
            onResign={handleGameResign}
            onBack={handleBackToLobby}
            isTeacher={role === 'TEACHER'}
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
          />
        )}
      </div>

      {/* 先生用: 音声映像制御パネル（ロビー時のみ表示） */}
      {role === 'TEACHER' && isConnected && effectiveViewMode === 'lobby' && participants.length > 1 && (
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
          students={classroomRef.current?.remoteIdentities ?? []}
          teacherName={userName}
          onClose={() => setShowGameCreation(false)}
          onCreate={handleCreateGame}
        />
      )}
    </div>
  );
}

export default App;
