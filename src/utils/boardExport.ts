// 検討盤の書き出し（SVG → Canvas → PNG）。
//
// 🔴 検討盤は別ウィンドウ（ポップアップ）に描かれることがある。
// document / Image / clipboard をこのファイルのグローバルから取ると、
// 盤が出ているウィンドウではなく元のウィンドウ側で動いてしまい、
// ダウンロードがどこにも現れず、クリップボードは「文書にフォーカスが無い」で失敗する。
// 盤のある window を必ず引き回す。
// 操作は Pocket KataGo に合わせてある（画像コピー / 画像保存 / SGFコピー / SGF保存）。
// 盤の木目は <image href="/wood-board-texture-v2.webp"> で描いているが、
// SVG を画像として読み込むと外部ファイルは取りに行ってくれないため、
// 書き出すときだけ data URI に焼き込む（焼かないと盤が真っ白になる）。

const dataUrlCache = new Map<string, string>();

async function toDataUrl(url: string): Promise<string | null> {
    const cached = dataUrlCache.get(url);
    if (cached) return cached;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('read failed'));
            reader.readAsDataURL(blob);
        });
        dataUrlCache.set(url, dataUrl);
        return dataUrl;
    } catch {
        return null;
    }
}

/** 盤が実際に描かれているウィンドウ */
type FullWindow = Window & typeof globalThis;

/** 盤が実際に描かれているウィンドウ（別ウィンドウならそちら） */
function windowOf(el: Element): FullWindow {
    return (el.ownerDocument.defaultView as FullWindow | null) ?? window;
}

/** useHostWindow が返すのは素の Window 型なので、DOM API を使うために広げる */
function asFullWindow(win: Window): FullWindow {
    return win as FullWindow;
}

/** 元のSVGで効いているCSSを、複製した側の属性として焼き込む（canvasはCSSクラスを見ない） */
function inlineStyles(clone: SVGElement, original: SVGElement, win: FullWindow): void {
    const props = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'letter-spacing'];
    const origChildren = original.querySelectorAll('*');
    const cloneChildren = clone.querySelectorAll('*');
    for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
        const origEl = origChildren[i];
        const cloneEl = cloneChildren[i] as SVGElement;
        const computed = win.getComputedStyle(origEl);
        for (const prop of props) {
            const val = computed.getPropertyValue(prop);
            if (val && val !== 'none' && val !== '') cloneEl.style.setProperty(prop, val);
        }
        const color = computed.getPropertyValue('color');
        if (color) {
            if (cloneEl.getAttribute('fill') === 'currentColor') cloneEl.setAttribute('fill', color);
            if (cloneEl.getAttribute('stroke') === 'currentColor') cloneEl.setAttribute('stroke', color);
        }
    }
}

async function renderSvgToImage(svgElement: SVGSVGElement): Promise<{ img: HTMLImageElement; width: number; height: number }> {
    const win = windowOf(svgElement);
    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    const vb = svgElement.viewBox.baseVal;
    const width = vb.width || svgElement.clientWidth;
    const height = vb.height || svgElement.clientHeight;

    inlineStyles(clone, svgElement, win);

    // 木目などの外部画像を焼き込む
    const images = Array.from(clone.querySelectorAll('image'));
    await Promise.all(images.map(async (el) => {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href');
        if (!href || href.startsWith('data:')) return;
        const dataUrl = await toDataUrl(href);
        if (dataUrl) {
            el.setAttribute('href', dataUrl);
            el.removeAttribute('xlink:href');
        } else {
            el.remove();
        }
    }));

    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${width} ${height}`);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const svgString = new XMLSerializer().serializeToString(clone);
    const url = win.URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
    try {
        const img = new win.Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('SVGを画像として読み込めませんでした'));
            img.src = url;
        });
        return { img, width, height };
    } finally {
        win.URL.revokeObjectURL(url);
    }
}

/** 検討盤をPNGのBlobにする */
export async function exportBoardAsPNG(svgElement: SVGSVGElement, scale = 2): Promise<Blob> {
    const win = windowOf(svgElement);
    const { img, width, height } = await renderSvgToImage(svgElement);
    const pad = 12;
    const totalW = width + pad * 2;
    const totalH = height + pad * 2;

    const canvas = win.document.createElement('canvas');
    canvas.width = totalW * scale;
    canvas.height = totalH * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvasを用意できませんでした');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#f5f0e1';
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.drawImage(img, pad, pad, width, height);

    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNGに変換できませんでした'))), 'image/png');
    });
}

function downloadBlob(blob: Blob, filename: string, win: FullWindow): void {
    const url = win.URL.createObjectURL(blob);
    const a = win.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    win.document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        win.document.body.removeChild(a);
        win.URL.revokeObjectURL(url);
    }, 200);
}

/** 検討盤をPNGファイルとして保存する */
export async function downloadBoardAsPNG(svgElement: SVGSVGElement, filename?: string): Promise<void> {
    const blob = await exportBoardAsPNG(svgElement);
    downloadBlob(blob, filename || `kentou_${timestamp()}.png`, windowOf(svgElement));
}

/** 検討盤の画像をクリップボードへ */
export async function copyBoardToClipboard(svgElement: SVGSVGElement): Promise<boolean> {
    try {
        const win = windowOf(svgElement);
        const blob = await exportBoardAsPNG(svgElement);
        await win.navigator.clipboard.write([new win.ClipboardItem({ 'image/png': blob })]);
        return true;
    } catch {
        return false;
    }
}

/** SGFテキストをファイルとして保存する */
export function downloadSgf(sgf: string, win: Window, filename?: string): void {
    downloadBlob(new Blob([sgf], { type: 'application/x-go-sgf;charset=utf-8' }), filename || `kentou_${timestamp()}.sgf`, asFullWindow(win));
}

/** SGFテキストをクリップボードへ */
export async function copySgfToClipboard(sgf: string, win: Window): Promise<boolean> {
    try {
        await asFullWindow(win).navigator.clipboard.writeText(sgf);
        return true;
    } catch {
        return false;
    }
}

function timestamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
