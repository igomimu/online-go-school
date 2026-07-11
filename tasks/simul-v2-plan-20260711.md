# 多面打ちv2: 単一盤ローテーション 実装指示書（2026-07-11 設計: Claude Fable 5 / 実装: 他AI / 検証: Claude）

三村さん指定の多面打ちUX:
**「講師側は常に1つの碁盤だけが表示される。講師が着手すると次の碁盤（自分の手番の碁盤）に切り替わる」**
（igocampusの指導碁ローテーションと同じ感覚。v1のグリッド往復は廃止し、打って回るリズムを1画面で完結させる）

## 0. 大前提（毎回同じ。違反は差し戻し）

- サーバー側（Edge Functions / DB / RLS）変更禁止。dojo-appリポジトリ非接触。
- setStateのupdaterに副作用を入れない。
- **Realtime購読は必ず `ensureRealtimeAuth()` の後で行う**（65fe88f。既存フックを使う限り自動で満たされる）。
- **サーバー送信は既存の直列化キュー経由のまま**（1ea76eb enqueueSubmit。GameBoard/useLiveGameを使う限り自動で満たされる）。
- 作業前 `git fetch origin`、完了は commit+push まで。検証役（Claude）がdiff精読＋E2E独立実行で判定。

## 1. 現状（v1）と変更の方向

v1: SimulGrid（タイル一覧）⇄ GameBoard（全画面）を往復。着手後にグリッドへ自動で戻る。
v2: **SimulGrid コンポーネント内で単一の GameBoard を直接レンダリング**し、切替はコンポーネント内の
`activeSimulGameId` state の差し替えだけで行う（App の viewMode='game' 遷移は多面打ちでは使わなくなる）。

再利用する既存部品（重複実装禁止）:
- `useLiveBoards`（全盤のライブ手番・盤面。手番判定 `isTeacherTurn`、次盤選定 `nextGameId` のロジックは v1 の SimulGrid にある）
- `GameBoard`（onMoveSubmitted コールバック実装済み。着手・整地・投了・合法手・時計すべてここに乗っている）
- `SimulAddGameDialog`（対局を追加）

## 2. UX仕様

### 2-1. 画面構成（多面打ちビュー = 常に1盤）
- 上部バー（1行、コンパクトに）:
  - 「戻る」（ダッシュボードへ = 既存 onBack）
  - **面数と手番待ち状況**: 「3面（あなたの番 2面）」のような表示
  - 「対局を追加」（既存 SimulAddGameDialog を開く）
  - 「一覧」トグル（タイル一覧＝v1グリッドを一時表示。盤の全体把握・任意の盤への手動ジャンプ用。
    タイルクリックでその盤の単一表示に戻る）
- 本体: **GameBoard 1面**（SimulGrid 内で直接レンダリング）。
  - GameBoard の `onBack` は渡さない（「閉じてホーム」ボタンを出さない。戻る動線は上部バーに集約）
  - `onMoveSubmitted` に切替ロジックを渡す（後述）
- 盤が0面: 空状態（「対局を追加」ボタンのみ、v1と同じ）

### 2-2. 切替ロジック（核心）
- **講師が着手（またはパス）→ 次の「自分の手番」の盤へ自動切替**。
  - 「次」の選定: v1と同じ「最終着手が最も古い順」（最も長く待たせている生徒から）。
  - 自分の手番の盤が他にない → **現在の盤に留まり**、オーバーレイ等はうるさくしない
    （上部バーの「あなたの番 0面」表示で分かる）。
- **どこかの盤で自分の手番になった（生徒が打った）とき、表示中の盤が自分の手番でなければ自動でその盤へ切替**。
  - 実装: useLiveBoards の boards から「teacherTurn な盤のリスト」を導出し、
    `activeSimulGameId` の盤が teacherTurn でない && teacherTurn な盤が存在する → 最古待ち盤へ切替、
    を useEffect で行う（依存: boards / activeSimulGameId）。
  - ⚠️ この自動切替は**整地中(scoring)の盤を表示している間は発動しない**こと
    （死石指定の操作中に画面が飛ぶと事故。scoring 表示中は手動切替のみ）。
  - ⚠️ 講師の着手直後の楽観的更新で「自分の手番でなくなる」→ このuseEffectが自然に次盤へ切替
    してくれるため、onMoveSubmitted 側の明示切替と二重にならないよう、**切替は useEffect 一本に集約**
    してよい（onMoveSubmitted は不要になる可能性が高い。設計として綺麗な方を選び、
    二重切替・切替ループが無いことをE2Eで保証すること）。
