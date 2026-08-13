#!/usr/bin/env python3
"""三村囲碁オンラインのデザインカタログを組み立てる。

本番ビルドの CSS（dist/assets/index-*.css）をそのまま <style> に埋め込み、実アプリの
クラス名でマークアップする。claude.ai/design は外部 CDN を読めないので、カードは
1 ファイルで完結していなければならない。木目も data URI で埋める。

使い方:
    npm run build              # 先に dist を作る（CSS を変えたら必ず）
    python3 design-system/build.py
    # out/*.html を DesignSync でアップロード（README.md 参照）
"""
import base64
import glob
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'out'
OUT.mkdir(exist_ok=True)

css_files = sorted(glob.glob(str(ROOT / 'dist/assets/index-*.css')))
if not css_files:
    raise SystemExit('dist/assets/index-*.css が無い。先に npm run build を実行すること。')
CSS = pathlib.Path(css_files[0]).read_text(encoding='utf-8')

PAGE_CSS = """
body {
  background: var(--color-ground);
  color: var(--color-ink);
  font-family: 'Inter', 'Noto Sans JP', system-ui, sans-serif;
  line-height: 1.8;
  margin: 0;
  padding: 40px 32px 64px;
}
.ds-wrap { max-width: 960px; margin: 0 auto; }
.ds-sec { margin-top: 44px; }
.ds-sec > h2 {
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.14em;
  color: var(--color-muted); margin: 0 0 14px; padding-bottom: 8px;
  border-bottom: 1px solid var(--color-line);
}
.ds-note { color: var(--color-muted); font-size: 0.8125rem; margin: 6px 0 0; }
.ds-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); gap: 12px; }
.ds-sw { border: 1px solid var(--color-line); border-radius: 10px; overflow: hidden; }
.ds-sw .chip { height: 56px; }
.ds-sw .meta { padding: 8px 10px; background: var(--color-surface); }
.ds-sw .name { font-size: 0.8125rem; line-height: 1.5; }
.ds-sw .val { font-size: 0.6875rem; color: var(--color-muted); font-family: ui-monospace, monospace; }
.ds-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.ds-stack { display: flex; flex-direction: column; gap: 14px; max-width: 380px; }
.ds-board {
  display: block; width: 100%; max-width: 800px; margin: 0 auto;
  aspect-ratio: 1 / 1; border-radius: 6px; user-select: none;
  box-shadow: 3px 4px 0 0 #c68c4e, 6px 8px 0 0 #906836, 0 14px 28px rgba(0,0,0,0.45);
}
.ds-stone { display: inline-block; flex-shrink: 0; border-radius: 9999px; }
.ds-stone.b { background: radial-gradient(circle at 33% 28%, #6b6862 0%, #23211c 45%, #0d0c0a 100%); box-shadow: 0 1px 2px rgba(0,0,0,.45); }
.ds-stone.w { background: radial-gradient(circle at 33% 28%, #ffffff 0%, #f0ece2 55%, #cdc7b8 100%); box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.ds-mini { display: block; width: 100%; height: auto; }
.ds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.ds-dot { width: 8px; height: 8px; border-radius: 9999px; border: 1px solid var(--color-line); display: inline-block; flex-shrink: 0; }
"""

# --- 19 路盤 -------------------------------------------------------------
# 定数はすべて src/components/GoBoard.tsx から。あちらを変えたらここも合わせる。
CELL, MARGIN, SIZE = 40, 40, 19
LINE_W, BORDER_W = 1, 2
STONE_R = CELL * 0.46
STAR_R, COORD_FS, FONT_SIZE = 3.5, 14, 16
SPAN = MARGIN * 2 + (SIZE - 1) * CELL

# 三連星の布石。手数は「手順を数字で追う」機能をそのまま見せるため。
MOVES = [(16, 4, 'B'), (4, 16, 'W'), (16, 16, 'B'), (4, 4, 'W'), (16, 10, 'B'),
         (10, 10, 'W'), (6, 17, 'B'), (4, 14, 'W'), (9, 17, 'B'), (14, 3, 'W')]
