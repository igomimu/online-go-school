# 4機能実装計画（2026-07-08 三村さん本番フィードバック対応）

**このファイルが進捗の正本。** 各コミット完了時にチェックを進め、証跡を追記すること。
計画立案: Claude Code（LEGION）。設計基準: origin/main `8c6bbef`（本番デプロイ済と同一）。

## 要望4件と対応方針

1. **ログイン画面と教室画面にPWAインストールボタン** → コミット6
2. **対局作成時に時間制限を選択できない** → 調査の結果 **origin/mainで実装済み**（GameCreationDialogの「対局時計」セレクト→clock jsonb→GameBoard時計描画→時間切れ自動終局まで配線完了）。三村さんが見たのは旧ビルドキャッシュの可能性大。残ギャップ=自動ペアリングのみ → コミット1。キャッシュ問題自体はコミット6のSW更新機構で恒久対処
3. **対局開始時に生徒側で自動的に碁盤が開き最大表示** → 「碁盤だけ最大表示」(isBoardFocusMode)は実装済み。自動遷移のみ追加 → コミット2
4. **ログアウト・教室終了・ブラウザ閉じで中断扱い、中断棋譜を生徒履歴に保存＆再開ボタン** → コミット3〜5。**現行実装は構造バグ**（中断=finished+result='中断'→fetch対象外→再開ボタンが実質死んでいる。finishは'中断'のとき履歴保存を意図的スキップ=要件と真逆）

## 制約（壊してはいけないもの）

- 認可設計変更禁止: deny-by-default RLS、live系書込はEdge Function(service_role)経由のみ
- lint 0 errors維持（react-hooks系。effect内setState禁止）
- migration先は dojo-app共用プロジェクト `yzsyrtesydpulctjgdog`
- 各コミットで `npx eslint .` 0 errors / `tsc -b` / `npm run test` / E2E緑 → 即push

## 進捗

### ✅ コミット1: 一括ペアリングに対局時計選択（2026-07-08 Claude Code 完了）
- `AutoPairingDialog.tsx`: フッターに全対局共通の「対局時計」セレクト（CLOCK_PRESETS）。handleStartで各pairに `clock: createClock(...)` 付与
- `TeacherDashboard.tsx` L48: onCreateGames pairs型に `clock?: GameClock` 追加（App.tsx L1107 の `createGame(p)` は透過なので変更不要）
- `AutoPairingDialog.test.tsx` 新規3本（セレクト表示/無制限=clockなし/プリセット選択でclock付与）
- 検証: vitest 3/3・tsc緑・eslint 0 errors

### ⬜ コミット2: 生徒側で対局開始時に自動で碁盤を開く
- `App.tsx` のみ。**guarded setState-during-renderパターン**（effect不使用でlintクリーン）:
  - `autoOpenedGameId` state追加。render中（myGame算出直後、L1005付近）に自分のstatus='playing'対局が現れ、idが前回ガードと異なれば `setAutoOpenedGameId(id)`+`setActiveGameId(id)`+`setViewMode('game')`。myPlayingGameが消えたらガード解除（`setAutoOpenedGameId(null)`）→中断→再開・作り直しで再オープン
  - 手動でロビーに戻る操作は妨げない（同idでは再オープンしない）。L1010の「ロビーに留まる」分岐と手動ボタンは温存
- lintが `set-state-in-render` を弾いたら: `useLiveGameList` に `onGameUpsert` コールバック追加しイベントハンドラ文脈で通知（初回fetch分も通知）
- **E2E注意**: multi-user/multi-student specの「生徒が対局を開くボタンを押す」手順が自動遷移で変わる→ `e2e/helpers/` を先に監査・修正

### ⬜ コミット3: migration `20260708XXXXXX_live_game_interrupted_status.sql`
```sql
ALTER TABLE public.go_school_live_games
    DROP CONSTRAINT IF EXISTS go_school_live_games_status_check;
ALTER TABLE public.go_school_live_games
    ADD CONSTRAINT go_school_live_games_status_check
    CHECK (status IN ('playing', 'scoring', 'finished', 'interrupted'));
```
- 過去の `finished+'中断'` 行は変換しない（古い行の再浮上防止）。適用後 schema_migrations 記録（直接SQL適用時はrepair）。dojo-app側でstatusを読む消費者がいないか `git grep` 確認

### ⬜ コミット4: Edge `manage_game_action/index.ts`
- **`interrupt`**（game_id必須。既存認可ゲート=service_role/先生/当事者生徒がそのまま適用）:
  ① status が playing/scoring 以外なら `{ok:true, skipped:true}` で**冪等**（pagehide+ログアウト二重発火対策）
  ② moves取得→`exportLiveGameToSgf(..., '中断', date)`→`go_school_games` upsert（finish内の履歴保存ブロックを関数抽出して共有。キー=live game id なので再開後の正式終局で自然上書き）
  ③ live行を `status='interrupted', result='中断', clock.lastTickTime=null` にUPDATE
