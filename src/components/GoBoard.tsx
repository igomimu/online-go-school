// Simplified GoBoard for Web
import { forwardRef, useMemo, useEffect, useRef, type ReactElement } from 'react';
import type { TerritoryOwner } from '../utils/scoring';
import { useViewBox } from '../hooks/useViewBox';
import { clientToBoardPoint, smoothPathD } from '../utils/drawingUtils';

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
    /** 変化手順に入ってから振り直した番号（numberMode='branch' のときだけ使う） */
    branchNumber?: number;
}

/**
 * 石に出す手番号の見せ方。Pocket KataGo と同じ 3 段。
 * off = 数字なし / all = 通し手数 / branch = 変化手順だけ 1 から振り直す
 */
export type NumberMode = 'off' | 'all' | 'branch';

export type BoardState = (Stone | null)[][];

export interface Marker {
    x: number;
    y: number;
    type: 'LABEL' | 'SYMBOL';
    value: string; // 'A'...'Z' or 'TRI','CIR','SQR','X'
}

export interface Drawing {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    /**
     * line / arrow は交点から交点への直線1本。
     * free は手でなぞった軌跡そのもので、points が本体（2026-09-05 三村さん）。
     * free でも fromX/fromY に先頭点、toX/toY に末尾点を入れておき、
     * 既存の消去・配信の前提をそのまま使えるようにする。
     */
    type: 'line' | 'arrow' | 'free';
    /** free のときの軌跡（盤座標・小数）。交点に丸めない */
    points?: { x: number; y: number }[];
}

export interface AnalysisOverlay {
    x: number;
    y: number;
    rank: number;
    winrate: number;
    scoreLead: number;
    visits: number;
}

export interface PvStone {
    x: number;
    y: number;
    color: 'B' | 'W';
    number: number;
}

export interface GoBoardProps {
    boardState: BoardState;
    boardSize: number;
    className?: string;
    maxHeight?: string;

    viewRange?: ViewRange;
    showCoordinates?: boolean;
    /** @deprecated numberMode を使う（true は numberMode='all' と同じ） */
    showNumbers?: boolean;
    numberMode?: NumberMode;
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

    /**
     * 曲線を描くための口（2026-09-05 三村さん）。マス目の onMouseEnter とは別に
     * 盤の上の実座標（交点に丸めない小数）を渡す。有効な間は1本目のポインタを描画に使い、
     * ピンチズームには渡さない。
     */
    freeDrawEnabled?: boolean;
    onFreeDrawStart?: (point: { x: number; y: number }) => void;
    onFreeDrawMove?: (point: { x: number; y: number }) => void;
    onFreeDrawEnd?: () => void;

    markers?: Marker[];
    drawings?: Drawing[];
    analysisOverlay?: AnalysisOverlay[];
    pvOverlay?: PvStone[];
    hoveredCandidateIndex?: number | null;
    onCandidateHover?: (rank: number | null) => void;
    activeColor?: StoneColor;
    readOnly?: boolean;

    // Ghost stone (hover preview)
    ghostPosition?: { x: number; y: number } | null;
    ghostColor?: StoneColor;

    // Scoring overlay
    territoryMap?: TerritoryOwner[][];
    deadStones?: Set<string>;       // "x,y" (1-indexed)

    // ピンチズーム/パン（pokekata由来のuseViewBox）の現在の倍率を親に通知する
    onZoomChange?: (zoom: number) => void;
}

