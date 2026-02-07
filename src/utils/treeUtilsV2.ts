import type { BoardState, StoneColor, Marker } from '../components/GoBoard';
import { checkCapture } from './gameLogic';

export interface GameNode {
    id: string;
    parent: GameNode | null;
    children: GameNode[];
    board: BoardState;
    nextNumber: number;
    activeColor: StoneColor;
    boardSize: number;
    markers: Marker[];
    move?: { x: number, y: number, color: StoneColor };
}

export const createNode = (
    parent: GameNode | null,
    board: BoardState,
    nextNumber: number,
    activeColor: StoneColor,
    boardSize: number,
    move?: { x: number, y: number, color: StoneColor }
): GameNode => {
    return {
        id: Math.random().toString(36).substr(2, 9),
        parent,
        children: [],
        board,
        nextNumber,
        activeColor,
        boardSize,
        markers: [],
        move
    };
};

export const findNode = (root: GameNode, id: string): GameNode | null => {
    if (root.id === id) return root;
    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

export const getPath = (root: GameNode, targetId: string): GameNode[] => {
    const target = findNode(root, targetId);
    if (!target) return [root];
    const path: GameNode[] = [];
    let curr: GameNode | null = target;
    while (curr) {
        path.unshift(curr);
        curr = curr.parent;
    }
    return path;
};

export const addMove = (
    parent: GameNode,
    board: BoardState,
    nextNumber: number,
    activeColor: StoneColor,
    boardSize: number,
    move: { x: number, y: number, color: StoneColor }
): GameNode => {
    // Check if duplicate move exists in children
    const existing = parent.children.find(c =>
        c.move && c.move.x === move.x && c.move.y === move.y && c.move.color === move.color
    );
    if (existing) {
        return existing;
    }

    // Create new (will create branch if parent already has children)
    const newNode = createNode(parent, board, nextNumber, activeColor, boardSize, move);
    parent.children.push(newNode);
    return newNode;
};

export const recalculateBoards = (node: GameNode) => {
    // This function assumes 'node' has the CORRECT board (e.g. Root was updated manually).
    // We update all children recursively based on their moves.

    for (const child of node.children) {
        if (child.move) {
            // Re-apply move logic
            // 1. Copy parent board
            let newBoard: BoardState = node.board.map(row => row.map(cell => cell ? { ...cell } : null));

            const { x, y, color } = child.move;
            // Place stone (x, y are 1-based from App interaction, but board is 0-indexed)

            if (y - 1 >= 0 && y - 1 < newBoard.length && x - 1 >= 0 && x - 1 < newBoard.length) {
                newBoard[y - 1][x - 1] = {
                    color: color,
                    number: node.nextNumber
                };

                // Check captures (gameLogic uses 0-based coords)
                // Check captures (gameLogic uses 0-based coords)
                const { board: nextBoard } = checkCapture(newBoard, x, y, color, newBoard.length);
                newBoard = nextBoard;
                // Note: checkCapture already updates the board passed to it (shallow copy inside, but return value is new board).
                // But wait, checkCapture returns { board, capturedCount }.
                // And it modifies the newBoard passed to it? 
                // Let's re-read gameLogic.ts.

                // Correction: gameLogic.ts `checkCapture` creates `const newBoard = board.map...` and returns it.
                // It does NOT modify the passed board in place.
                // So we should assign the result back.
            }

            // Assign new board to child
            child.board = newBoard;

            // Recurse
            recalculateBoards(child);
        }
    }
};

export const getMainPath = (root: GameNode): GameNode[] => {
    const path: GameNode[] = [root];
    let curr = root;
    while (curr.children.length > 0) {
        curr = curr.children[0];
        path.push(curr);
    }
    return path;
};

// SGF Tree to GameTree conversion
import type { SgfTreeNode } from './sgfUtils';

export const convertSgfToGameTree = (
    sgfNode: SgfTreeNode,
    parent: GameNode | null,
    boardSize: number,
    startNumber: number,
    initialBoard: BoardState // Board state *before* this node's move
): GameNode => {

    // 1. Determine local board state
    // Apply setup (AB/AW) first if any
    let currentBoard = initialBoard.map(row => row.map(cell => cell ? { ...cell } : null));

    if (sgfNode.setup) {
        // Apply AB/AW
        // SGF coords "ab" -> 1-based logic
        const place = (coords: string[], color: StoneColor) => {
            const fromSgfCoord = (c: string) => c.toLowerCase().charCodeAt(0) - 96;
            coords.forEach(c => {
                if (c.length >= 2) {
                    const x = fromSgfCoord(c[0]);
                    const y = fromSgfCoord(c[1]);
                    if (x >= 1 && x <= boardSize && y >= 1 && y <= boardSize) {
                        currentBoard[y - 1][x - 1] = { color };
                    }
                }
            });
        };
        if (sgfNode.setup.ab) place(sgfNode.setup.ab, 'BLACK');
        if (sgfNode.setup.aw) place(sgfNode.setup.aw, 'WHITE');
        if (sgfNode.setup.ae) {
            // AE logic if needed (clearing stones)
            const fromSgfCoord = (c: string) => c.toLowerCase().charCodeAt(0) - 96;
            sgfNode.setup.ae.forEach(c => {
                if (c.length >= 2) {
                    const x = fromSgfCoord(c[0]);
                    const y = fromSgfCoord(c[1]);
                    if (x >= 1 && x <= boardSize && y >= 1 && y <= boardSize) {
                        currentBoard[y - 1][x - 1] = null;
                    }
                }
            });
        }
    }

    // Apply Move if any
    let nextNum = startNumber;
    let actColor: StoneColor = parent ? (parent.activeColor === 'BLACK' ? 'WHITE' : 'BLACK') : 'BLACK';

    if (sgfNode.move) {
        const { x, y, color } = sgfNode.move;
        actColor = color; // The one who played

        // Logic similar to addMove
        if (x >= 1 && x <= boardSize && y >= 1 && y <= boardSize) {
            currentBoard[y - 1][x - 1] = { color, number: nextNum };
            const { board: captured } = checkCapture(currentBoard, x, y, color, boardSize);
            currentBoard = captured;
            nextNum++;
        }
    }

    const gameNode: GameNode = {
        id: Math.random().toString(36).substr(2, 9),
        parent,
        children: [],
        board: currentBoard,
        nextNumber: nextNum,
        activeColor: actColor,
        boardSize,
        markers: (sgfNode.markers || []).map(m => ({ ...m, type: m.type as 'LABEL' | 'SYMBOL' })),
        move: sgfNode.move
    };


    // Recursively handle children
    if (sgfNode.children && sgfNode.children.length > 0) {
        gameNode.children = sgfNode.children.map(childSgf =>
            convertSgfToGameTree(childSgf, gameNode, boardSize, nextNum, currentBoard)
        );
    }

    return gameNode;
};
