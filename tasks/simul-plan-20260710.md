# 多面打ち機能 実装指示書（2026-07-10 設計: Claude Fable 5 / 実装: Codex or Antigravity / 検証: Claude）

三村先生（講師）が複数の生徒と同時に対局する「多面打ち」を追加する。
igocampus（ネット囲碁学園）の指導碁と同じ運用イメージ: 先生が白で3〜6面を持ち、
手番が来た盤を順に打って回る。

## 0. 大前提（実装前に必ず読む）

- **サーバー側（Edge Functions / DB schema / RLS）は一切変更しない**。
  複数対局の同時進行・先生が対局者になること・手番検証は既に本番で動いている。
  submit_move / manage_game_action を触る変更はこの機能では禁止。
- 正本リポジトリは `igomimu/online-go-school`。**dojo-app リポジトリの supabase/functions を触らない**
  （2026-07-10 に dojo-app 側の古いコピーが本番対局を全停止させた。詳細は workflow コメント参照）。
- 作業前に `git fetch origin` し main 最新から開始。コミットは意味単位、**push まで完了**させる。
- **React の setState updater 関数に副作用（音声・broadcast・fetch）を入れない**。
  updater は React が2回呼び直すことがある（2026-07-10 秒読み音声二重読みの根因）。
- 検証役（Claude）が全コミット diff 精読＋E2E 独立実行で合否判定する。
  「ローカルで動いた」ではなく、下記の受け入れ基準E2Eが緑であること。

## 1. 既存の土台（再利用するもの・重複実装禁止）

| 部品 | 場所 | 使い方 |
|---|---|---|
| 教室の対局一覧（Realtime購読済み） | `src/hooks/useLiveGameList.ts` | games行の一覧・status変化はこれで既にライブ。**盤面の石は含まれない**（liveRowToSessionは空盤を返す） |
| 対局1面のフル機能フック | `src/hooks/useLiveGame.ts` | 開いた盤にのみ使う。**グリッドにN個マウントしない**（Realtimeチャネル・時計・秒読み音声がN重になる） |
| 盤面導出ロジック | `useLiveGame.ts` 内 `deriveBoardState(game, moves)` | **exportして再利用**（コピー禁止）。純関数なのでそのまま使える |
| ミニ碁盤表示 | `src/components/GameThumbnail.tsx` | `game.boardState` を描画できる。propsを少し拡張して使う |
| 対局作成API | `useLiveGameList.createGame()` | 多面打ちでは1局ずつ呼ぶ（グリッドの「対局を追加」から） |
| 対局盤（1面） | `src/components/GameBoard.tsx` | タイルクリックで開く先。変更不要のはず |
| 名前解決 | `src/utils/identityUtils.ts` `getDisplayName` | sid:xxxx → 生徒名 |

## 2. UX仕様

### 2-1. 多面打ちの開始・追加（**1局ずつ追加する。一括作成は作らない**）
**教室の進行上、生徒は同時に対局準備ができるとは限らない**（前の課題を終えた子から順に
指導碁に入る等）。したがって「N人選んで一斉スタート」方式は不採用。
多面打ちは「先生が対局者の対局が増えていくと自然に多面になる」モデルにする。

- TeacherDashboard に「**多面打ち**」ボタン → SimulGrid（2-2）を開く。
  先生対局が0面でも開ける（空状態＝「対局を追加」ボタンのみ表示）。
- SimulGrid 内に「**対局を追加**」ボタン → `SimulAddGameDialog`（新規、1生徒分だけの軽量ダイアログ）:
  - **生徒**: 接続中で「先生と対局中でない」生徒から1人選択（既に先生と対局中の生徒は
    「対局中」表示で選択不可。生徒同士の対局は妨げない）
  - **碁盤サイズ**: 9/13/19路（前回追加時の選択を記憶し次回デフォルトに）
  - **置石**: 0〜9（デフォルト0。置石>=2でコミ0.5、それ以外6.5 — 既存ダイアログと同じ連動）
  - **先生の石**: 白固定（置石>=2の面は自動的に白先。既存 deriveBoardState が対応済み）
  - **時計: なし（固定）**。多面打ちv1では clock を渡さない（`clock: null`）。
    UI に時計設定を出さないこと（N面の時計同時進行は未設計のため）
  - 「追加」で `createGame({ blackPlayer: sid:<生徒>, whitePlayer: <teacherIdentity>, boardSize, handicap, komi, clock: null })` を1回実行