const GoBoard = forwardRef<SVGSVGElement, GoBoardProps>(({
    boardState,
    boardSize,
    className = '',
    maxHeight = 'calc(100vh - 16rem)',
    viewRange,
    showCoordinates = false,
    showNumbers = false,
    numberMode,
    isMonochrome = false,
    onCellClick,
    onCellRightClick,
    onBoardWheel,
    onCellMouseEnter,
    onCellMouseLeave,
    onDragStart,
    onDragMove,
    onDragEnd,
    freeDrawEnabled = false,
    onFreeDrawStart,
    onFreeDrawMove,
    onFreeDrawEnd,
    markers,
    drawings,
    analysisOverlay = [],
    pvOverlay,
    hoveredCandidateIndex,
    onCandidateHover,
    readOnly = false,
    ghostPosition,
    ghostColor,
    territoryMap,
    deadStones,
    onZoomChange,
}, ref) => {
    const CELL_SIZE = 40;
    const MARGIN = 40;

    // numberMode を指定しない旧来の呼び出し（showNumbers）も動かす
    const effectiveNumberMode: NumberMode = numberMode ?? (showNumbers ? 'all' : 'off');

    // useMemo の依存に出せるよう、毎レンダー新しい物体を作らない
    // （素の派生値のままだと viewBox の memo が毎回作り直しになる）
    const effectiveViewRange = useMemo(() => viewRange || {
        minX: 1, maxX: boardSize, minY: 1, maxY: boardSize
    }, [viewRange, boardSize]);

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
        if (s === 7) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
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
    }, [effectiveViewRange, showCoordinates, boardSize]);

    // タッチのピンチズーム/パン（pokekata由来）。マウス/ペン入力は素通りするため
    // 既存のマウス操作・描画ドラッグには影響しない。
    const {
        viewBox,
        currentVb,
        zoom,
        handleGesturePointerDown,
        handleGesturePointerMove,
        handleGesturePointerUp,
        handleGesturePointerCancel,
        isGesturing,
    } = useViewBox({ x: viewBoxData.x, y: viewBoxData.y, w: viewBoxData.w, h: viewBoxData.h });

    useEffect(() => {
        onZoomChange?.(zoom);
    }, [zoom, onZoomChange]);

    // 曲線を描いている最中のポインタ。描いている間はピンチズームへ渡さず、
    // 盤の外へ出ても追えるようにポインタを捕まえておく。
    const drawPointerIdRef = useRef<number | null>(null);

    const boardPointFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return clientToBoardPoint(rect, currentVb, e.clientX, e.clientY, MARGIN, CELL_SIZE);
    };

    const endFreeDraw = (e: React.PointerEvent<SVGSVGElement>) => {
        drawPointerIdRef.current = null;
        try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* 既に外れていても構わない */ }
        onFreeDrawEnd?.();
    };

    const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        // マウスは左ボタンのときだけ。2本目以降の指は描画に使わない
        const usable = e.pointerType !== 'mouse' || e.button === 0;
        if (freeDrawEnabled && usable && drawPointerIdRef.current === null) {
            drawPointerIdRef.current = e.pointerId;
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* 捕まえられなくても描ける */ }
            e.preventDefault();
            onFreeDrawStart?.(boardPointFromEvent(e));
            return;
        }
        if (handleGesturePointerDown(e)) e.preventDefault();
    };
    const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (drawPointerIdRef.current === e.pointerId) {
            e.preventDefault();
            onFreeDrawMove?.(boardPointFromEvent(e));
            return;
        }
        if (handleGesturePointerMove(e)) e.preventDefault();
    };
    const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
        if (drawPointerIdRef.current === e.pointerId) {
            e.preventDefault();
            endFreeDraw(e);
            return;
        }
        if (handleGesturePointerUp(e)) e.preventDefault();
    };
    const handleSvgPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
        if (drawPointerIdRef.current === e.pointerId) {
            endFreeDraw(e);
            return;
        }
        handleGesturePointerCancel(e);
    };

    const lines = [];
    for (let i = 1; i <= boardSize; i++) {
        const pos = MARGIN + (i - 1) * CELL_SIZE;
        const start = MARGIN;
        const end = MARGIN + (boardSize - 1) * CELL_SIZE;
        const isBorder = i === 1 || i === boardSize;
        const width = isBorder ? BORDER_WIDTH : LINE_WIDTH;

        lines.push(<line key={`v-${i}`} x1={pos} y1={start} x2={pos} y2={end} stroke="black" strokeWidth={width} strokeLinecap="square" shapeRendering="geometricPrecision" />);
        lines.push(<line key={`h-${i}`} x1={start} y1={pos} x2={end} y2={pos} stroke="black" strokeWidth={width} strokeLinecap="square" shapeRendering="geometricPrecision" />);
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
                        data-cell={`${x}-${y}`}
                        x={cx - CELL_SIZE / 2} y={cy - CELL_SIZE / 2}
                        width={CELL_SIZE} height={CELL_SIZE}
                        fill="transparent"
                        onMouseDown={(e) => { e.preventDefault(); if (e.buttons === 1) onDragStart?.(x, y); }}
                        onContextMenu={(e) => { e.preventDefault(); onCellRightClick?.(x, y); }}
                        onMouseEnter={(e) => { onCellMouseEnter?.(x, y); if (e.buttons === 1) onDragMove?.(x, y); }}
                        onMouseLeave={() => onCellMouseLeave?.()}
                        onMouseUp={onDragEnd}
                        onClick={() => { if (isGesturing()) return; onCellClick?.(x, y); }}
                        // これから石が落ちる場所を、盤に落ちた影として示す。
                        // （旧 hover:fill-blue-500 hover:fill-opacity-10 は Tailwind に
                        //   fill-opacity ユーティリティが無く半透明が効かないため、
                        //   木目の上に真っ青な四角が出ていた）
                        className="cursor-pointer fill-transparent hover:fill-[rgba(21,20,15,0.16)]"
                    />
                );
            }

            if (stone) {
                const isBlack = stone.color === 'BLACK';
                cells.push(
                    <g key={`s-group-${x}-${y}`} data-stone={`${x}-${y}`} className="pointer-events-none" filter="url(#stoneShadow)">
                        <circle cx={cx} cy={cy} r={STONE_RADIUS} fill={isBlack ? "url(#stoneBlack)" : "url(#stoneWhite)"} stroke={isBlack ? "#000000" : "#3a3a3a"} strokeWidth={isBlack ? 2 : 1.5} />
                        {(() => {
                            // 変化手順モードでは、変化に入ってからの石だけに番号が付く
                            const shown = effectiveNumberMode === 'all'
                                ? stone.number
                                : effectiveNumberMode === 'branch'
                                    ? stone.branchNumber
                                    : undefined;
                            if (!shown) return null;
                            // 3桁は石からはみ出すので字を詰める（Pocket KataGo と同じ）
                            const text = String(shown);
                            const isLong = text.length >= 3;
                            return (
                                <text
                                    x={cx} y={cy} dy=".35em"
                                    textAnchor="middle"
                                    fill={isBlack ? "#FFFFFF" : "#000000"}
                                    fontSize={isLong ? CELL_SIZE * 0.42 : FONT_SIZE}
                                    fontWeight={isLong ? "600" : "bold"}
                                    letterSpacing={isLong ? "-0.5" : undefined}
                                >{text}</text>
                            );
                        })()}
                    </g>
                );
            }
        }
    }

    // Ghost stone (hover preview)
    let ghostElement: ReactElement | null = null;
    if (ghostPosition && ghostColor && !boardState[ghostPosition.y - 1]?.[ghostPosition.x - 1]) {
        const gx = MARGIN + (ghostPosition.x - 1) * CELL_SIZE;
        const gy = MARGIN + (ghostPosition.y - 1) * CELL_SIZE;
        const isBlack = ghostColor === 'BLACK';
        ghostElement = (
            <circle
                key="ghost"
                cx={gx} cy={gy} r={STONE_RADIUS}
                fill={isBlack ? '#000000' : '#FFFFFF'}
                stroke="#000000" strokeWidth={2}
                opacity={0.35}
                className="pointer-events-none"
            />
        );
    }

    const markerElements: ReactElement[] = [];
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
                            data-testid={`marker-TRI-${marker.x}-${marker.y}`}
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

    // Territory overlay (scoring mode)
    const territoryElements: ReactElement[] = [];
    if (territoryMap) {
        const TERR_SIZE = CELL_SIZE * 0.22;
        for (let y = 1; y <= boardSize; y++) {
            for (let x = 1; x <= boardSize; x++) {
                const owner = territoryMap[y - 1]?.[x - 1];
                if (!owner) continue;
                const cx = MARGIN + (x - 1) * CELL_SIZE;
                const cy = MARGIN + (y - 1) * CELL_SIZE;
                const fill = owner === 'BLACK' ? '#000000' : '#FFFFFF';
                const stroke = owner === 'BLACK' ? 'none' : '#000000';
                territoryElements.push(
                    <rect
                        key={`terr-${x}-${y}`}
                        x={cx - TERR_SIZE} y={cy - TERR_SIZE}
                        width={TERR_SIZE * 2} height={TERR_SIZE * 2}
                        fill={fill} stroke={stroke} strokeWidth={0.5}
                        opacity={0.7}
                        className="pointer-events-none"
                    />
                );
            }
        }
    }

    // Dead stone markers (X on dead stones)
    const deadStoneElements: ReactElement[] = [];
    if (deadStones && deadStones.size > 0) {
        const DS = STONE_RADIUS * 0.55;
        for (const key of deadStones) {
            const [xStr, yStr] = key.split(',');
            const x = parseInt(xStr);
            const y = parseInt(yStr);
            const cx = MARGIN + (x - 1) * CELL_SIZE;
            const cy = MARGIN + (y - 1) * CELL_SIZE;
            const stone = boardState[y - 1]?.[x - 1];
            const color = stone?.color === 'BLACK' ? '#FF4444' : '#FF4444';
            deadStoneElements.push(
                <g key={`dead-${x}-${y}`} className="pointer-events-none">
                    <circle cx={cx} cy={cy} r={STONE_RADIUS} fill="transparent" opacity={0.3}
                        stroke={color} strokeWidth={2} />
                    <line x1={cx - DS} y1={cy - DS} x2={cx + DS} y2={cy + DS}
                        stroke={color} strokeWidth={2.5} />
                    <line x1={cx + DS} y1={cy - DS} x2={cx - DS} y2={cy + DS}
                        stroke={color} strokeWidth={2.5} />
                </g>
            );
        }
    }

    // Drawing overlay (lines, arrows & free curves)
    // 太さは「マジックペンの感じ」に寄せる（2026-09-05 三村さん）。CELL_SIZE=40 に対して
    // 曲線は 2 割、矢印は少し細く。矢印の頭は markerUnits 既定で線の太さに追随する。
    const DRAW_STROKE_WIDTH = 8;
    const ARROW_STROKE_WIDTH = 5;
    const drawingElements: ReactElement[] = [];
    if (drawings) {
        drawings.forEach((d, i) => {
            if (d.type === 'free') {
                const points = (d.points ?? []).map(p => ({
                    x: MARGIN + (p.x - 1) * CELL_SIZE,
                    y: MARGIN + (p.y - 1) * CELL_SIZE,
                }));
                if (points.length === 0) return;
                drawingElements.push(
                    <path
                        key={`draw-${i}`}
                        data-testid="board-free-drawing"
                        d={smoothPathD(points)}
                        fill="none"
                        stroke="#e53e3e" strokeWidth={DRAW_STROKE_WIDTH}
                        strokeLinecap="round" strokeLinejoin="round"
                        className="pointer-events-none"
                        opacity={0.85}
                    />
                );
                return;
            }
            const x1 = MARGIN + (d.fromX - 1) * CELL_SIZE;
            const y1 = MARGIN + (d.fromY - 1) * CELL_SIZE;
            const x2 = MARGIN + (d.toX - 1) * CELL_SIZE;
            const y2 = MARGIN + (d.toY - 1) * CELL_SIZE;
            drawingElements.push(
                <line
                    key={`draw-${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#e53e3e" strokeWidth={ARROW_STROKE_WIDTH} strokeLinecap="round"
                    markerEnd={d.type === 'arrow' ? 'url(#arrowhead)' : undefined}
                    className="pointer-events-none"
                    opacity={0.85}
                />
            );
        });
    }

    // Pocket KataGoと同じ候補手表示。1位=水色、2位=緑、3位以降=黄。
    // 数値は上から勝率・visits・目数差を表す。
    const analysisElements = analysisOverlay.map(item => {
        const cx = MARGIN + (item.x - 1) * CELL_SIZE;
        const cy = MARGIN + (item.y - 1) * CELL_SIZE;
        const isHovered = hoveredCandidateIndex === item.rank;
        const dimmed = pvOverlay && !isHovered;
        const fill = item.rank === 0
            ? 'rgba(56,189,248,0.94)'
            : item.rank === 1
                ? 'rgba(34,197,94,0.94)'
                : 'rgba(250,204,21,0.94)';
        return (
            <g
                key={`ai-${item.rank}-${item.x}-${item.y}`}
                data-testid={`ai-candidate-${item.rank}`}
                className="pointer-events-none"
                style={{ opacity: dimmed ? 0.2 : 1 }}
            >
                <circle cx={cx} cy={cy} r={CELL_SIZE * 0.58} fill={fill}
                    stroke={isHovered ? '#fff' : 'rgba(20,20,20,0.25)'} strokeWidth={isHovered ? 2.5 : 1} />
                <text x={cx} y={cy - CELL_SIZE * 0.69} textAnchor="middle" dominantBaseline="middle"
                    fill="#18181b" fontSize={CELL_SIZE * 0.30} fontWeight="bold">{item.rank + 1}</text>
                <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle"
                    fill="#18181b" fontSize={CELL_SIZE * 0.42} fontWeight="bold">{item.winrate.toFixed(1)}</text>
                <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
                    fill="#27272a" fontSize={CELL_SIZE * 0.34} fontWeight="bold">
                    {item.visits >= 1000 ? `${(item.visits / 1000).toFixed(1)}k` : item.visits}
                </text>
                <text x={cx} y={cy + 17} textAnchor="middle" dominantBaseline="middle"
                    fill="#18181b" fontSize={CELL_SIZE * 0.34} fontWeight="bold">
                    {item.scoreLead >= 0 ? '+' : ''}{item.scoreLead.toFixed(1)}
                </text>
            </g>
        );
    });

    // 候補へマウスを置いた時の予想手順(PV)。実際の石と同じ黒白で番号を表示する。
    const pvElements = (pvOverlay || []).map(pv => {
        if (boardState[pv.y - 1]?.[pv.x - 1]) return null;
        const cx = MARGIN + (pv.x - 1) * CELL_SIZE;
        const cy = MARGIN + (pv.y - 1) * CELL_SIZE;
        const isBlack = pv.color === 'B';
        return (
            <g key={`pv-${pv.number}-${pv.x}-${pv.y}`} data-testid={`pv-stone-${pv.number}`} className="pointer-events-none">
                <circle cx={cx} cy={cy} r={STONE_RADIUS}
                    fill={isBlack ? '#171717' : '#f4f4f5'} stroke="#000" strokeWidth={2} />
                <text x={cx} y={cy} dy=".35em" textAnchor="middle"
                    fill={isBlack ? '#fff' : '#000'} fontSize={pv.number >= 10 ? CELL_SIZE * 0.42 : CELL_SIZE * 0.5}
                    fontWeight="bold">{pv.number}</text>
            </g>
        );
    });

    // 講師盤だけ、候補位置へ透明なホバー面を置く。生徒盤は講師の操作結果を見る専用。
    const candidateHoverTargets = onCandidateHover ? analysisOverlay.map(item => {
        const cx = MARGIN + (item.x - 1) * CELL_SIZE;
        const cy = MARGIN + (item.y - 1) * CELL_SIZE;
        return (
            <rect
                key={`ai-hover-${item.rank}`}
                data-testid={`ai-candidate-hover-${item.rank}`}
                x={cx - CELL_SIZE / 2} y={cy - CELL_SIZE / 2}
                width={CELL_SIZE} height={CELL_SIZE}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => {
                    onCandidateHover?.(item.rank);
                    onCellMouseEnter?.(item.x, item.y);
                }}
                onMouseLeave={() => {
                    onCandidateHover?.(null);
                    onCellMouseLeave?.();
                }}
                onClick={() => { if (!readOnly && !isGesturing()) onCellClick?.(item.x, item.y); }}
            />
        );
    }) : [];

    return (
        <svg
            ref={ref}
            data-testid="go-board"
            viewBox={viewBox}
            xmlns="http://www.w3.org/2000/svg"
            className={`select-none mx-auto block w-full max-w-[800px] ${className}`}
            style={{
                aspectRatio: '1 / 1',
                maxHeight,
                touchAction: 'none',
                borderRadius: '6px',
                boxShadow: isMonochrome
                    ? undefined
                    // 盤の厚み（側面）は天面の明るさに合わせた木口色。天面を明るくしたら側面も追随させる。
                    : '3px 4px 0 0 #c68c4e, 6px 8px 0 0 #906836, 0 14px 28px rgba(0,0,0,0.45)',
            }}
            shapeRendering="geometricPrecision"
            onMouseUp={onDragEnd}
            onMouseLeave={onDragEnd}
            onWheel={(e) => {
                // onBoardWheelを使う画面(検討モード等)のみpreventDefaultしてページスクロールを止める。
                // 未使用の画面(対局盤等)には一切影響しない。
                if (onBoardWheel) {
                    e.preventDefault();
                    onBoardWheel(e.deltaY);
                }
            }}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerCancel}
        >
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#e53e3e" />
                </marker>
                <radialGradient id="stoneBlack" cx="35%" cy="30%" r="75%">
                    <stop offset="0%" stopColor="#5a5a5a" />
                    <stop offset="40%" stopColor="#1a1a1a" />
                    <stop offset="100%" stopColor="#000000" />
                </radialGradient>
                <radialGradient id="stoneWhite" cx="35%" cy="30%" r="75%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="55%" stopColor="#f0ede4" />
                    <stop offset="100%" stopColor="#d8d2c0" />
                </radialGradient>
                <filter id="stoneShadow" x="-60%" y="-60%" width="220%" height="220%">
                    <feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" floodColor="#000000" floodOpacity={0.45} />
                </filter>
            </defs>
            {isMonochrome ? (
                <rect x={viewBoxData.x} y={viewBoxData.y} width={viewBoxData.w} height={viewBoxData.h} fill="white" stroke="none" />
            ) : (
                // 木目は毎回SVGフィルターで計算せず、事前生成した静的画像(public/wood-board-texture-v2.webp)を
                // 敷き詰める。feTurbulenceは盤の新規マウントごとに計算コストが乗る(実測: 1盤あたり約
                // 5〜10ms、12盤同時表示で約40ms)ため、低スペック端末での多面打ち・画面遷移の負荷を避ける。
                <image
                    href="/wood-board-texture-v2.webp"
                    x={viewBoxData.x} y={viewBoxData.y} width={viewBoxData.w} height={viewBoxData.h}
                    preserveAspectRatio="none"
                />
            )}
            {lines}
            {coords}
            {starPoints.map(([sx, sy], i) => (
                <circle key={`star-${i}`} cx={MARGIN + (sx - 1) * CELL_SIZE} cy={MARGIN + (sy - 1) * CELL_SIZE} r={STAR_POINT_RADIUS} fill="#000000" />
            ))}
            {cells}
            {ghostElement}
            {territoryElements}
            {deadStoneElements}
            {markerElements}
            {drawingElements}
            {analysisElements}
            {pvElements}
            {candidateHoverTargets}
        </svg>
    );
});

GoBoard.displayName = 'GoBoard';
export default GoBoard;
