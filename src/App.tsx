import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import GoBoard from './components/GoBoard';
import type { Drawing } from './components/GoBoard';
import AudioControls from './components/AudioControls';
import MoveCounter from './components/MoveCounter';
import ParticipantList from './components/ParticipantList';
import { ClassroomLiveKit } from './utils/classroomLiveKit';
import type { Role, ClassroomMessage, ParticipantInfo } from './utils/classroomLiveKit';
import { checkCapture, createEmptyBoard } from './utils/gameLogic';
import { parseSGFTree } from './utils/sgfUtils';
import type { SgfMetadata } from './utils/sgfUtils';
import { createNode, addMove, convertSgfToGameTree, getMainPath } from './utils/treeUtilsV2';
import type { GameNode } from './utils/treeUtilsV2';
import { generateToken } from './utils/livekitToken';
import { ConnectionState } from 'livekit-client';

import {
  Users, Video, Copy, Check, Upload,
  ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  Grid3X3, GitBranch, Link, Settings, LogOut,
  Pen, ArrowRight as ArrowRightIcon, Trash2,
} from 'lucide-react';

const BOARD_SIZES = [19, 17, 15, 13, 11, 9] as const;

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [userName, setUserName] = useState('');

  // LiveKit connection state
  const [livekitUrl, setLivekitUrl] = useState(() => localStorage.getItem('lk-url') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('lk-api-key') || '');
  const [apiSecret, setApiSecret] = useState(() => localStorage.getItem('lk-api-secret') || '');
  const [roomName, setRoomName] = useState('go-classroom');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [connectionError, setConnectionError] = useState('');

  // Game State
  const [boardSize, setBoardSize] = useState(19);
  const [rootNode, setRootNode] = useState<GameNode>(() => createNode(null, createEmptyBoard(19), 1, 'BLACK', 19));
  const [currentNode, setCurrentNode] = useState<GameNode>(rootNode);

  // Audio State
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Participants
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);

  // Cursor sharing (teacher -> students)
  const [teacherCursor, setTeacherCursor] = useState<{ x: number; y: number } | null>(null);

  // Drawing overlay (teacher draws lines/arrows on the board)
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);

  // View State
  const boardState = currentNode.board;
  const markers = currentNode.markers;
  const [sgfMetadata, setSgfMetadata] = useState<SgfMetadata | undefined>();
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Token generated for sharing (teacher generates for students)
  const [studentJoinInfo, setStudentJoinInfo] = useState<string>('');

  const classroomRef = useRef<ClassroomLiveKit | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const derivedNextColor = currentNode.move
    ? (currentNode.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
    : 'BLACK';

  // Count total moves in main line
  const totalMoves = useMemo(() => {
    return getMainPath(rootNode).length - 1;
  }, [rootNode]);

  // Current move number
  const currentMoveNumber = currentNode.move ? currentNode.nextNumber - 1 : 0;

  // Sync board state to students when teacher navigates
  useEffect(() => {
    if (role === 'TEACHER' && classroomRef.current?.isConnected) {
      classroomRef.current.broadcast({
        type: 'BOARD_UPDATE',
        payload: {
          boardState: currentNode.board,
          boardSize,
          nextColor: derivedNextColor,
          markers: currentNode.markers,
          moveNumber: currentMoveNumber,
        }
      });
    }
  }, [currentNode, role, derivedNextColor, boardSize, currentMoveNumber]);

  // Handle SGF file load
  const handleSgfLoad = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      const parsed = parseSGFTree(content);
      const newSize = parsed.size;
      const initialBoard = parsed.board;

      const newRoot = convertSgfToGameTree(parsed.root, null, newSize, 1, initialBoard);

      setBoardSize(newSize);
      setSgfMetadata(parsed.metadata);
      setRootNode(newRoot);
      setCurrentNode(newRoot);
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  // Navigation
  const goToRoot = () => setCurrentNode(rootNode);
  const goBack = () => {
    if (currentNode.parent) setCurrentNode(currentNode.parent);
  };
  const goForward = () => {
    if (currentNode.children.length > 0) {
      setCurrentNode(currentNode.children[0]);
    }
  };
  const goForwardBranch = (index: number) => {
    if (currentNode.children[index]) {
      setCurrentNode(currentNode.children[index]);
    }
  };
  const goLast = () => {
    let curr = currentNode;
    while (curr.children.length > 0) {
      curr = curr.children[0];
    }
    setCurrentNode(curr);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goForward();
          break;
        case 'Home':
          e.preventDefault();
          goToRoot();
          break;
        case 'End':
          e.preventDefault();
          goLast();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Initialize LiveKit connection
  const connectLiveKit = useCallback(async (
    connectRole: Role,
    connectUserName: string,
  ) => {
    const classroom = new ClassroomLiveKit();
    classroomRef.current = classroom;

    classroom.setHandlers({
      onMessage: (msg: ClassroomMessage) => {
        if (msg.type === 'BOARD_UPDATE' && connectRole === 'STUDENT' && msg.payload) {
          const p = msg.payload as {
            boardState: typeof boardState;
            boardSize: number;
            nextColor: typeof derivedNextColor;
            markers: typeof markers;
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
          setBoardSize(p.boardSize);
          setCurrentNode(dummyNode);
        } else if (msg.type === 'CURSOR_MOVE' && connectRole === 'STUDENT' && msg.payload) {
          const c = msg.payload as { x: number; y: number };
          if (typeof c.x === 'number' && typeof c.y === 'number') {
            setTeacherCursor({ x: c.x, y: c.y });
          }
        } else if (msg.type === 'CURSOR_CLEAR' && connectRole === 'STUDENT') {
          setTeacherCursor(null);
        } else if (msg.type === 'DRAW_UPDATE' && connectRole === 'STUDENT' && Array.isArray(msg.payload)) {
          setDrawings(msg.payload as Drawing[]);
        } else if (msg.type === 'DRAW_CLEAR' && connectRole === 'STUDENT') {
          setDrawings([]);
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
      // Generate token for this participant
      const connectToken = await generateToken({
        apiKey,
        apiSecret,
        roomName,
        identity: connectUserName,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
      });

      await classroom.connect(livekitUrl, connectToken);
      setConnectionError('');

      // If teacher, create a shareable join URL with room credentials
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
      setConnectionError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [apiKey, apiSecret, roomName, livekitUrl]);

  // Check URL params on load for student auto-join
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
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Audio controls
  const [audioDebug, setAudioDebug] = useState('');
  const updateAudioDebug = useCallback(() => {
    if (!classroomRef.current) return;
    const audioEls = document.querySelectorAll('audio').length;
    const remote = classroomRef.current.room.remoteParticipants.size;
    const local = classroomRef.current.room.localParticipant;
    const localAudio = local ? Array.from(local.audioTrackPublications.values()) : [];
    const localInfo = `Local: ${localAudio.length} tracks (${localAudio.map(t => `${t.trackSid || 'no-sid'} ${t.isMuted ? 'muted' : 'live'}`).join(',')})`;
    let trackInfo = '';
    classroomRef.current.room.remoteParticipants.forEach((p) => {
      const audioTracks = Array.from(p.audioTrackPublications.values());
      trackInfo += `${p.identity}: ${audioTracks.length} tracks (${audioTracks.map(t => `${t.isSubscribed ? 'sub' : 'nosub'} ${t.isMuted ? 'mut' : 'live'}`).join(',')}); `;
    });
    setAudioDebug(`Mic: ${isMicEnabled ? 'ON' : 'OFF'}, ${localInfo}, AudioEls: ${audioEls}, Remote: ${remote}, [${trackInfo || 'none'}]`);
  }, [isMicEnabled]);

  const handleToggleMic = async () => {
    if (!classroomRef.current?.isConnected) {
      setAudioDebug('Not connected');
      return;
    }
    try {
      const enabled = await classroomRef.current.toggleMicrophone();
      setIsMicEnabled(enabled);
    } catch (err) {
      setAudioDebug(`Mic error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Auto-update audio debug every 2 seconds
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    updateAudioDebug();
    const interval = setInterval(updateAudioDebug, 2000);
    return () => clearInterval(interval);
  }, [connectionState, updateAudioDebug]);

  const handleToggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      if (classroomRef.current?.room) {
        classroomRef.current.room.remoteParticipants.forEach(p => {
          p.audioTrackPublications.forEach(pub => {
            if (pub.track) {
              pub.track.mediaStreamTrack.enabled = !next;
            }
          });
        });
      }
      return next;
    });
  };

  // Cursor sharing (teacher hovering on the board)
  const handleCellMouseEnter = useCallback((x: number, y: number) => {
    if (role === 'TEACHER' && classroomRef.current?.isConnected) {
      classroomRef.current.broadcast({
        type: 'CURSOR_MOVE',
        payload: { x, y, identity: userName },
      });
    }
  }, [role, userName]);

  const handleCellMouseLeave = useCallback(() => {
    if (role === 'TEACHER' && classroomRef.current?.isConnected) {
      classroomRef.current.broadcast({
        type: 'CURSOR_CLEAR',
        payload: null,
      });
    }
  }, [role]);

  // Drawing handlers
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);

  const handleDrawDragStart = useCallback((x: number, y: number) => {
    if (role === 'TEACHER' && drawMode !== 'off') {
      setDrawStart({ x, y });
      drawLastCell.current = { x, y };
    }
  }, [role, drawMode]);

  const handleDrawDragMove = useCallback((x: number, y: number) => {
    if (role === 'TEACHER' && drawMode !== 'off') {
      drawLastCell.current = { x, y };
    }
  }, [role, drawMode]);

  const handleDrawDragEnd = useCallback(() => {
    if (role === 'TEACHER' && drawMode !== 'off' && drawStart && drawLastCell.current) {
      const end = drawLastCell.current;
      if (drawStart.x !== end.x || drawStart.y !== end.y) {
        const newDrawing: Drawing = {
          fromX: drawStart.x,
          fromY: drawStart.y,
          toX: end.x,
          toY: end.y,
          type: drawMode,
        };
        const updated = [...drawings, newDrawing];
        setDrawings(updated);
        classroomRef.current?.broadcast({
          type: 'DRAW_UPDATE',
          payload: updated,
        });
      }
      setDrawStart(null);
      drawLastCell.current = null;
    }
  }, [role, drawMode, drawStart, drawings]);

  const clearDrawings = useCallback(() => {
    setDrawings([]);
    classroomRef.current?.broadcast({
      type: 'DRAW_CLEAR',
      payload: null,
    });
  }, []);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (role === 'STUDENT') return;
    if (drawMode !== 'off') return; // drawing mode: clicks ignored

    if (boardState[y - 1][x - 1]) return;

    let newBoard = boardState.map(row => row.map(cell => cell ? { ...cell } : null));
    newBoard[y - 1][x - 1] = { color: derivedNextColor, number: currentNode.nextNumber };

    const { board: capturedBoard } = checkCapture(newBoard, x, y, derivedNextColor, boardSize);

    const realNewNode = addMove(
      currentNode,
      capturedBoard,
      currentNode.nextNumber + 1,
      derivedNextColor,
      boardSize,
      { x, y, color: derivedNextColor }
    );

    setCurrentNode(realNewNode);
  }, [boardState, derivedNextColor, role, boardSize, currentNode, drawMode]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetBoard = () => {
    const empty = createEmptyBoard(boardSize);
    const newRoot = createNode(null, empty, 1, 'WHITE', boardSize);
    setRootNode(newRoot);
    setCurrentNode(newRoot);
    setSgfMetadata(undefined);
  };

  const changeBoardSize = (newSize: number) => {
    setBoardSize(newSize);
    const empty = createEmptyBoard(newSize);
    const newRoot = createNode(null, empty, 1, 'WHITE', newSize);
    setRootNode(newRoot);
    setCurrentNode(newRoot);
    setSgfMetadata(undefined);
  };

  const handleDisconnect = () => {
    classroomRef.current?.destroy();
    classroomRef.current = null;
    setConnectionState(ConnectionState.Disconnected);
    setRole(null);
    setParticipants([]);
    setStudentJoinInfo('');
  };

  const saveSettings = () => {
    localStorage.setItem('lk-url', livekitUrl);
    localStorage.setItem('lk-api-key', apiKey);
    localStorage.setItem('lk-api-secret', apiSecret);
    setShowSettings(false);
  };

  // Build cursor markers for GoBoard (teacher cursor shown to students)
  const cursorMarkers = useMemo(() => {
    if (!teacherCursor || role !== 'STUDENT') return markers;
    const cursorMarker = {
      x: teacherCursor.x,
      y: teacherCursor.y,
      type: 'SYMBOL' as const,
      value: 'CIR',
    };
    return [...(markers || []), cursorMarker];
  }, [markers, teacherCursor, role]);

  // --- Settings Modal ---
  if (showSettings) {
    return (
      <div className="flex flex-col items-center justify-center min-vh-100 gap-6 animate-in fade-in duration-300">
        <div className="glass-panel p-8 w-full max-w-lg space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="w-6 h-6" /> LiveKit Settings
            </h2>
            <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white text-xl">&times;</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">LiveKit Server URL</label>
              <input
                type="text"
                value={livekitUrl}
                onChange={e => setLivekitUrl(e.target.value)}
                placeholder="wss://your-app.livekit.cloud"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="APIxxxxxxx"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                placeholder="Your API Secret"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Room Name</label>
              <input
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                placeholder="go-classroom"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button onClick={saveSettings} className="premium-button w-full">
            Save Settings
          </button>
          <p className="text-xs text-zinc-600 text-center">
            Settings are stored in your browser&apos;s localStorage.
          </p>
        </div>
      </div>
    );
  }

  // --- Role Selection Screen ---
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-vh-100 gap-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Go Classroom
          </h1>
          <p className="text-zinc-400 text-xl font-medium">Online Go instruction platform</p>
        </div>

        <div className="w-full max-w-sm">
          <input
            type="text"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="Your name"
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
              <h3 className="text-2xl font-bold">Teacher</h3>
              <p className="text-zinc-500 mt-2">Create a classroom and lead the lesson.</p>
            </div>
            <div className="premium-button mt-4 w-full">Start as Teacher</div>
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
              <h3 className="text-2xl font-bold">Student</h3>
              <p className="text-zinc-500 mt-2">Join a classroom with the link from your teacher.</p>
            </div>
            <div className="secondary-button mt-4 w-full">Join as Student</div>
          </button>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="text-zinc-600 hover:text-zinc-400 text-sm flex items-center gap-1"
        >
          <Settings className="w-4 h-4" /> LiveKit Settings
        </button>
      </div>
    );
  }

  // --- Student Connection Screen ---
  if (role === 'STUDENT' && connectionState !== ConnectionState.Connected) {
    const hasCredentials = livekitUrl && apiKey && apiSecret && roomName;
    return (
      <div className="flex flex-col items-center justify-center min-vh-100 gap-6 animate-in fade-in duration-300">
        <div className="glass-panel p-8 w-full max-w-lg space-y-6">
          <h2 className="text-2xl font-bold text-center">Join Classroom</h2>

          {connectionState === ConnectionState.Connecting ? (
            <div className="text-center text-blue-400">Connecting...</div>
          ) : hasCredentials ? (
            <>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Your Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="text-sm text-zinc-500">
                Room: <span className="text-zinc-300">{roomName}</span>
              </div>

              {connectionError && (
                <div className="text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">
                  {connectionError}
                </div>
              )}

              <button
                onClick={() => {
                  if (userName.trim()) {
                    connectLiveKit('STUDENT', userName.trim());
                  }
                }}
                disabled={!userName.trim()}
                className="premium-button w-full disabled:opacity-30"
              >
                Join
              </button>
            </>
          ) : (
            <div className="text-center text-zinc-400 space-y-4">
              <p>Ask your teacher for the join link.</p>
              <p className="text-xs text-zinc-600">The link contains the room credentials needed to connect.</p>
            </div>
          )}

          <button onClick={handleDisconnect} className="text-zinc-600 hover:text-zinc-400 text-sm w-full text-center">
            Back
          </button>
        </div>
      </div>
    );
  }

  // --- Main Classroom View ---
  const isConnected = connectionState === ConnectionState.Connected;

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Main Board Area */}
      <div className="flex-1 space-y-4">
        {/* Header */}
        <header className="flex justify-between items-center glass-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' :
              connectionState === ConnectionState.Reconnecting ? 'bg-yellow-500 animate-pulse' :
              'bg-red-500'
            }`} />
            <h2 className="font-bold text-lg">{role === 'TEACHER' ? 'Teacher' : 'Student'}</h2>
            <span className="text-zinc-500 text-sm">{userName}</span>
            {isConnected && (
              <span className="text-xs text-zinc-600">
                {classroomRef.current?.remoteParticipantCount ?? 0} connected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isConnected && (
              <AudioControls
                isMicEnabled={isMicEnabled}
                onToggleMic={handleToggleMic}
                isMuted={isMuted}
                onToggleMute={handleToggleMute}
              />
            )}
            <MoveCounter currentMove={currentMoveNumber} totalMoves={totalMoves} />
            <button onClick={handleDisconnect} className="p-2 text-zinc-500 hover:text-red-400 transition-colors" title="Disconnect">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Connection Error */}
        {connectionError && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-2 rounded-xl text-sm">
            {connectionError}
          </div>
        )}

        {/* Audio Debug */}
        {audioDebug && (
          <div className="bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 px-4 py-2 rounded-xl text-sm flex items-center gap-3">
            <span className="flex-1">{audioDebug}</span>
            <button
              onClick={async () => {
                try {
                  await classroomRef.current?.room.startAudio();
                  document.querySelectorAll('audio').forEach(el => {
                    (el as HTMLAudioElement).muted = false;
                    (el as HTMLAudioElement).volume = 1;
                    (el as HTMLAudioElement).play().catch(() => {});
                  });
                  setAudioDebug(prev => prev + ' [Audio started!]');
                } catch (e) {
                  setAudioDebug(prev => prev + ` [Error: ${e}]`);
                }
              }}
              className="px-3 py-1 bg-green-500/30 border border-green-500/50 rounded-lg text-green-300 text-xs whitespace-nowrap"
            >
              Start Audio
            </button>
          </div>
        )}

        {/* Go Board */}
        <div className="glass-panel p-4 flex justify-center items-center shadow-2xl relative">
          {role === 'TEACHER' && currentNode.children.length > 1 && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-blue-500/20 px-3 py-1 rounded-full text-blue-300 text-sm">
              <GitBranch className="w-4 h-4" />
              <span>{currentNode.children.length} variations</span>
            </div>
          )}

          <GoBoard
            boardState={boardState}
            boardSize={boardSize}
            onCellClick={handleCellClick}
            markers={cursorMarkers}
            drawings={drawings}
            readOnly={role === 'STUDENT'}
            onCellMouseEnter={handleCellMouseEnter}
            onCellMouseLeave={handleCellMouseLeave}
            onDragStart={drawMode !== 'off' ? handleDrawDragStart : undefined}
            onDragMove={drawMode !== 'off' ? handleDrawDragMove : undefined}
            onDragEnd={drawMode !== 'off' ? handleDrawDragEnd : undefined}
          />
        </div>

        {/* Navigation Controls */}
        {role === 'TEACHER' && (
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
              title="Draw line"
            >
              <Pen className="w-5 h-5" />
            </button>
            <button
              onClick={() => setDrawMode(drawMode === 'arrow' ? 'off' : 'arrow')}
              className={`p-3 glass-panel hover:bg-white/10 ${drawMode === 'arrow' ? 'bg-red-500/20 text-red-400' : ''}`}
              title="Draw arrow"
            >
              <ArrowRightIcon className="w-5 h-5" />
            </button>
            {drawings.length > 0 && (
              <button
                onClick={clearDrawings}
                className="p-3 glass-panel hover:bg-white/10 text-zinc-400 hover:text-red-400"
                title="Clear drawings"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Variation Selection */}
        {role === 'TEACHER' && currentNode.children.length > 1 && (
          <div className="flex justify-center gap-2 overflow-x-auto p-2">
            {currentNode.children.map((child, idx) => (
              <button
                key={idx}
                onClick={() => goForwardBranch(idx)}
                className="px-3 py-1 bg-white/5 border border-white/10 rounded text-sm hover:bg-blue-500/20"
              >
                Var {idx + 1} ({child.move ? child.move.color : '?'})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-80 space-y-4">
        {/* Share Link (Teacher Only) */}
        {role === 'TEACHER' && studentJoinInfo && (
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold flex items-center gap-2">
              <Link className="w-4 h-4" /> Share with Students
            </h3>
            <div className="bg-white/5 rounded-lg p-2 text-xs font-mono break-all max-h-20 overflow-y-auto">
              {studentJoinInfo}
            </div>
            <button
              onClick={() => copyToClipboard(studentJoinInfo)}
              className="secondary-button w-full flex items-center justify-center gap-2 text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Join Link'}
            </button>
            <p className="text-xs text-zinc-600">
              Students can open this link to join directly.
            </p>
          </div>
        )}

        {/* SGF Controls (Teacher Only) */}
        {role === 'TEACHER' && (
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold border-b border-white/5 pb-2">SGF Library</h3>

            <input
              ref={fileInputRef}
              type="file"
              accept=".sgf"
              onChange={handleSgfLoad}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="secondary-button w-full flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="w-4 h-4" /> Load SGF File
            </button>

            {sgfMetadata && (
              <div className="text-sm bg-white/5 p-3 rounded-xl space-y-1">
                {sgfMetadata.gameName && <div className="font-bold">{sgfMetadata.gameName}</div>}
                {sgfMetadata.blackName && <div>Black: {sgfMetadata.blackName}</div>}
                {sgfMetadata.whiteName && <div>White: {sgfMetadata.whiteName}</div>}
                {sgfMetadata.result && <div className="text-zinc-400">Result: {sgfMetadata.result}</div>}
              </div>
            )}
          </div>
        )}

        {/* Game Control */}
        <div className="glass-panel p-4 space-y-4">
          <h3 className="font-bold border-b border-white/5 pb-2">Game Control</h3>

          {role === 'TEACHER' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <Grid3X3 className="w-4 h-4" />
                <span>Board Size</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {BOARD_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => changeBoardSize(size)}
                    className={`px-2 py-1 rounded-lg text-sm font-medium transition-all ${boardSize === size
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center text-sm">
            <span className="text-zinc-400">Next Player</span>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl">
              <div className={`w-3 h-3 rounded-full border border-white/20 ${derivedNextColor === 'BLACK' ? 'bg-black' : 'bg-white'}`} />
              <span className="font-bold text-sm">{derivedNextColor === 'BLACK' ? 'Black' : 'White'}</span>
            </div>
          </div>

          {role === 'TEACHER' && (
            <button onClick={resetBoard} className="secondary-button w-full text-sm border-red-500/20 hover:bg-red-500/10 hover:text-red-400">
              Reset Board
            </button>
          )}
        </div>

        {/* Participants */}
        {isConnected && participants.length > 0 && (
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold flex items-center gap-2 border-b border-white/5 pb-2">
              <Users className="w-4 h-4" /> Participants ({participants.length})
            </h3>
            <ParticipantList
              participants={participants}
              localIdentity={classroomRef.current?.localIdentity ?? ''}
              activeSpeakers={activeSpeakers}
            />
          </div>
        )}

        {/* Status */}
        <div className="text-xs text-zinc-600 bg-white/5 p-3 rounded-xl leading-relaxed">
          {role === 'TEACHER'
            ? "Navigate the SGF to teach. Board syncs to all students in real-time."
            : "Watching teacher's board. Use your microphone to ask questions."}
        </div>
      </div>
    </div>
  );
}

export default App;
