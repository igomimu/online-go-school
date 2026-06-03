# 修正版・実行プラン：三村囲碁オンライン（online-go-school）の本番化と dojo-app 連携

このプランは、指摘された重大なセキュリティ脆弱性（Supabase `service_role` キーおよび LiveKit `apiSecret` のクライアント側への露出）を最優先で修正した上で、`online-go-school` を Vercel に本番デプロイし、`dojo-app` とのシームレスな自動ログイン連携を安全に構築する計画です。

---

## 1. 開発ロードマップと変更内容

### フェーズ1：セキュリティ修正（最優先・デプロイ前必須）

Vercel へのデプロイ前に、クライアント（JSバンドル）に inline されるすべての特権鍵・シークレットを完全に剥がし、適切なセキュリティ境界を再設計します。

#### ① Supabase `service_role` キーの露出排除と RLS 移行
* **環境変数の切り替え**:
  * クライアントが使用する `VITE_DOJO_SUPABASE_KEY` を、管理者権限の `service_role` キーから、安全な **`anon` キー（公開用鍵）** へ完全に切り替えます。
* **対局書き込みのサーバーサイド（Edge Function）移行**:
  * [liveGameApi.ts](file:///home/mimura/projects/online-go-school/src/utils/liveGameApi.ts) から `service_role` キーを用いた直接の特権書き込み（Direct insert）を削除します。
  * 着手書き込み（`go_school_live_moves` へのインサート等）など、生徒・先生ロールの権限検証を伴う特権アクションは、既存 of Supabase Edge Function（例: `submit_move`）を経由する構成、もしくは RLS ポリシーで適切に保護された anon キー経由の直接更新へ移行します。

#### ② LiveKit `apiSecret` 露出の完全排除
* **参加リンクのクエリパラメータ修正**:
  * [App.tsx](file:///home/mimura/projects/online-go-school/src/App.tsx) 内で参加リンクを生成する処理（`searchParams.set('secret', apiSecret)`）およびそれに関連する `secret` パラメータの読み込み処理を完全に削除します。
* **Vercel 環境変数設定の厳格化**:
  * Vite のビルド時に inline 化（漏洩）を防ぐため、Vercel 側には以下の構成で環境変数を設定します。
  * **設定対象（クライアント公開用）**: `VITE_LIVEKIT_URL` (✅接続先URL), `VITE_LIVEKIT_API_KEY` (✅APIキー)
  * **設定対象（サーバーレス関数 `api/token.ts` 専用）**: `LIVEKIT_API_KEY` (✅接頭辞なし), `LIVEKIT_API_SECRET` (✅接頭辞なし)
  * **登録禁止**: `VITE_LIVEKIT_API_SECRET` (❌絶対に登録しない)

---

### フェーズ2：Vercel 本番デプロイと動作検証

セキュリティ修正が完了し、`npm run build` で生成される成果物から機密情報が完全に排除されたことを確認した上で、Vercel にデプロイします。

* **本番デプロイの自動化**:
  * Vercel の静的ホスティング ＋ `api/token.ts` の Serverless Function が正常に LiveKit 接続トークンを発行できることを確認します。
* **Playwright E2E テストによる先祖返り検証**:
  * `service_role` 排除後も、対局時計や代打ち、自動ペアリングが正常に動作することを Playwright テスト（`npm run test:e2e`）で自動検証します。

---

### フェーズ3：dojo-app ── online-go-school 間の自動ログイン連携

#### ① 一時トークンを用いた「本物の Supabase セッション」の確立
* **スタブ化されたセッション検証の復活**:
  * 直近でバイパス（スタブ化）されていた `supabaseSignInStudent` / `supabaseSignInTeacher` を修復し、`dojo-app` から渡された一時認証トークンを検証して、正しい `app_role` を持つ本物の Supabase セッション（JWT）を確立します。これにより、クライアントが `service_role` なしで安全に API を叩けるよう認証を正常化します。

#### ② dojo-app の生徒ダッシュボードに「オンライン教室に参加」ボタンを設置
* **自動ログイン導線**:
  * [dojo-app 側](file:///home/mimura/projects/dojo-app) からワンタップで自動遷移し、[online-go-school 側](file:///home/mimura/projects/online-go-school) のログイン画面をスキップしてロビーに直接入室できる安全なリンク（一時トークン付き）を生成します。

---

## 2. 動作確認・検証計画 (Verification Plan)

### 自動テスト (Automated Tests)
* **Playwright E2E テストの完走**: `reconnect.spec.ts`, `multi-user-game.spec.ts` を実行し、認証変更後の安定性を確認します。
* **ビルド成果物の漏洩スキャン**: ビルド後の `dist/` 配下の JS ファイルに対し、`service_role` の値や LiveKit Secret が含まれていないかを grep 等で自動チェックします。

### 手動検証 (Manual Verification)
1. Vercel デプロイ後の環境で、ブラウザから入室した際に LiveKit トークンが正しく `/api/token` 経由で取得できることを確認します。
2. `dojo-app` から「オンライン教室に参加」した際、Supabase のセッション（JWT）が正しくローカルストレージに格納され、特権キーなしで着手・代打ちができることを検証します。