- **重要**: SimulGrid からの追加では `App.tsx` `handleCreateGame` の
  「先生が対局者なら盤を自動オープン」(d976887) を**発動させない**。
  追加後は SimulGrid に留まり、新しいタイルが増えるだけ（先生は自分のリズムで打ちに行く）。
  通常のダッシュボードからの単発対局作成では従来どおり自動オープンを維持すること。
- 途中参加OK: 何面か打っている最中でも「対局を追加」でいつでも面を増やせる。

### 2-2. 多面打ちビュー（SimulGrid、新規）
- 表示対象: 「先生が対局者（black/white いずれか）である playing/scoring/interrupted の対局」全部。
  TeacherDashboard の「多面打ち」ボタンからいつでも開ける（0面でも空状態表示）。
- 表示: レスポンシブなグリッド（2〜3列、`grid-cols-2 xl:grid-cols-3`）。各タイル:
  - ライブ更新されるミニ碁盤（後述 `useLiveBoards` で石まで反映）
  - 黒/白の生徒名・先生、手数
  - **手番バッジ**: 先生の手番の盤は目立つ枠（`ring-2 ring-amber-400`）＋「あなたの番」バッジ。
    生徒の手番は「相手考慮中」のグレー表示
  - クリックで既存の GameBoard（1面フル画面）を開く
- ヘッダに「**次の手番の盤へ**」ボタン: 先生手番の盤のうち最も長く待たせている順
  （最終着手 created_at が古い順）で次の盤の GameBoard を開く。
- **SimulGrid から開いた盤**を「閉じてホーム」した時は、ダッシュボードではなく
  SimulGrid に戻る（どこから開いたかを App の state で覚えておく）。
  通常経路（ダッシュボードの「開く」等）から開いた盤は従来どおりダッシュボードへ。
- **着手後の自動巡回**: GameBoard で先生が着手したら、多面打ち中なら自動で SimulGrid に戻る
  （トグルでOFF可、デフォルトON。「打つ→次の盤が光っている→クリック」のリズムを作る）。

### 2-3. 生徒側
- **変更なし**。生徒は自分の対局が作成されると既存の自動オープンで盤に入る。
  先生の着手は既存の Realtime + LiveKit 経路で届く。

### 2-4. 終局・整地
- 各面の整地・終局は既存 GameBoard の機能をそのまま使う（タイルから開いて操作）。
- finished になった面は SimulGrid から自動で消える（useLiveGameList が既に除外する）。
- 全面終局したら空状態（「対局を追加」ボタンのみ）に戻る。追加も終了も1局単位なので
  「多面打ちの終了」という特別な状態は作らない。ダッシュボードへは戻るボタンでいつでも。

## 3. 新規実装の核: `useLiveBoards(gameIds: string[])`

グリッド用の軽量ライブ盤面フック。**useLiveGame をN個マウントする代替**。

```
入力: gameIds（多面打ち対象の対局ID配列）
出力: Map<gameId, { boardState, currentColor, moveNumber, lastMoveAt }>
```

- 初期化: 対象 gameIds の moves を一括fetch（`fetchLiveMoves` をPromise.allでもよいが、
  できれば `.in('game_id', gameIds)` の一括クエリを liveGameApi に追加: `fetchLiveMovesForGames`）
- 購読: **Realtimeチャネルは1本だけ**。`go_school_live_moves` の INSERT を購読し、
  `new.game_id` が対象なら該当対局の moves に追加 → deriveBoardState 再計算。
  （既存 `subscribeLiveGame` は game_id 単位なので、classroom単位 or 複数ID対応の
  `subscribeLiveMovesForGames(gameIds, onInsert)` を liveGameApi に新設）
- games 行の status/currentColor 変化は useLiveGameList の games をそのまま参照
  （二重購読しない）。currentColor は moves から導出（deriveBoardState）。
- 時計なし・音声なし・LiveKitハンドラなし。**純粋に盤面表示専用**。
- gameIds 変更時はチャネルを張り直す（unsubscribe → subscribe）。クリーンアップ漏れ注意。

## 4. 変更ファイル一覧（見積もり）

