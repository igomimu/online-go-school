# 検討モードの碁盤レイアウト — 残件ハンドオフ（2026-08-01 / Claude Code → Antigravity）

## 背景
三村さんの実機テストで2件の指摘があった。

1. **PC: 碁盤が他のパーツの上に重なる** → ✅ 修正済み（本ドキュメント下部の「完了分」）
2. **スマホ: 検討碁盤が見切れている** → ⬜ 未解決（再現条件の切り分けが必要）

## 完了分（触らないでよい）
`src/components/ReviewBoard.tsx` の碁盤ブロックを、対局盤（`GameBoard.tsx`）で
既に解決済みの方式に揃えた。

- 変更前: `maxHeight="calc(100dvh - 10rem)"` + `className="max-w-[min(100%,calc(100dvh-10rem))]"`
  → 固定計算のため、ヘッダー・ナビ列・ツール列のぶんを考慮できず碁盤が大きくなりすぎる
- 変更後: 親を `lg:flex-1 lg:min-h-0 overflow-hidden` にして
  `maxHeight="100%"` / `className="w-full max-w-full lg:!w-auto lg:h-full"`

Playwright実測（9路・先生ログイン・SGF3手・dev server）:

| 画面 | 修正前 碁盤の上下 | ナビ列 | 判定 |
|---|---|---|---|
| PC 1280×800 | 26 – **666** | 616 – 666 | ナビ列と完全に重なる |
| PC 1280×800（修正後） | 109 – **583** | 616 – 666 | 重なりなし |
| スマホ 390×844 | 121 – 461 | 494 – 544 | この条件では再現せず |
| スマホ 390×844（修正後） | 113 – 469 | 494 – 544 | 同上 |

## 残件: スマホの見切れ

### 分かっていること
- 9路・390×844・操作パネル非表示（既定）では**再現しない**（上表）。
- スマホでは碁盤は幅基準の正方形になり、ページ側（`App.tsx` の
  `fixed inset-0 ... overflow-y-auto lg:overflow-hidden p-2 sm:p-4`）が縦スクロールする設計。

### 未検証の再現候補（この順で潰すのが早い）
1. **19路**（`SZ[19]` のSGF）— 座標ラベルぶん余白が増え、縦が伸びる
2. **「操作パネルを表示」を押した状態** — AI分析・生徒一覧・チャットが縦に積まれる
3. **縦が短い端末 / ブラウザのURLバー表示時**（例 390×667、`100dvh` と実表示の差）
4. **iOS Safari のセーフエリア**（下端のホームバーにナビ列が潜る）
5. 横向き（landscape 844×390）

### 調査に使えるもの
- E2E基盤: `e2e/helpers/teacher-actions.ts` の `loginAsTeacher` / `openClassroomAndConnect` /
  `loadSgfForReview(page, sgf)` でSGFを流し込んで検討モードに入れる。
- 先生PW: `~/.secrets/online-go-school-teacher.env` を source して `TEST_TEACHER_PASSWORD` に渡す。
- dev server: LEGION `/home/mimura/projects/online-go-school` で `npm run dev`（:5175）。
- 実測の取り方（要素の座標をJSで取る）:
  ```ts
  await page.evaluate(() => {
    const r = document.querySelector('[data-testid="go-board"]')!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: innerHeight, scrollH: document.documentElement.scrollHeight };
  });
  ```
  `bottom > innerHeight` かつ縦スクロールできない → 見切れ。

### 実装時の注意
- 対局盤 `GameBoard.tsx` は同じ問題を解決済みなので**そちらの方式に合わせる**こと
  （`flex-1 min-h-0` の親 + `maxHeight="100%"`）。固定 `calc(100dvh - Nrem)` に戻さない。
- 授業盤 `LectureBoard.tsx` は既に修正済み方式。ReviewBoard だけ古い方式だった。
- 変更したら PC（1280×800）でナビ列と重ならないことを必ず再確認する（今回の修正の回帰）。

## 関連
- 直前のコミット: 検討モードの元手順保護（取り消し押しすぎで棋譜が消える事故）`914bfbf`
- 既存の別問題（本件と無関係・HEADでも失敗）: `e2e/review-ai-highlight.spec.ts` が
  AI候補手リスト（D4）を検出できず失敗する。
