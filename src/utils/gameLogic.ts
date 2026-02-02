import type { BoardState, StoneColor } from "../components/GoBoard";

export function createEmptyBoard(size: number): BoardState {
    return Array(size).fill(null).map(() => Array(size).fill(null));
}

/**
 * Checks for captured stones after a move.
 * Returns { board: BoardState, capturedCount: number }
 */
export function checkCapture(
    board: BoardState,
    lastMoveX: number, // 1-indexed (from App)
    lastMoveY: number, // 1-indexed (from App)
    placedColor: StoneColor,
    size: number
): { board: BoardState, capturedCount: number } {
    const x = lastMoveX - 1;
    const y = lastMoveY - 1;
    const opponentColor = placedColor === 'BLACK' ? 'WHITE' : 'BLACK';
    const newBoard = board.map(row => [...row]);
    let totalCaptured = 0;

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            const neighbor = newBoard[ny][nx];
            if (neighbor && neighbor.color === opponentColor) {
                const group: { x: number, y: number }[] = [];
                if (!hasLiberties(newBoard, nx, ny, opponentColor, group)) {
                    totalCaptured += group.length;
                    group.forEach(pos => {
                        newBoard[pos.y][pos.x] = null;
                    });
                }
            }
        }
    }

    return { board: newBoard, capturedCount: totalCaptured };
}

function hasLiberties(
    board: BoardState,
    startX: number,
    startY: number,
    color: StoneColor,
    group: { x: number, y: number }[]
): boolean {
    const size = board.length;
    const visited = new Set<string>();
    const stack = [{ x: startX, y: startY }];

    visited.add(`${startX},${startY}`);
    group.push({ x: startX, y: startY });

    while (stack.length > 0) {
        const { x, y } = stack.pop()!;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                const neighbor = board[ny][nx];
                const key = `${nx},${ny}`;

                if (!neighbor) {
                    return true;
                } else if (neighbor.color === color) {
                    if (!visited.has(key)) {
                        visited.add(key);
                        group.push({ x: nx, y: ny });
                        stack.push({ x: nx, y: ny });
                    }
                }
            }
        }
    }
    return false;
}