| ファイル | 変更 |
|---|---|
| `src/hooks/useLiveGame.ts` | `deriveBoardState` を export（移動はしない、exportのみ） |
| `src/utils/liveGameApi.ts` | `fetchLiveMovesForGames` / `subscribeLiveMovesForGames` 追加 |
| `src/hooks/useLiveBoards.ts` | **新規**（上記仕様） |
| `src/components/teacher/SimulAddGameDialog.tsx` | **新規**（1生徒分の追加ダイアログ） |
| `src/components/teacher/SimulGrid.tsx` | **新規**（GameThumbnail を拡張利用 or 専用タイル） |
| `src/components/GameThumbnail.tsx` | 手番バッジ・ライブ盤面を受けるprops拡張（後方互換維持、既存テストを壊さない） |
| `src/components/teacher/TeacherDashboard.tsx` | 「多面打ち」開始ボタン＋ビュー切替 |
| `src/App.tsx` | simulビュー状態・「閉じてホーム」の戻り先分岐・着手後自動巡回 |

## 5. 受け入れ基準（検証役がこれで合否判定する）

### ユニット（vitest）
1. `useLiveBoards` の導出ロジック: moves配列→盤面/手番/手数（deriveBoardState経由、3面分）
2. SimulAddGameDialog: createGame が正しい引数で1回呼ばれる・置石/コミ連動（handicap>=2→komi 0.5）・先生と対局中の生徒は選択不可・盤サイズの前回値記憶
3. 既存 GameThumbnail テストが全部緑のまま（後方互換）

### E2E（Playwright、`e2e/simul-game.spec.ts` 新規）
シナリオ: 先生1＋生徒2（テスト生徒A/B、既存ヘルパー使用）
1. 先生が「多面打ち」→ SimulGrid（空状態）→「対局を追加」で A と開始 → **盤は自動で開かず**タイルが1面増える → 続けて「対局を追加」で B と開始 → タイルが2面になる（**1局ずつの追加**の検証）
2. 生徒A・Bはそれぞれ自分の対局盤に自動遷移する（既存挙動）
3. Aが初手を打つ → **SimulGridのAのタイルに石が現れ、「あなたの番」バッジが点く**（ライブ反映の検証）
4. 先生が「次の手番の盤へ」→ Aの盤が開く → 着手 → 自動でSimulGridに戻る
5. Bのタイルをクリック → Bの盤が開く → 「閉じてホーム」→ SimulGridに戻る（ダッシュボードではなく）
6. **この間、生徒A/Bの盤が勝手に閉じないこと**（REVIEW_END回帰、983cda3の再発防止）
7. teardown: 既存 `teardownSupabaseRoster` で掃除（教室IDは `generateClassroomId('simul')`）

### 全体回帰
- `npx tsc --noEmit` / `npx eslint .`（error 0） / `npx vitest run` 全緑
- 既存E2E: multi-student-game / multi-user-game / teacher-no-op-wiring / reconnect /
  clock-persistence / byoyomi-voice が全緑のまま（特に d976887 の自動オープンを
  単発対局作成では**壊さない**こと）

## 6. ハマりどころ（過去事故由来）

- E2Eの教室シードは `setupClassroomData`（`go-school-e2e-classroom-id` opt-inが必須。
  無いと isTestClassroom フィルタで教室が見えない）
- E2E実行: `set -a; source ~/.secrets/online-go-school-teacher.env; set +a; BASE_URL=http://localhost:5175 npx playwright test ...`（vite 5175 は systemd で稼働中）
- 盤フォーカスモード中は Header が描画されない。SimulGrid はダッシュボード側
  （Headerあり）に置くこと
- `getByRole('button', { name: '閉じてホーム' })` が盤ビューの目印（waitForObserverPanel）
- 対局作成ダイアログの number input 順は「コミ→持ち時間→回数」（既存テスト参照）。
  SimulAddGameDialog では時計UIを出さないので関係ないが、既存ダイアログを流用する場合は注意

## 7. スコープ外（v1でやらない）

- 多面打ちでの対局時計（N面同時時計は未設計。clock: null 固定）
- グリッドタイル上での直接着手（v1はクリックで盤を開く。リズムは自動巡回で担保）
- 生徒側UIの変更・秒読み音声との連動
- NHK杯方式時間モード（別タスク）

## 8. 完了時

- 意味単位でcommit（例: ①liveGameApi+useLiveBoards ②SimulAddGameDialog ③SimulGrid+App配線 ④E2E）→ push
- `handoff -t "多面打ちv1実装" ...` を記録し、検証役（Claude）に E2E独立実行を依頼
