# Windows版パリティ監査ログ - 2026-05-01

## 実施内容

- `origin/main` にfast-forwardして、最新のLiveKit + Supabase権威型の状態へ更新した。
- `reference/windows/` を作成し、Windows版スクショ・録画・サンプルファイルの置き場を定義した。
- `tasks/windows-parity.md` を作成し、先生管理画面と授業中ダッシュボードの初期棚卸しを行った。
- `npm install` で `origin/main` の依存関係に追従した。
- Node 22で `npm run build` を実行し、成功を確認した。
- Node 22で `npm test` を実行し、292件中283件成功、9件失敗を確認した。
- `GameBoard.test.tsx` をSupabase権威型の現行 `useLiveGame()` 設計に合わせて修正した。
- `classroomLiveKit.ts` の信頼送信対象に旧対局同期メッセージを戻した。
- 先生の対局作成で `teacherName={userName}` により白番が空文字になるバグを修正した。
- Node 22で `npm test` が292件すべて成功することを確認した。
- `e2e/multi-user-game.spec.ts` が成功することを確認した。
- ユーザー指摘「石が置けないレベル」に対して、先生が白番参加者のまま黒番を代打ちしようとすると `Not your turn` になる経路をE2Eで再現した。
- `useLiveGame` の先生代打ち判定を修正し、先生の場合は常に現在手番のプレイヤーID/色で `submit_move` へ送るようにした。
- `useLiveGame.test.ts` を追加し、先生が白番参加者でも黒番代打ちを黒プレイヤーIDで送ることを固定した。
- Node 22で `npm test` が293件すべて成功することを確認した。
- Node 22で `npm run build` が成功することを確認した。
- `e2e/multi-user-game.spec.ts -g "先生が対局盤を開いて代打ちで着手できる"` が成功することを確認した。
- 生徒側の既存E2Eが初回だけ `あなたの番です` 待ちで落ちる揺れを再現した。失敗時の生徒画面はロビーではなくGameBoardの「対局を読み込み中...」で停止していた。
- `useLiveGameList` でRealtime購読成立後に必ず対局一覧を再取得し、購読前に発生したINSERT取り逃がしを回収するようにした。
- `useLiveGameList.createGame()` で作成レスポンスをローカル一覧へ即時反映し、先生画面をRealtime待ちにしないようにした。
- `GameBoard` / `useLiveGame` に初期対局行を渡し、ロビーが既に持っている黒白情報で新規対局の初手画面を即時表示できるようにした。
- `useLiveGameList.test.ts` を追加し、購読成立後再取得と作成時即時反映を固定した。
- `useLiveGame.test.ts` に初期対局行があれば詳細取得待ちでローディングに止まらないテストを追加した。
- Node 22で `npm test` が296件すべて成功することを確認した。
- Node 22で `npm run build` が成功することを確認した。
- `e2e/multi-user-game.spec.ts` を2回連続で実行し、どちらもリトライなしで2件成功することを確認した。
- `e2e/multi-student-game.spec.ts` が成功することを確認した。

## 観察

- `ClassroomManager.tsx` はWindows版の先生管理画面をかなり意識した実装になっている。
- `TeacherToolbar.tsx` には見た目だけのボタンが複数ある。
- `開く` と `開始` は現状どちらも教室起動に接続されているため、Windows版で差分確認が必要。
- `回線復旧` と `ビデオリセット` は授業中の事故対応に直結するため、見た目だけのまま残すリスクが高い。
- `npm test` の失敗は、Windowsパリティ作業前に直すべき検証基盤の負債。特に `GameBoard.test.tsx` はSupabase権威型への移行後、テストが現実のデータ取得方式に追従していない可能性が高い。
- 対局E2Eで、先生側の白番が空文字になっていた。原因はGameCreationDialogに先生のLiveKit identityではなく空の `userName` を渡していたこと。
- 対局作成から生徒入室、初手着手、先生代打ちはE2Eで確認できた。ただし連続パス、整地、終局、棋譜保存は未監査。
- 先生代打ち不能の原因は、先生自身が白番参加者でもある場合に `useLiveGame` が `myColor=WHITE` を優先し、黒番の初手を `teacher/WHITE` として送っていたこと。サーバー側は正しく `Not your turn` で拒否していた。
- 生徒着手同期テストの揺れは、対局一覧ではなくGameBoard詳細取得待ちで止まるケースだった。ロビーが保持済みの対局行をGameBoardへ渡すことで、新規対局の初手画面は詳細取得の遅延に巻き込まれない。
- 複数生徒E2Eでは `validate_student_session` Edge Function の500ログが出るが、現行フローでは非致命扱いで対局自体は完走している。Phase 0の認証切替作業で別途扱う。

## 次にやること

1. Windows版の通常操作録画またはスクリーンショットを `reference/windows/` に入れる。
2. 対局機能の残り: パス、投了、整地、棋譜保存を1つずつE2E化する。
3. `回線復旧` のWindows版挙動を確認し、LiveKit再接続機能として実装する。
4. `ビデオリセット` のWindows版挙動を確認し、カメラトラック再公開として実装する。
5. `共有検討` を試験レッスンE2Eの中核フローとして固める。
