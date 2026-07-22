import { useState, useCallback, useRef, useEffect } from 'react';

interface BaseViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface ViewState {
    zoom: number;
    panX: number; // offset in SVG coords (from center)
    panY: number;
}

interface GestureStart {
    dist: number;      // initial pinch distance (client px)
    zoom: number;      // zoom at gesture start
    panX: number;
    panY: number;
    centerX: number;   // pinch center in client px
    centerY: number;
    svgRect: DOMRect;  // cached to avoid reflow in pointermove
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 300;
const PAN_THRESHOLD = 8; // px before single-finger pan starts

interface SingleFingerPan {
    startClientX: number;
    startClientY: number;
    isPanning: boolean;
    startPanX: number;
    startPanY: number;
    svgRect: DOMRect;
}

/**
 * Pinch-zoom + pan for SVG viewBox.
 *
 * Gesture rules:
 *  - 2-finger touch → pinch-zoom + pan
 *  - Double-tap (zoom > 1) → reset to 1x
 *  - Mouse / 1-finger → pass through (stone placement)
 */
export function useViewBox(base: BaseViewBox) {
    const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });

    // Track active pointers for multi-touch
    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const gestureRef = useRef<GestureStart | null>(null);
    // true while a 2-finger gesture is in progress or just ended
    const isGesturingRef = useRef(false);
    // double-tap tracking
    const lastTapRef = useRef(0);
    const lastTapPosRef = useRef<{ x: number; y: number } | null>(null);
    // gesture-end timeout for cleanup
    const gestureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // single-finger pan when zoomed
    const singlePanRef = useRef<SingleFingerPan | null>(null);

    // Reset view when base changes (board size switch)。effect内の同期setStateではなく
    // レンダー中のstate調整パターンで書く（このrepoのeslintルールに合わせる。
    // refはレンダー中に読み書きできないためuseStateで前回値を保持する）。
    const baseKey = `${base.x},${base.y},${base.w},${base.h}`;
    const [prevBaseKey, setPrevBaseKey] = useState(baseKey);
    if (prevBaseKey !== baseKey) {
        setPrevBaseKey(baseKey);
        setView({ zoom: 1, panX: 0, panY: 0 });
    }

    // baseKey変更時のジェスチャー内部状態クリア、およびアンマウント時のタイマー破棄。
    // ref操作(clearTimeout含む)はレンダー中に行えないためeffectに置く。
    useEffect(() => {
        pointersRef.current.clear();
        gestureRef.current = null;
        isGesturingRef.current = false;
        if (gestureTimeoutRef.current) { clearTimeout(gestureTimeoutRef.current); gestureTimeoutRef.current = null; }
    }, [baseKey]);

    useEffect(() => {
        return () => { if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current); };
    }, []);

    const resetView = useCallback(() => {
        setView({ zoom: 1, panX: 0, panY: 0 });
        isGesturingRef.current = false;
    }, []);

    /** Clamp pan so that the viewport stays within the base viewBox */
    const clampPan = useCallback((zoom: number, px: number, py: number) => {
        const visW = base.w / zoom;
        const visH = base.h / zoom;
        const maxPanX = (base.w - visW) / 2;
        const maxPanY = (base.h - visH) / 2;
        return {
            panX: Math.max(-maxPanX, Math.min(maxPanX, px)),
            panY: Math.max(-maxPanY, Math.min(maxPanY, py)),
        };
    }, [base.w, base.h]);

    // --- Pointer handlers ---

    const handleGesturePointerDown = useCallback((e: React.PointerEvent) => {
        // Only handle touch pointers for gestures
        if (e.pointerType !== 'touch') return false;

        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Ignore extra fingers (3+)
        if (pointersRef.current.size > 2) return true;

        // Double-tap detection (single finger、同じ場所のみ)
        if (pointersRef.current.size === 1) {
            const now = Date.now();
            const lastPos = lastTapPosRef.current;
            const dx = lastPos ? e.clientX - lastPos.x : 999;
            const dy = lastPos ? e.clientY - lastPos.y : 999;
            const sameSpot = Math.sqrt(dx * dx + dy * dy) < 30;
            if (now - lastTapRef.current < DOUBLE_TAP_MS && sameSpot) {
                lastTapRef.current = 0;
                lastTapPosRef.current = null;
                // Suppress the click event that follows this pointer-up
                isGesturingRef.current = true;
                singlePanRef.current = null;
                if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
                gestureTimeoutRef.current = setTimeout(() => {
                    isGesturingRef.current = false;
                    gestureTimeoutRef.current = null;
                }, 300);
                if (view.zoom > 1.5) {
                    // Zoomed in → reset
                    resetView();
                } else {
                    // Zoomed out → zoom to 2.5x centered on tap position
                    const svg = e.currentTarget as SVGSVGElement;
                    const rect = svg.getBoundingClientRect();
                    const tapRatioX = (e.clientX - rect.left) / rect.width;
                    const tapRatioY = (e.clientY - rect.top) / rect.height;
                    const newZoom = 2.5;
                    // Convert tap position to pan offset from center
                    const tapPanX = (tapRatioX - 0.5) * base.w / newZoom;
                    const tapPanY = (tapRatioY - 0.5) * base.h / newZoom;
                    const clamped = clampPan(newZoom, tapPanX, tapPanY);
                    setView({ zoom: newZoom, panX: clamped.panX, panY: clamped.panY });
                }
                return true; // consumed
            }
            lastTapRef.current = now;
            lastTapPosRef.current = { x: e.clientX, y: e.clientY };

            // Single-finger pan when zoomed in: consume pointerDown to prevent stone drag
            if (view.zoom > 1) {
                const svg = e.currentTarget as SVGSVGElement;
                singlePanRef.current = {
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    isPanning: false,
                    startPanX: view.panX,
                    startPanY: view.panY,
                    svgRect: svg.getBoundingClientRect(),
                };
                return true; // consume — pan or tap will be decided on move/up
            }
        }

        // Start 2-finger gesture
        if (pointersRef.current.size === 2) {
            const pts = Array.from(pointersRef.current.values());
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const svg = e.currentTarget as SVGSVGElement;
            gestureRef.current = {
                dist,
                zoom: view.zoom,
                panX: view.panX,
                panY: view.panY,
                centerX: (pts[0].x + pts[1].x) / 2,
                centerY: (pts[0].y + pts[1].y) / 2,
                svgRect: svg.getBoundingClientRect(),
            };
            isGesturingRef.current = true;
            return true; // consumed
        }

        return false; // not consumed — let stone placement handle it
    }, [view.zoom, view.panX, view.panY, resetView, base.w, base.h, clampPan]);

    const handleGesturePointerMove = useCallback((e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return false;
        if (!pointersRef.current.has(e.pointerId)) return false;

        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // 2-finger pinch-zoom + pan
        if (pointersRef.current.size === 2 && gestureRef.current) {
            const pts = Array.from(pointersRef.current.values());
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const gs = gestureRef.current;

            // New zoom level
            const rawZoom = gs.zoom * (dist / gs.dist);
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom));

            // Pan delta in client px → convert to SVG coords
            const currentCenterX = (pts[0].x + pts[1].x) / 2;
            const currentCenterY = (pts[0].y + pts[1].y) / 2;
            // Client px → SVG unit scale (at current zoom, using cached rect)
            const rect = gs.svgRect;
            const scaleX = base.w / (rect.width * newZoom);
            const scaleY = base.h / (rect.height * newZoom);

            const rawPanX = gs.panX - (currentCenterX - gs.centerX) * scaleX;
            const rawPanY = gs.panY - (currentCenterY - gs.centerY) * scaleY;

            const clamped = clampPan(newZoom, rawPanX, rawPanY);
            setView({ zoom: newZoom, panX: clamped.panX, panY: clamped.panY });
            return true;
        }

        // Single-finger pan when zoomed
        if (pointersRef.current.size === 1 && singlePanRef.current) {
            const sp = singlePanRef.current;
            const dx = e.clientX - sp.startClientX;
            const dy = e.clientY - sp.startClientY;

            if (!sp.isPanning && Math.sqrt(dx * dx + dy * dy) < PAN_THRESHOLD) {
                return true; // not yet decided — still consume to prevent stone drag
            }

            sp.isPanning = true;
            isGesturingRef.current = true;

            // Convert client px movement to SVG coords
            const scaleX = base.w / (sp.svgRect.width * view.zoom);
            const scaleY = base.h / (sp.svgRect.height * view.zoom);
            const rawPanX = sp.startPanX - dx * scaleX;
            const rawPanY = sp.startPanY - dy * scaleY;

            const clamped = clampPan(view.zoom, rawPanX, rawPanY);
            setView(prev => ({ ...prev, panX: clamped.panX, panY: clamped.panY }));
            return true;
        }

        return false;
    }, [base.w, base.h, view.zoom, clampPan]);

    const handleGesturePointerUp = useCallback((e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return false;

        const wasGesturing = pointersRef.current.size >= 2;
        pointersRef.current.delete(e.pointerId);

        if (wasGesturing) {
            gestureRef.current = null;
            singlePanRef.current = null;
            // Keep isGesturingRef true briefly to suppress the click that follows
            if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
            gestureTimeoutRef.current = setTimeout(() => {
                isGesturingRef.current = false;
                gestureTimeoutRef.current = null;
            }, 50);
            return true;
        }

        // Single-finger pan end
        if (singlePanRef.current) {
            const wasPanning = singlePanRef.current.isPanning;
            singlePanRef.current = null;
            if (wasPanning) {
                // Suppress click after panning
                if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
                gestureTimeoutRef.current = setTimeout(() => {
                    isGesturingRef.current = false;
                    gestureTimeoutRef.current = null;
                }, 50);
                return true;
            }
            // Was a tap (no movement) — let click through
            isGesturingRef.current = false;
            return false;
        }

        return false;
    }, []);

    const handleGesturePointerCancel = useCallback((e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return;
        pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) {
            gestureRef.current = null;
            isGesturingRef.current = false;
        }
    }, []);

    // Compute the derived viewBox string
    const currentVb = computeViewBox(base, view);
    const viewBox = `${currentVb.x} ${currentVb.y} ${currentVb.w} ${currentVb.h}`;

    return {
        viewBox,
        zoom: view.zoom,
        currentVb,
        handleGesturePointerDown,
        handleGesturePointerMove,
        handleGesturePointerUp,
        handleGesturePointerCancel,
        isGesturing: () => isGesturingRef.current,
        resetView,
    };
}

function computeViewBox(base: BaseViewBox, view: ViewState) {
    const w = base.w / view.zoom;
    const h = base.h / view.zoom;
    // Center of base + pan offset
    const cx = base.x + base.w / 2 + view.panX;
    const cy = base.y + base.h / 2 + view.panY;
    return {
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
    };
}