- **`interrupt_all`**（params.classroom_id必須、**teacher/service_roleのみ**=resetと同ガード）: 教室のplaying/scoring全行をサーバ側ループでinterrupt。`{ok, count}` 返却
- **`resume`修正**: `clock.lastTickTime=null` をUPDATEに含める（中断中の経過時間を没収しない。時計は次の着手のswitchClockで再始動=createClock初期挙動と同一）
- **`finish`のshouldSaveHistory（'中断'除外）撤去**: finishは常に保存
- デプロイ: `set -a; source ~/.secrets/supabase-dojo.env; set +a; supabase functions deploy manage_game_action --no-verify-jwt --project-ref yzsyrtesydpulctjgdog` → `npm run smoke:edge`

### ⬜ コミット5: 中断・履歴・再開のフロント配線
- `liveGameApi.ts`: status unionに `'interrupted'`、`fetchLiveGames` を `['playing','scoring','interrupted']` に、`interruptGame(gameId)`/`interruptAllGames(classroomId)` 追加
- `types/game.ts` GameSession.status / StudentTable の gameStatus union に interrupted 追加（表示「断」等）
- **新規 `src/utils/unloadInterrupt.ts`**: onAuthStateChangeでaccess_tokenモジュールキャッシュ→pagehide時 `fetch(keepalive:true, Authorization)` でinterrupt発射＋`sessionStorage['go-school-pending-resume']=gameId` 同期書込。**sendBeacon不使用**（Authorizationヘッダ不可）
- `App.tsx`:
  - 生徒ログアウト: `finishGame(id,'中断')`→`interruptGame(id)`。対象filterを playing+scoring に拡大
  - 先生の教室終了（handleDisconnect TEACHERブランチ）: destroy前に `interruptAllGames(classroomId)` best-effort
  - pagehide effect（**生徒のみ**、setStateなし）。**先生のpagehideではinterrupt_allしない**（誤リロード事故防止。教室終了=明示的な切断ボタンのみ）
  - 自動再開effect: pending-resumeと一致する自分のinterrupted対局があれば `resumeLiveGame` fire-and-forget（setStateなし。resume→realtime UPDATE→status='playing'→コミット2の機構が自動オープン）
  - 終局自動クローズeffect（L716-725）を `finished || interrupted` に拡張
- `Lobby.tsx` L89-91: 再開バナー条件を `status==='interrupted'` に修正
- `GameThumbnail.tsx` L82: 再開ボタン条件を `status==='interrupted'` に修正＋「中断」ラベル（黄）
- `TeacherDashboard.tsx` 棋譜履歴モーダル（L433付近）: `result==='中断'` かつ live一覧に同idのinterrupted行が存在→「再開」ボタン→`onResumeGame(id)`＋モーダル閉じ
- `GameBoard.tsx`: statusラベルに「中断」フォールバック
- E2E追加 `e2e/interrupt-resume.spec.ts`: ①生徒ログアウト→先生履歴モーダルに中断棋譜+再開→生徒側自動オープン ②生徒リロード→自動resume→盤面・時計復元

### ⬜ コミット6: PWA再有効化＋インストールボタン（単独リリースで監視）
- `vite.config.ts`: `selfDestroying: true` 削除（これがbeforeinstallpromptを殺している。aaa5e76で過去のSWキャッシュ事故対策として意図適用された経緯あり）
- `src/main.tsx`: `registerSW({ immediate:true, onRegisteredSW: 60秒毎 r.update() })`（`virtual:pwa-register`）→既存controllerchangeリロードで最新化=**旧キャッシュ配布再発の主対策**
- workbox runtimeCaching に `/version.json` NetworkOnly保険。`vite-env.d.ts` に pwa/client 型参照
- **新規 `src/hooks/usePwaInstall.ts`**: モジュールスコープでbeforeinstallprompt/appinstalled捕捉＋`useSyncExternalStore` で `{canInstall, isStandalone, isIos}`。iOSは手動案内（共有→ホーム画面に追加）。standalone起動時は非表示
- 設置: `LoginScreen.tsx` 補助ボタン群（キャッシュリセットボタンと同型スタイル）＋ `Header.tsx` 右側ボタン群（Downloadアイコン、canInstall時のみ）
- ロールバック: `selfDestroying: true` を戻す1行revert

### ⬜ コミット7（検証）: 本番検証＋記録
1. push→Vercel→`version.json` とHEAD照合
2. migration: pg_constraint確認 / Edge: smoke:edge version一致
3. `e2e/proof-prod.spec.ts` 本番スクショ: ログイン画面（インストールボタン）／対局作成ダイアログの時計欄（**機能2「実装済み」の証跡→三村さんへキャッシュリセット案内**）／一括ペアリング時計欄／中断→履歴→再開の一連
4. PWA実機: インストール＋デプロイ2回目で自動更新確認
5. handoff＋memory `projects/online-go-school.md` 更新

## リスク対策（要点）
- PWA旧キャッシュ再発: 60秒毎update+autoUpdate+controllerchangeリロード+version.json非precache＋1行revert
- pagehide不発火（iOS bfcache等）: playing残留→再入室で自動再表示=劣化安全側
- リロード誤中断: sessionStorageフラグで自動resume。interrupt冪等化で二重発火無害

## 設計判断（三村さんに報告する点）
- 先生のブラウザ閉じ/リロードでは全対局を中断**しない**（誤操作で全生徒の対局が一斉中断する事故防止。生徒同士の対局は先生のブラウザが閉じても継続できるのが正。教室終了=明示的な切断ボタンのみ全中断）
- 過去の中断対局（finished+'中断'）は新形式に変換しない
