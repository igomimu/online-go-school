// Simplified GoBoard for Web
import { forwardRef, useMemo } from 'react';

export interface ViewRange {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export type StoneColor = 'BLACK' | 'WHITE';

export interface Stone {
    color: StoneColor;
    number?: number;
}

export type BoardState = (Stone | null)[][];

export interface Marker {
    x: number;
    y: number;
    type: 'LABEL' | 'SYMBOL';
    value: string; // 'A'...'Z' or 'TRI','CIR','SQR','X'
}

export interface GoBoardProps {
    boardState: BoardState;
    boardSize: number;

    viewRange?: ViewRange;
    showCoordinates?: boolean;
    showNumbers?: boolean;
    isMonochrome?: boolean;

    // Interactions
    onCellClick?: (x: number, y: number) => void;
    onCellRightClick?: (x: number, y: number) => void;
    onBoardWheel?: (delta: number) => void;
    onCellMouseEnter?: (x: number, y: number) => void;
    onCellMouseLeave?: () => void;

    selectionStart?: { x: number, y: number } | null;
    selectionEnd?: { x: number, y: number } | null;

    onDragStart?: (x: number, y: number) => void;
    onDragMove?: (x: number, y: number) => void;
    onDragEnd?: () => void;

    markers?: Marker[];
    activeColor?: StoneColor;
    readOnly?: boolean;
}

const GoBoard = forwardRef<SVGSVGElement, GoBoardProps>(({
    boardState,
    boardSize,
    viewRange,
    showCoordinates = true,
    showNumbers = false,
    isMonochrome = false,
    onCellClick,
    onCellRightClick,
    onBoardWheel,
    onCellMouseEnter,
    onCellMouseLeave,
    onDragStart,
    onDragMove,
    onDragEnd,
    readOnly = false,
}, ref) => {
    const CELL_SIZE = 40;
    const MARGIN = 40;

    const effectiveViewRange = viewRange || {
        minX: 1, maxX: boardSize, minY: 1, maxY: boardSize
    };

    const LINE_WIDTH = 1;
    const BORDER_WIDTH = 2;
    const STONE_RADIUS = CELL_SIZE * 0.46;
    const FONT_SIZE = CELL_SIZE * 0.65;
    const COORD_FONT_SIZE = 14;
    const STAR_POINT_RADIUS = 3.5;

    const getStarPoints = (size: number) => {
        const s = Number(size);
        if (s === 19) return [[4, 4], [10, 4], [16, 4], [4, 10], [10, 10], [16, 10], [4, 16], [10, 16], [16, 16]];
        if (s === 17) return [[4, 4], [9, 4], [14, 4], [4, 9], [9, 9], [14, 9], [4, 14], [9, 14], [14, 14]];
        if (s === 15) return [[4, 4], [8, 4], [12, 4], [4, 8], [8, 8], [12, 8], [4, 12], [8, 12], [12, 12]];
        if (s === 13) return [[4, 4], [7, 4], [10, 4], [4, 7], [7, 7], [10, 7], [4, 10], [7, 10], [10, 10]];
        if (s === 11) return [[3, 3], [6, 3], [9, 3], [3, 6], [6, 6], [9, 6], [3, 9], [6, 9], [9, 9]];
        if (s === 9) return [[3, 3], [7, 3], [5, 5], [3, 7], [7, 7]];
        return [];
    };

    const starPoints = getStarPoints(boardSize);

    const viewBoxData = useMemo(() => {
        const { minX, maxX, minY, maxY } = effectiveViewRange;
        const validMinX = Math.max(1, minX);
        const validMaxX = Math.min(boardSize, maxX);
        const validMinY = Math.max(1, minY);
        const validMaxY = Math.min(boardSize, maxY);

        const x = MARGIN + (validMinX - 1) * CELL_SIZE - CELL_SIZE / 2;
        const y = MARGIN + (validMinY - 1) * CELL_SIZE - CELL_SIZE / 2;
        const width = (validMaxX - validMinX + 1) * CELL_SIZE;
        const height = (validMaxY - validMinY + 1) * CELL_SIZE;

        let finalX = x;
        let finalY = y;
        let finalW = width;
        let finalH = height;

        if (showCoordinates) {
            finalX -= 25; finalY -= 25; finalW += 50; finalH += 50;
        }

        return { x: finalX, y: finalY, w: finalW, h: finalH, str: `${finalX} ${finalY} ${finalW} ${finalH}` };
    }, [viewRange, showCoordinates, boardSize]);

    const lines = [];
    for (let i = 1; i <= boardSize; i++) {
        const pos = MARGIN + (i - 1) * CELL_SIZE;
        const start = MARGIN;
        const end = MARGIN + (boardSize - 1) * CELL_SIZE;
        const isBorder = i === 1 || i === boardSize;
        const width = isBorder ? BORDER_WIDTH : LINE_WIDTH;

        lines.push(<line key={`v-${i}`} x1={pos} y1={start} x2={pos} y2={end} stroke="black" strokeWidth={width} strokeLinecap="square" shapeRendering="crispEdges" />);
        lines.push(<line key={`h-${i}`} x1={start} y1={pos} x2={end} y2={pos} stroke="black" strokeWidth={width} strokeLinecap="square" shapeRendering="crispEdges" />);
    }

    const coords = [];
    if (showCoordinates) {
        const getLabel = (n: number) => n >= 9 ? String.fromCharCode(65 + n) : String.fromCharCode(64 + n);
        for (let i = 1; i <= boardSize; i++) {
            const pos = MARGIN + (i - 1) * CELL_SIZE;
            coords.push(<text key={`cx-${i}`} x={pos} y={MARGIN - 25} textAnchor="middle" fontSize={COORD_FONT_SIZE} fill="black" fontWeight="bold">{getLabel(i)}</text>);
            coords.push(<text key={`cy-${i}`} x={MARGIN - 25} y={pos + 5} textAnchor="middle" fontSize={COORD_FONT_SIZE} fill="black" fontWeight="bold">{boardSize - i + 1}</text>);
        }
    }

    const cells = [];
    for (let y = 1; y <= boardSize; y++) {
        for (let x = 1; x <= boardSize; x++) {
            const cx = MARGIN + (x - 1) * CELL_SIZE;
            const cy = MARGIN + (y - 1) * CELL_SIZE;
            const stone = boardState[y - 1]?.[x - 1];

            if (!readOnly) {
                cells.push(
                    <rect
                        key={`click-${x}-${y}`}
                        x={cx - CELL_SIZE / 2} y={cy - CELL_SIZE / 2}
                        width={CELL_SIZE} height={CELL_SIZE}
                        fill="transparent"
                        onMouseDown={(e) => { e.preventDefault(); if (e.buttons === 1) onDragStart?.(x, y); }}
                        onContextMenu={(e) => { e.preventDefault(); onCellRightClick?.(x, y); }}
                        onMouseEnter={(e) => { onCellMouseEnter?.(x, y); if (e.buttons === 1) onDragMove?.(x, y); }}
                        onMouseLeave={() => onCellMouseLeave?.()}
                        onMouseUp={onDragEnd}
                        onClick={() => onCellClick?.(x, y)}
                        className="cursor-pointer hover:fill-blue-500 hover:fill-opacity-10"
                    />
                );
            }

            if (stone) {
                const isBlack = stone.color === 'BLACK';
                cells.push(
                    <g key={`s-group-${x}-${y}`} className="pointer-events-none">
                        <circle cx={cx} cy={cy} r={STONE_RADIUS} fill={isBlack ? "#000000" : "#FFFFFF"} stroke="#000000" strokeWidth={2} />
                        {showNumbers && stone.number && (
                            <text x={cx} y={cy} dy=".35em" textAnchor="middle" fill={isBlack ? "#FFFFFF" : "#000000"} fontSize={FONT_SIZE} fontWeight="bold">{stone.number}</text>
                        )}
                    </g>
                );
            }
        }
    }

    const markerElements = [];
    if (markers) {
        markers.forEach((marker, i) => {
            const mx = MARGIN + (marker.x - 1) * CELL_SIZE;
            const my = MARGIN + (marker.y - 1) * CELL_SIZE;
            const stone = boardState[marker.y - 1]?.[marker.x - 1];
            // If there is a stone, we need contrasting color (White on Black, Black on White)
            // If no stone, default to black (or blue/red for emphasis?) - classic SGF is usually black on board.

            let color = "black";
            if (stone) {
                color = stone.color === 'BLACK' ? 'white' : 'black';
            }

            const k = `m-${i}-${marker.x}-${marker.y}`;

            if (marker.type === 'LABEL') {
                markerElements.push(
                    <text key={k} x={mx} y={my} dy=".35em" textAnchor="middle"
                        fill={color}
                        fontSize={FONT_SIZE * 0.8}
                        fontWeight="bold"
                        className="pointer-events-none"
                    >
                        {marker.value}
                    </text>
                );
            } else if (marker.type === 'SYMBOL') {
                const r = STONE_RADIUS * 0.6;
                if (marker.value === 'TRI') {
                    // Triangle
                    const h = r * Math.sqrt(3) / 2;
                    markerElements.push(
                        <polygon key={k}
                            points={`${mx},${my - r} ${mx + h},${my + r / 2} ${mx - h},${my + r / 2}`}
                            fill="none" stroke={color} strokeWidth={2} className="pointer-events-none"
                        />
                    );
                } else if (marker.value === 'CIR') {
                    markerElements.push(
                        <circle key={k} cx={mx} cy={my} r={r * 0.8} fill="none" stroke={color} strokeWidth={2} className="pointer-events-none" />
                    );
                } else if (marker.value === 'SQR') {
                    const s = r * 1.2;
                    markerElements.push(
                        <rect key={k} x={mx - s / 2} y={my - s / 2} width={s} height={s} fill="none" stroke={color} strokeWidth={2} className="pointer-events-none" />
                    );
                } else if (marker.value === 'X') { // MA
                    const s = r * 0.7;
                    markerElements.push(
                        <g key={k} stroke={color} strokeWidth={2} className="pointer-events-none">
                            <line x1={mx - s} y1={my - s} x2={mx + s} y2={my + s} />
                            <line x1={mx + s} y1={my - s} x2={mx - s} y2={my + s} />
                        </g>
                    );
                }
            }
        });
    }

    return (
        <svg
            ref={ref}
            viewBox={viewBoxData.str}
            xmlns="http://www.w3.org/2000/svg"
            className="select-none w-full h-auto max-w-[800px] mx-auto"
            onMouseUp={onDragEnd}
            onMouseLeave={onDragEnd}
            onWheel={(e) => onBoardWheel?.(e.deltaY)}
        >
            <rect x={viewBoxData.x} y={viewBoxData.y} width={viewBoxData.w} height={viewBoxData.h} fill={isMonochrome ? 'white' : '#DCB35C'} stroke="none" />
            {lines}
            {coords}
            {starPoints.map(([sx, sy], i) => (
                <circle key={`star-${i}`} cx={MARGIN + (sx - 1) * CELL_SIZE} cy={MARGIN + (sy - 1) * CELL_SIZE} r={STAR_POINT_RADIUS} fill="#000000" />
            ))}
            {cells}
            {markerElements}
        </svg>
    );
});

GoBoard.displayName = 'GoBoard';
export default GoBoard;
