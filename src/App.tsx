import { useState, useEffect, useCallback, useRef } from 'react';
import GoBoard from './components/GoBoard';
import type { BoardState, StoneColor } from './components/GoBoard';
import { ClassroomPeer } from './utils/classroomPeer';
import type { Role, ClassroomMessage } from './utils/classroomPeer';
import { checkCapture, createEmptyBoard } from './utils/gameLogic';
import { Users, Video, Share2, Copy, Check } from 'lucide-react';

const BOARD_SIZE = 19;

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [boardState, setBoardState] = useState<BoardState>(createEmptyBoard(BOARD_SIZE));
  const [nextColor, setNextColor] = useState<StoneColor>('BLACK');
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const classroomRef = useRef<ClassroomPeer | null>(null);

  // Initialize Peer
  useEffect(() => {
    if (role) {
      const cp = new ClassroomPeer();
      classroomRef.current = cp;

      cp.peer.on('open', (id) => {
        setPeerId(id);
      });

      cp.onConnection = () => {
        setConnected(true);
      };

      cp.onMessage = (msg: ClassroomMessage) => {
        if (msg.type === 'BOARD_UPDATE') {
          setBoardState(msg.payload.boardState);
          setNextColor(msg.payload.nextColor);
        }
      };

      return () => {
        cp.destroy();
      };
    }
  }, [role]);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (role === 'STUDENT' && connected) return; // Student cannot play if connected (view only mode)

    const newBoard = boardState.map(row => [...row]);
    if (newBoard[y - 1][x - 1]) return; // Occupied

    newBoard[y - 1][x - 1] = { color: nextColor };

    // Simple capture logic (we'd need full game logic for KO etc)
    const { board: capturedBoard } = checkCapture(newBoard, x, y, nextColor, BOARD_SIZE);

    const finalBoard = capturedBoard;
    const finalNextColor = nextColor === 'BLACK' ? 'WHITE' : 'BLACK';

    setBoardState(finalBoard);
    setNextColor(finalNextColor);

    // Broadcast if teacher
    if (role === 'TEACHER') {
      classroomRef.current?.broadcast({
        type: 'BOARD_UPDATE',
        payload: { boardState: finalBoard, nextColor: finalNextColor }
      });
    }
  }, [boardState, nextColor, role, connected]);

  const joinRoom = () => {
    if (targetId && classroomRef.current) {
      classroomRef.current.connect(targetId);
      setConnected(true);
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetBoard = () => {
    const empty = createEmptyBoard(BOARD_SIZE);
    setBoardState(empty);
    setNextColor('BLACK');
    if (role === 'TEACHER') {
      classroomRef.current?.broadcast({
        type: 'BOARD_UPDATE',
        payload: { boardState: empty, nextColor: 'BLACK' }
      });
    }
  };

  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-vh-100 gap-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Go Classroom
          </h1>
          <p className="text-zinc-400 text-xl font-medium">Professional online Go instruction platform</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
          <button
            onClick={() => setRole('TEACHER')}
            className="glass-panel p-8 flex flex-col items-center gap-4 hover:bg-white/5 transition-all group"
          >
            <div className="p-4 bg-blue-500/10 rounded-2xl group-hover:scale-110 transition-transform">
              <Video className="w-10 h-10 text-blue-400" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold">Instruction Mode</h3>
              <p className="text-zinc-500 mt-2">Create a classroom and demonstrate moves to students.</p>
            </div>
            <div className="premium-button mt-4 w-full">Start as Teacher</div>
          </button>

          <button
            onClick={() => setRole('STUDENT')}
            className="glass-panel p-8 flex flex-col items-center gap-4 hover:bg-white/5 transition-all group"
          >
            <div className="p-4 bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform">
              <Users className="w-10 h-10 text-indigo-400" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold">Student Mode</h3>
              <p className="text-zinc-500 mt-2">Join an existing room and learn from your teacher.</p>
            </div>
            <div className="secondary-button mt-4 w-full">Join as Student</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 space-y-6">
        <header className="flex justify-between items-center glass-panel px-6 py-4">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <h2 className="font-bold text-xl">{role === 'TEACHER' ? 'Instructor Panel' : 'Classroom View'}</h2>
          </div>

          <div className="flex items-center gap-3">
            {role === 'TEACHER' ? (
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <span className="text-zinc-500 text-sm font-mono">{peerId}</span>
                <button onClick={copyId} className="hover:text-blue-400 transition-colors">
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ) : !connected && (
              <div className="flex gap-2">
                <input
                  placeholder="Enter Instructor ID"
                  value={targetId}
                  onChange={e => setTargetId(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
                <button onClick={joinRoom} className="premium-button py-2">Join</button>
              </div>
            )}
          </div>
        </header>

        <div className="glass-panel p-4 flex justify-center items-center shadow-2xl">
          <GoBoard
            boardState={boardState}
            boardSize={BOARD_SIZE}
            onCellClick={handleCellClick}
            readOnly={role === 'STUDENT' && connected}
          />
        </div>
      </div>

      <div className="w-full lg:w-80 space-y-6">
        <div className="glass-panel p-6 space-y-6">
          <h3 className="text-xl font-bold border-b border-white/5 pb-4">Game Control</h3>

          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Next Player</span>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl">
              <div className={`w-4 h-4 rounded-full border border-white/20 ${nextColor === 'BLACK' ? 'bg-black' : 'bg-white'}`} />
              <span className="font-bold">{nextColor === 'BLACK' ? 'Black' : 'White'}</span>
            </div>
          </div>

          {role === 'TEACHER' && (
            <div className="space-y-3 pt-4 border-t border-white/5">
              <button onClick={resetBoard} className="secondary-button w-full border-red-500/20 hover:bg-red-500/10 hover:text-red-400">
                Reset Board
              </button>
              <button
                onClick={() => classroomRef.current?.broadcast({ type: 'BOARD_UPDATE', payload: { boardState, nextColor } })}
                className="premium-button w-full flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" /> Sync All Students
              </button>
            </div>
          )}

          <div className="text-sm text-zinc-500 bg-white/5 p-4 rounded-xl leading-relaxed">
            {role === 'TEACHER'
              ? "As an instructor, you can lead the session by demonstrating moves. All connected students will see your board in real-time."
              : connected
                ? "You are now synchronized with the instructor. Watch the board for insights."
                : "Please enter the instructor ID to join the live session."}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
