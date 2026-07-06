# 三村囲碁オンライン 修正タスク

## タスク一覧
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