STARS = [(x, y) for x in (4, 10, 16) for y in (4, 10, 16)]


def build_board() -> str:
    wood = base64.b64encode((ROOT / 'public/wood-board-texture-v2.webp').read_bytes()).decode()
    px = lambda i: MARGIN + (i - 1) * CELL
    label = lambda n: chr(64 + n) if n < 9 else chr(65 + n)  # I を飛ばす

    o = [f'<svg viewBox="0 0 {SPAN} {SPAN}" xmlns="http://www.w3.org/2000/svg" '
         'class="ds-board" shape-rendering="geometricPrecision">', '<defs>',
         '<radialGradient id="stoneBlack" cx="35%" cy="30%" r="75%">'
         '<stop offset="0%" stop-color="#5a5a5a"/><stop offset="40%" stop-color="#1a1a1a"/>'
         '<stop offset="100%" stop-color="#000000"/></radialGradient>',
         '<radialGradient id="stoneWhite" cx="35%" cy="30%" r="75%">'
         '<stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#f0ede4"/>'
         '<stop offset="100%" stop-color="#d8d2c0"/></radialGradient>',
         '<filter id="stoneShadow" x="-50%" y="-50%" width="200%" height="200%">'
         '<feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#000000" flood-opacity="0.45"/>'
         '</filter>', '</defs>',
         f'<image href="data:image/webp;base64,{wood}" x="0" y="0" width="{SPAN}" height="{SPAN}" preserveAspectRatio="none"/>']

    start, end = MARGIN, MARGIN + (SIZE - 1) * CELL
    for i in range(1, SIZE + 1):
        p, w = px(i), (BORDER_W if i in (1, SIZE) else LINE_W)
        o.append(f'<line x1="{p}" y1="{start}" x2="{p}" y2="{end}" stroke="black" stroke-width="{w}" stroke-linecap="square"/>')
        o.append(f'<line x1="{start}" y1="{p}" x2="{end}" y2="{p}" stroke="black" stroke-width="{w}" stroke-linecap="square"/>')
    for i in range(1, SIZE + 1):
        p = px(i)
        o.append(f'<text x="{p}" y="{MARGIN - 25}" text-anchor="middle" font-size="{COORD_FS}" fill="black" font-weight="bold">{label(i)}</text>')
        o.append(f'<text x="{MARGIN - 25}" y="{p + 5}" text-anchor="middle" font-size="{COORD_FS}" fill="black" font-weight="bold">{SIZE - i + 1}</text>')
    for sx, sy in STARS:
        o.append(f'<circle cx="{px(sx)}" cy="{px(sy)}" r="{STAR_R}" fill="#000000"/>')
    for n, (x, y, c) in enumerate(MOVES, start=1):
        cx, cy = px(x), px(y)
        black = c == 'B'
        fill = 'url(#stoneBlack)' if black else 'url(#stoneWhite)'
        stroke, sw = ('#000000', 2) if black else ('#3a3a3a', 1.5)
        o.append(f'<g filter="url(#stoneShadow)"><circle cx="{cx}" cy="{cy}" r="{STONE_R}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/></g>')
        o.append(f'<text x="{cx}" y="{cy}" dy=".35em" text-anchor="middle" fill="{"#FFFFFF" if black else "#000000"}" font-size="{FONT_SIZE}" font-weight="bold">{n}</text>')
    o.append('</svg>')
    return '\n'.join(o)


# --- カード --------------------------------------------------------------
def card(name, *, group, theme, title, body):
    doc = (f'<!-- @dsCard group="{group}" -->\n<!doctype html>\n'
           f'<html lang="ja" data-theme="{theme}">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
           f'<title>{title}</title>\n<style>\n{CSS}\n{PAGE_CSS}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n')
    (OUT / name).write_text(doc, encoding='utf-8')
    print(f'  out/{name}: {len(doc.encode()):,} bytes')
    return body


