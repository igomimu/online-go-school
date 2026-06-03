# 【決定版】実行プラン：秘密鍵撤去・認証認可・Vercel本番化（Stage 1〜10 完全準拠）

このプランは、指摘されたすべてのセキュリティ脆弱性（P0: 特権キー露出、LiveKit Secret 漏洩、トークン認可抜け / P1: 自動ログイン不整合、教室ID対応）を解決するため、プロジェクト内の [todo.md](file:///home/mimura/projects/online-go-school/tasks/todo.md) に定義されている **Stage 1〜10 の開発工程を完全な前提**として取り込み、再構築した本番化プランです。

---

## 1. 解決すべき主要課題と修正方針

### P0-1: `VITE_LIVEKIT_API_SECRET` のフロント露出の完全廃止 (Stage 8 前倒し)
* **現状**: [App.tsx](file:///home/mimura/projects/online-go-school/src/App.tsx) が `VITE_LIVEKIT_API_SECRET` を直接読んでおり、Vercel登録時にフロントJSに焼き込まれる。
* **修正方針**: クライアントから API Secret への参照を完全に削除します。本番環境では `VITE_LIVEKIT_URL` と `VITE_LIVEKIT_API_KEY` のみフロントに公開し、シークレットは **`LIVEKIT_API_SECRET` (接頭辞なし)** として Vercel Function (`api/token.ts`) 専用に設定します。

### P0-2: `VITE_DOJO_SUPABASE_KEY` (service_role) のフロント露出廃止と RLS 移行 (Stage 2〜8 前倒し)
* **現状**: [liveGameApi.ts](file:///home/mimura/projects/online-go-school/src/utils/liveGameApi.ts) が `service_role` キーを使用して直接の特権書き込みを行っている。
* **修正方針**: 
  * クライアントが使用する `VITE_DOJO_SUPABASE_KEY` を、管理者権限の `service_role` キーから、安全な **`anon` キー（公開用鍵）** へ完全に切り替えます。
  * `todo.md` に沿い、フロントは `supabase.auth.signInAnonymously()` でセッションを作成後、Edge Function `validate_student_session` / `validate_teacher_session` を呼び出し、サーバーサイドで検証された student_id などの `app_role` metadata を取得します。
  * 対局の状態更新は、RLS ポリシーで適切に保護された `anon` 鍵による操作、あるいは Edge Function (`submit_move` 等) に全面的に移行します。

### P0-3: `/api/token` の一時参加トークン検証と認可設計 (Stage 8 前倒し)
* **現状**: [api/token.ts](file:///home/mimura/projects/online-go-school/api/token.ts) がリクエストの identity や roomName を検証なしで信用し、誰にでも LiveKit JWT を発行する。
* **修正方針**:
  * `dojo-app` 側でオンライン授業参加ボタン押下時に、短命の「一時参加トークン」を Edge Function 等を介して発行します。
  * `api/token.ts` は、リクエストに含まれるこの一時トークンを Supabase を介して検証し、正当な生徒または先生であると確認できた場合にのみ、適切なロールの LiveKit JWT を発行する認可ロジックを追加します。

### P1-1: 自動ログインと接続フローの不整合解消 (Stage 8 前倒し)
* **現状**: 生徒自動接続処理において `apiSecret` を要求する古いロジックが残っており、秘密鍵を撤去すると接続できなくなる。
* **修正方針**:
  * `useServerToken` が有効な場合は、接続時にクライアント側での `apiKey`/`apiSecret` の要求を完全にスキップします。
  * `VITE_LIVEKIT_URL` ＋ `roomName` ＋ `/api/token` から取得した `signed join token` だけで LiveKit ルームに接続できるように [App.tsx](file:///home/mimura/projects/online-go-school/src/App.tsx) の接続シーケンスを改修します。

### P1-2: `classroomId` のマッピング設計
* **現状**: `dojo-app` 側の `classes.id` と、`online-go-school` 側で先生ブラウザの localStorage 等で管理している `classroom_id` が同一とは限らない。
* **修正方針**:
  * DB（Supabase）または設定ファイル上に `dojo_class_id`（dojo-appのクラスID）から `online_classroom_id`（online-go-schoolの教室ID）を紐付けるマッピングデータを定義し、自動遷移時に正しい教室へ誘導できるようにします。

---

## 2. 段階的実装ロードマップ (Stage 1〜10)

本番公開に向け、`todo.md` に基づき以下の順序で段階的にデプロイ可能な状態を維持しながら実装を進めます。

### 【フェーズ1】並行稼働・認証基盤の整備（Stage 1〜3）
* **Stage 1 (完了済み)**: supabase migration / Edge Function 開発基盤の整備。
* **Stage 2**:
  * `validate_student_session` Edge Function の稼働確認。
  * フロント側 `authStore.ts` に Supabase Session 連携を追加。
  * `signInAnonymously` → `validate_student_session` → `refreshSession` による新 JWT 取得フローの実装。
* **Stage 3**:
  * `authStore.ts` の復帰処理、supabase-js 標準の session 復帰への移行。
  * この段階ではまだ `VITE_DOJO_SUPABASE_KEY` に `service_role` を残し、アプリを壊さずに並行稼働させます。

### 【フェーズ2】特権キーの排除と Edge Function 権限保護（Stage 4〜7）
* **Stage 4**:
  * 先生用 `validate_teacher_session` Edge Function を新設（パスワード照合をサーバーサイドで完結）。
  * `submit_move` Edge Function を改修し、Authorization ヘッダーの JWT から identity を取得するよう変更（body 申告を廃止し、なりすましを防ぐ）。
  * 先生の代打ち権限（`app_role === 'teacher'` のみ許容）を明示的に保護。
* **Stage 5 & 6**:
  * `createLiveGame`, `updateClock` 等の残りの書き込み操作、および `dojoSync.ts`（students直読み）を Edge Function 呼び出しに移行。
* **Stage 7**:
  * `go_school_live_games`, `go_school_live_moves` テーブルの RLS（Row Level Security）を有効化し、`auth.jwt()->>'classroom_id'` や `teacher` ロールに基づく SELECT / WRITE ポリシーを設定・適用。

### 【フェーズ3】鍵の完全撤去と認可の実装（Stage 8）
* **Stage 8**:
  * `VITE_DOJO_SUPABASE_KEY` を安全な `anon` キーに切り替え、`service_role` キーをフロント JS から完全撤去。
  * `App.tsx` から `apiSecret` の参照、クエリパラメータ `secret` の生成・読み取り処理を削除。
  * `api/token.ts` に **「dojo-app の短命トークン検証」** による LiveKit JWT 発行の認可制限を追加。
  * `VITE_LIVEKIT_URL` + room + token のみで入室するクライアント接続フローへの移行。

### 【フェーズ4】検証と Vercel デプロイ（Stage 9〜10）
* **Stage 9**:
  * Playwright E2E テストにセキュリティ違反のテスト（別教室JWTアクセス時の403等）を拡充。
  * `dist/` 配下のビルド成果物に対し、`grep` スキャンを実行し、`service_role` や `apiSecret` の値が焼き込まれていないか厳密に確認。
* **Stage 10**:
  * Vercel プロジェクトに `VITE_` 接頭辞のない `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` および公開用の `VITE_LIVEKIT_URL` / `VITE_LIVEKIT_API_KEY` を登録。
  * `vercel.json` 本番設定を投入し、DNS（`online.mimura15.jp`）を切り替える。
