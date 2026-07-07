# 三村囲碁オンライン 修正タスク

## タスク一覧
- [x] 5. 対局・検討・問題・棋譜を開いた時にホーム画面項目を隠して碁盤を大きく表示
  - [x] `game` / `review` / `problem` 中はヘッダー、動画タイル、接続/音声パネルを非表示にする
  - [x] 詰碁画面も対局・検討と同じ全画面オーバーレイにする
  - [x] `GoBoard` の高さ制限を画面ごとに上書き可能にする
  - [x] 対局・検討/棋譜・問題の全画面に「閉じてホーム」ボタンを付ける
  - [x] ビルド/テストで検証する
- [x] 4. 終局後に棋譜履歴へ保存されない問題の修正
  - [x] `manage_game_action` の `finish` で `go_school_games` にSGFを保存する
  - [x] 「中断」は再開対象なので履歴保存から除外する
  - [x] 生徒別履歴検索で `sid:<uuid>` 形式も検索する
  - [x] SGF生成・履歴検索のテストを追加する
  - [x] ビルド/テストで検証する
- [x] 1. 対局中のままログアウトした時に確実に「中断」扱いにする修正
  - [x] `src/App.tsx` の `handleDisconnect` で `finishGame` を `await` してから `supabaseSignOut` などを実行するように順序修正
- [x] 2. 着手表示の遅延（数秒）の修正
  - [x] `src/types/game.ts` に `GameMovePayload` や `GAME_PASS` 用の `moveNumber` を追加
  - [x] `src/App.tsx` の `onMessage` ハンドラで、対局メッセージ（`GAME_MOVE`, `GAME_PASS`, `GAME_RESIGN`）を受信した時にカスタムイベント `'live-game-message'` を発信するように修正
  - [x] `src/components/GameBoard.tsx` で `classroom` インスタンスを props として受け取り、`useLiveGame` フックに渡すように修正
  - [x] `src/App.tsx` の `GameBoard` レンダリング箇所で `classroom={classroomRef.current}` を渡すように修正
  - [x] `src/hooks/useLiveGame.ts` で `classroom` 引数を追加し、楽観的更新と LiveKit メッセージの送信・受信を実装。また `onMoveInsert` 時の重複排除・差し替えロジックを実装
- [x] 3. 動作検証
  - [x] ローカルビルド確認 (TypeScript typecheck 正常終了)
  - [x] 本番環境（Vercel）へのデプロイ

## レビュー結果
- 2026-07-07: Live対局の終局時に保存棋譜テーブルへSGFが作られず、生徒別履歴検索も `sid:<uuid>` 形式を見ていなかったため、終局後の棋譜履歴に出ない問題を修正。
- 検証: `npm run test` 309/309 passed、`npm run build` 成功、`deno test --allow-env --allow-net supabase/functions/_shared/sgf.test.ts supabase/functions/_shared/identity.test.ts` 成功。
- 2026-07-07: 対局・検討/棋譜・問題を碁盤フォーカスの全画面表示に統一し、全画面中はホーム画面のヘッダー/参加者/音声パネルを隠すように修正。各画面に「閉じてホーム」ボタンを追加。
- 検証: `npm run test` 309/309 passed、`npm run build` 成功。
