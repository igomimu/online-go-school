import { useState, useEffect, useCallback, useRef } from 'react';
import GoBoard from './components/GoBoard';
// import type { BoardState, StoneColor } from './components/GoBoard';
import { ClassroomPeer } from './utils/classroomPeer';
import type { Role, ClassroomMessage } from './utils/classroomPeer';
import { checkCapture, createEmptyBoard } from './utils/gameLogic';
// import { parseSGF } from './utils/sgfUtils'; // OLD
import { parseSGFTree } from './utils/sgfUtils'; // NEW
import type { SgfMetadata } from './utils/sgfUtils';
import { createNode, addMove, convertSgfToGameTree } from './utils/treeUtilsV2';
import type { GameNode } from './utils/treeUtilsV2';

import { Users, Video, Share2, Copy, Check, Upload, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Grid3X3, GitBranch } from 'lucide-react';

const BOARD_SIZES = [19, 17, 15, 13, 11, 9] as const;

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');

  // Game State
  const [boardSize, setBoardSize] = useState(19);
  const [rootNode, setRootNode] = useState<GameNode>(() => createNode(null, createEmptyBoard(19), 1, 'BLACK', 19));
  const [currentNode, setCurrentNode] = useState<GameNode>(rootNode);

  // View State (derived from currentNode)
  const boardState = currentNode.board;
  const markers = currentNode.markers;
  // treeUtilsV2: `activeColor` in GameNode seems to match "activeColor" property of createNode... 
  // Let's check logic:
  // createNode(..., activeColor, ...) -> assign to node.
  // In `addMove`, `activeColor` param is passed.
  // We need to clarify if `currentNode.activeColor` is "Current Turn Player" or "Last Player".
  // Looking at `treeUtilsV2`: `addMove` takes `activeColor` and stores it.
  // Only `nextColor` needs to be derived.

  // Let's refine `nextColor` logic:
  // If currentNode has a move, `currentNode.move.color` is who played. So next is opposite.
  // If currentNode is root, we default to BLACK?
  // Actually `convertSgfToGameTree` sets `activeColor` to "The one who played".
  // So next color is opposite of `currentNode.activeColor` IF currentNode has a move.
  // If currentNode is root (and no move), check setup. Usually Black starts.

  // Fallback: If root activeColor is initialized to BLACK (meaning Black is 'active' as in 'to move'?)
  // Check `createNode` usage: `createNode(..., 'BLACK', ...)`
  // If `activeColor` means "Player to Move", then we just use it.
  // In `treeUtilsV2.ts`, `convertSgfToGameTree`: `actColor = color; // The one who played`
  // So `currentNode.activeColor` stores WHO PLAYED this move.
  // So `nextColor` is opposite.

  // EXCEPTION: Root Node. `convertSgfToGameTree` Logic for root?
  // Root usually has no move. `actColor` derived from parent (null) -> default BLACK.
  // If root `activeColor` is BLACK, does it mean Black *played* (impossible) or Black *to play*?
  // Let's standardize: `activeColor` on a node = "Color of the move that created this node". 
  // For Root, it is placeholder. Let's say Root ActiveColor = WHITE implies Black is next.

  const derivedNextColor = currentNode.move
    ? (currentNode.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
    : 'BLACK'; // Default for root

  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  // SGF Metadata
  const [sgfMetadata, setSgfMetadata] = useState<SgfMetadata | undefined>();

  const classroomRef = useRef<ClassroomPeer | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync Effect
  useEffect(() => {
    if (role === 'TEACHER' && connected) {
      classroomRef.current?.broadcast({
        type: 'BOARD_UPDATE',
        payload: {
          boardState: currentNode.board,
          nextColor: derivedNextColor,
          markers: currentNode.markers
        }
      });
    }
  }, [currentNode, role, connected, derivedNextColor]);

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
      const initialBoard = parsed.board; // Setup board

      // Convert to GameTree
      // Root of parsed tree might be empty container, or have properties.
      // `convertSgfToGameTree` expects a `SgfTreeNode`.
      // `parsed.root` is that node.
      const newRoot = convertSgfToGameTree(parsed.root, null, newSize, 1, initialBoard);

      // If the root from SGF has no move (standard), it's the start.
      // Sometimes SGF has moves immediately in root? Rare.

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
    // Create simple variation logic: default to first child
    if (currentNode.children.length > 0) {
      setCurrentNode(currentNode.children[0]);
    }
  };
  const goForwardBranch = (index: number) => {
    if (currentNode.children[index]) {
      setCurrentNode(currentNode.children[index]);
    }
  };

  // Note: For "Fast Forward" to end, we just follow first child repeatedly?
  const goLast = () => {
    let curr = currentNode;
    while (curr.children.length > 0) {
      curr = curr.children[0];
    }
    setCurrentNode(curr);
  };

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
        // If teacher, sync immediately
        if (role === 'TEACHER') {
          // Will trigger via the other useEffect or we can force it here
        }
      };

      cp.onMessage = (msg: ClassroomMessage) => {
        if (msg.type === 'BOARD_UPDATE') {
          // As student, we just view the board.
          // We don't reconstruct the tree (yet), just show state.
          // So we need a "Display Node" that isn't connected to a tree?
          // OR we just use a dummy root node for display.
          const dummyNode: GameNode = {
            id: 'synced',
            parent: null,
            children: [],
            board: msg.payload.boardState,
            nextNumber: 0,
            activeColor: msg.payload.nextColor === 'BLACK' ? 'WHITE' : 'BLACK', // hacky reverse
            boardSize: 19, // Todo: sync size too
            markers: msg.payload.markers || []
          };
          // We might need to update boardSize if it changed
          if (msg.payload.boardState.length !== boardSize) {
            setBoardSize(msg.payload.boardState.length);
          }
          setCurrentNode(dummyNode);
        }
      };

      return () => {
        cp.destroy();
      };
    }
  }, [role]);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (role === 'STUDENT' && connected) return;

    // Check legality
    if (boardState[y - 1][x - 1]) return; // Occupied

    // Add Move
    // This creates a NEW node safely
    // addMove logic in treeUtilsV2 doesn't auto-calculate capturing for the NEW node board? 
    // Wait, `addMove` just creates the node struct. `recalculateBoards` is separate?
    // Let's check `addMove` in `treeUtilsV2.ts`.
    // It calls `createNode` which just sets struct.
    // It DOES NOT valid logic.
    // I need to implement logic here or update `treeUtilsV2` to do logic inside `addMove`.

    // Actually, `recalculateBoards` is for updates.
    // For manual play, we should calculate the board state *here* and pass it to `addMove`.

    // 1. Calc new board locally
    let newBoard = boardState.map(row => row.map(cell => cell ? { ...cell } : null));
    newBoard[y - 1][x - 1] = { color: derivedNextColor, number: currentNode.nextNumber };

    const { board: capturedBoard } = checkCapture(newBoard, x, y, derivedNextColor, boardSize);

    // 2. Call addMove with the *result* board
    const realNewNode = addMove(
      currentNode,
      capturedBoard,
      currentNode.nextNumber + 1,
      derivedNextColor,
      boardSize,
      { x, y, color: derivedNextColor }
    );

    setCurrentNode(realNewNode);
  }, [boardState, derivedNextColor, role, connected, boardSize, currentNode]);

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
    const empty = createEmptyBoard(boardSize);
    const newRoot = createNode(null, empty, 1, 'WHITE', boardSize); // White active -> Black next
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

        <div className="glass-panel p-4 flex justify-center items-center shadow-2xl relative">
          {/* Variation Indicator */}
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
            markers={markers}
            readOnly={role === 'STUDENT'} // Student is always readonly
          />
        </div>

        {/* Navigation Controls */}
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

        {/* Variation Selection if multiple */}
        {currentNode.children.length > 1 && (
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

      <div className="w-full lg:w-80 space-y-6">
        {/* SGF Controls */}
        {role === 'TEACHER' && (
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-xl font-bold border-b border-white/5 pb-4">SGF Library</h3>

            <input
              ref={fileInputRef}
              type="file"
              accept=".sgf"
              onChange={handleSgfLoad}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="secondary-button w-full flex items-center justify-center gap-2"
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

            <div className="text-xs text-zinc-500">
              Move Number: {currentNode.move ? currentNode.nextNumber - 1 : 0}
            </div>
          </div>
        )}

        <div className="glass-panel p-6 space-y-6">
          <h3 className="text-xl font-bold border-b border-white/5 pb-4">Game Control</h3>

          {role === 'TEACHER' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-400">
                <Grid3X3 className="w-4 h-4" />
                <span>Board Size</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {BOARD_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => changeBoardSize(size)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${boardSize === size
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

          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Next Player</span>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl">
              <div className={`w-4 h-4 rounded-full border border-white/20 ${derivedNextColor === 'BLACK' ? 'bg-black' : 'bg-white'}`} />
              <span className="font-bold">{derivedNextColor === 'BLACK' ? 'Black' : 'White'}</span>
            </div>
          </div>

          {role === 'TEACHER' && (
            <div className="space-y-3 pt-4 border-t border-white/5">
              <button onClick={resetBoard} className="secondary-button w-full border-red-500/20 hover:bg-red-500/10 hover:text-red-400">
                Reset Board
              </button>
              <button
                onClick={() => classroomRef.current?.broadcast({ type: 'BOARD_UPDATE', payload: { boardState, nextColor: derivedNextColor, markers: markers } })}
                className="premium-button w-full flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" /> Force Sync
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