part = lambda n: (HERE / 'parts' / n).read_text(encoding='utf-8')

board_body = f"""<div class="ds-wrap">

  <p class="heading-section">三村囲碁オンライン</p>
  <h1 class="heading-hero">碁盤</h1>
  <p class="ds-note">画面で唯一、色を持つ場所。木目・那智黒・蛤の三つだけで作り、UI 側はここに色を足さない。</p>

  <section class="ds-sec">
    <h2>19 路盤 — 三連星の布石（10手）</h2>
    {build_board()}
    <p class="ds-note">マス 40px・余白 40px・石の半径はマスの 0.46。盤の厚みは box-shadow の二段重ね（#c68c4e／#906836）で、天面の明るさに合わせた木口色にしてある。</p>
  </section>

  <section class="ds-sec">
    <h2>石</h2>
    <div class="ds-row">
      <span class="ds-stone b" style="width:56px;height:56px"></span>
      <span class="ds-stone w" style="width:56px;height:56px"></span>
      <span class="ds-stone b" style="width:32px;height:32px"></span>
      <span class="ds-stone w" style="width:32px;height:32px"></span>
      <span class="ds-stone b" style="width:24px;height:24px"></span>
      <span class="ds-stone w" style="width:24px;height:24px"></span>
    </div>
    <p class="ds-note">盤外の石（ニギリ・手番表示）は radial-gradient。盤上の石は SVG の radialGradient で、光は左上 35% / 30% から当てる。黒＝那智黒 #5a5a5a→#1a1a1a→#000、白＝蛤 #fff→#f0ede4→#d8d2c0。</p>
  </section>

  <section class="ds-sec">
    <h2>木目</h2>
    <div class="glass-panel" style="padding:20px">
      <p style="margin:0">木目は毎回 SVG フィルタで計算せず、事前生成した静的画像（<code>wood-board-texture-v2.webp</code>／8KB）を敷いている。feTurbulence は盤を置くたびに 1 面 5〜10ms かかり、多面打ちで 12 面並べると 40ms 乗るため。</p>
    </div>
  </section>

</div>"""

print('カードを書き出す:')
found_body = card('foundations.html', group='Foundations', theme='light',
                  title='三村囲碁オンライン — 基礎トークン', body=part('foundations.body.html'))
card('foundations-dark.html', group='Foundations', theme='dark',
     title='三村囲碁オンライン — 基礎トークン（墨）',
     body=found_body.replace('このページはライトが当たっている', 'このページは墨が当たっている'))
card('board.html', group='碁盤', theme='light', title='三村囲碁オンライン — 碁盤', body=board_body)
classroom_body = card('classroom.html', group='教室', theme='light',
                      title='三村囲碁オンライン — 教室', body=part('classroom.body.html'))
# 検討中の提案。採否が決まったら parts ごと消す。
proposal_body = card('proposal-participants.html', group='提案', theme='light',
                     title='三村囲碁オンライン — 仲間が見えるようにする',
                     body=part('proposal.body.html'))

# --- 人が全画面で見る用（Artifact に publish する 1 枚） ------------------
sep = '\n<hr style="max-width:960px;margin:64px auto 0;border:0;border-top:1px solid var(--color-line)">\n'
artifact = ('<title>三村囲碁オンライン デザイン</title>\n<style>\n' + CSS + PAGE_CSS + '\n</style>\n'
            + sep.join([found_body, board_body, classroom_body]))
(OUT / 'artifact.html').write_text(artifact, encoding='utf-8')
print(f'  out/artifact.html: {len(artifact.encode()):,} bytes')

# 提案は目的が違うので別の 1 枚にする（決まったら消す）。
proposal_page = ('<title>仲間が見えるようにする</title>\n<style>\n' + CSS + PAGE_CSS + '\n</style>\n' + proposal_body)
(OUT / 'artifact-proposal.html').write_text(proposal_page, encoding='utf-8')
print(f'  out/artifact-proposal.html: {len(proposal_page.encode()):,} bytes')