- 表示中の盤が終局(finished)して一覧から消えた → 残りの盤（手番優先）へ自動切替。全滅なら空状態。

### 2-3. 廃止・整理（v1からの変更）
- 「着手後にグリッドへ戻る」トグル（autoReturnAfterSimulMove）と App の該当配線
  （activeGameSource='simul' 分岐、onOpenSimulGame での viewMode 遷移）は**撤去**。
  App.tsx の多面打ち関連は「SimulGrid を表示するか否か」だけに簡素化する。
- v1 のタイル一覧は「一覧」トグルの中身として温存（コード再利用）。
- 「次の手番の盤へ」ボタンは上部バーに残してよい（自動切替の手動代替。任意）。

### 2-4. 生徒側
- 変更なし。

## 3. テスト（受け入れ基準）

### ユニット（vitest）
1. 次盤選定ロジック（teacherTurnな盤を最終着手の古い順に返す純関数に切り出し）: 
   0面/1面/複数面/scoring除外の各ケース
2. 既存ユニット全緑維持（357本+新規）

### E2E（`e2e/simul-game.spec.ts` を v2 仕様に改修。生徒A・B vs 先生、9路）
1. 先生が「多面打ち」→ 空状態 → A と対局追加 → **グリッドではなく盤が1面表示される**
   （Aの盤。まだ黒番=A考慮中の表示）
2. B と対局追加（上部バー「対局を追加」）→ 表示は1盤のまま、上部バーが「2面」になる
3. A が初手 → **先生の表示が自動でAの盤になり「あなたの番」**（すでにA盤表示ならそのまま）
4. B が初手 → 先生が着手（A盤）→ **自動でBの盤に切り替わる**（盤の対局者名で判定）
5. 先生がB盤で着手 → 両盤とも相手考慮中 → 表示は現在の盤に留まる（上部バー「あなたの番 0面」）
6. A が2手目 → **自動でA盤へ切替**
7. 「一覧」トグル → タイル2面表示 → B のタイルをクリック → B盤の単一表示に戻る
8. この間、生徒A/Bの盤が勝手に閉じたりリロードされたりしないこと
9. teardown は既存どおり

### 回帰
- 既存E2E全緑: legality / multi-student / multi-user / popup-board / clock-persistence /
  byoyomi-voice / reconnect / teacher-no-op-wiring / teacher-auth / roster-supabase /
  security / review-ai / debug-console / verify-ui
- 特に**単発対局**（多面打ちを使わない従来フロー: 作成→自動オープン→閉じてホーム→ダッシュボード）を壊さない
- `npx tsc --noEmit` / eslint error 0 / vitest 全緑

## 4. ハマりどころ

- **切替ループ注意**: useEffect での自動切替は「表示中の盤が自分の手番でない∧手番の盤がある」時だけ。
  切替先も手番盤なので再発動しない設計になっているか確認。楽観的更新→サーバー確定→Realtime受信の
  往復で boards が数回更新されるので、同一盤への「切替」で state を再セットしない（無駄レンダー防止）。
- GameBoard は `key={gameId}` を付けて盤ごとに再マウントさせる（useLiveGame の内部状態が
  前の盤の残骸を持ち越さないように）。
- E2Eの盤判定は対局者名（resolvePlayerName 表示）か `[data-stone]` の配置で行う。
  タイル一覧と単一盤で同名テキストが重複しないよう、単一盤表示のルート要素に
  `data-testid="simul-active-board"` を付け、その配下で assert する。
- E2E実行: `set -a; source ~/.secrets/online-go-school-teacher.env; set +a; BASE_URL=http://localhost:5175 npx playwright test <spec> --project=chromium`
- 教室シードの opt-in キー等は既存ヘルパーを使えば自動。

## 5. スコープ外

- 多面打ちでの時計（引き続き clock: null 固定）
- 盤の並び順カスタマイズ、生徒側UI変更

## 6. 完了時

- 意味単位で commit → push
- `handoff -t "多面打ちv2 単一盤ローテーション実装" ...` を記録し、検証役（Claude）に依頼
