# デザインカタログ

このアプリの見た目を、claude.ai/design（Claude Design）へ持ち込むための静的カタログ。
ブラウザで新しい画面のモックを作らせるとき、実物の色・文字・碁盤を土台にできる。

## なぜ静的 HTML なのか

Claude Design のプレビューは外部 CDN を読めない。Tailwind のクラスを書いただけでは何も当たらない。
そこで**本番ビルドの CSS（`dist/assets/index-*.css`）を丸ごと `<style>` に埋め込み**、実アプリと
同じクラス名でマークアップしている。木目も data URI で埋めるので、カードは 1 ファイルで完結する。

碁盤の寸法・色は `src/components/GoBoard.tsx` の定数（`CELL_SIZE=40` / `MARGIN=40` /
`STONE_RADIUS=CELL_SIZE*0.46` / 石の radialGradient）を写している。**あちらを変えたら
`build.py` の対応する定数も直すこと。**

## 作り直す

```bash
npm run build                    # CSS を変えたら必ず先に
python3 design-system/build.py   # design-system/out/*.html ができる
```

`out/` は生成物なので git に入れていない。

| ファイル | 中身 |
|---|---|
| `out/foundations.html` | 色トークン（素材の名前と役割）・文字・ボタン・入力・パネル |
| `out/foundations-dark.html` | 同じ内容を墨（ダーク）で |
| `out/board.html` | 19 路盤・石の質感・木目 |
| `out/classroom.html` | 対局カード 4 状態・参加者リスト |
| `out/artifact.html` | 上 3 枚を 1 枚に繋いだもの。人が全画面で見る用 |

本文は `parts/*.body.html` にある。文言や並びを直すならそこ。碁盤のカードだけは
SVG を組み立てる都合で `build.py` の中に本文がある。

## アップロード

Claude Code から `DesignSync` ツールで送る。プロジェクトは作成済み:

- projectId `42fbeccb-14ec-4836-a1ea-27232793b77e`（「三村囲碁オンライン」）

順番が決まっている。`list_files` → `finalize_plan` → `write_files` → `register_assets`。
`finalize_plan` は書き込むパスを先に確定させる仕組みで、`deletes` が空でも省略できない。
返ってきた `planId` を後続の呼び出しに渡す。

`out/artifact.html` は Design ではなく Artifact として publish する（全画面で見る用）。
現在の URL は auto-memory の `reference_design_system_catalogs.md` に控えてある。

## まだ載せていないもの

- 生徒テーブル（`src/components/teacher/StudentTable.tsx`）
- ヘッダー（`src/components/Header.tsx`）
