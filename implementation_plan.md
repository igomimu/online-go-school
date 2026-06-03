# 実行プラン：三村囲碁オンライン（online-go-school）の本番化と dojo-app 連携

このプランは、現在開発がスタックしている「三村囲碁オンライン（`online-go-school`）」をVercelに本番デプロイし、LEGIONでの開発サーバーの手動起動なしで24時間365日いつでも動く状態にし、さらに「`dojo-app`」からワンタップで自動ログイン入室できる連携を実装する計画です。

---

## 1. 開発ロードマップと変更内容

### フェーズ1：Vercel本番環境へのデプロイと動作検証

#### [MODIFY] `online-go-school` 側の設定・デプロイ
* **環境変数の同期とVercel本番設定**:
  * ローカルの `.env.local` にある LiveKit Cloud の設定（`VITE_LIVEKIT_URL` / `VITE_LIVEKIT_API_KEY` / `VITE_LIVEKIT_API_SECRET`）および Supabase の本番用キー（`VITE_DOJO_SUPABASE_URL` / `VITE_DOJO_SUPABASE_KEY`）を、Vercelのプロジェクト設定画面に環境変数として登録します。
  * `.env.production` の整理。
* **Vercel API Token Function (`api/token.ts`) の本番動作検証**:
  * LiveKit Server SDK を使った JWT 発行機能が、Vercel Serverless Function 上で正しく動作するかをログおよびテスト経由で確認します。
  * WSL2 IP 直打ちの古い参照がコード内に残っていないかを最終チェックします。

### フェーズ2：`dojo-app` ── `online-go-school` 間のシームレス自動ログイン連携

生徒や保護者がIDやパスワード、教室IDを都度入力する手間（「しんどさ」）をなくすため、ログイン状態を自動で引き継ぐ導線を実装します。

#### [NEW / MODIFY] [dojo-app 側](file:///home/mimura/dojo-app) の変更
* **生徒画面に「オンライン教室に参加」ボタンを追加**:
  * 保護者・生徒が利用する `dojo-app` のダッシュボードに、オンライン開館時間中にのみ表示される（または常時表示される）「オンライン教室に参加」ボタンを追加します。
  * ボタン押下時、Supabase セッションから取得した生徒の `studentId`、`studentName`、および所属する `classroomId` をセキュアなハッシュ、あるいは一時トークンとしてURLパラメータ（例: `https://online.mimura15.jp/login?token=xxxx`）に付与して `online-go-school` を起動します。

#### [MODIFY] [online-go-school 側](file:///home/mimura/online-go-school) の変更
* **自動ログインロジックの実装**:
  * [LoginScreen.tsx](file:///home/mimura/online-go-school/src/components/LoginScreen.tsx) またはエントリポイントにおいて、URLパラメータから自動ログイン情報を検知し、手入力なしで直接「ロビー」または指定された「教室（Room）」へ直行する処理を実装します。
  * 認証の永続化（`authStore.ts` への自動書き込み）を行い、途中で回線が切れてもリロードすれば自動で再接続できるようにします。

---

## 2. 動作確認・検証計画 (Verification Plan)

### 自動テスト (Automated Tests)
* **Playwright E2Eテストの実行**:
  * 既存のE2Eテストスイート（`multi-user-game.spec.ts`, `reconnect.spec.ts`）を実行し、今回の変更によって対局の同期やLiveKit接続に先祖返り（デグレード）が発生していないかを検証します。
  * `npm run test:e2e`

### 手動検証 (Manual Verification)
1. **Vercel デプロイ後の接続確認**:
   * スマホおよびPCのブラウザから `https://online.mimura15.jp/` にアクセスし、マイク・カメラの許可が正常に取得でき、LiveKit Cloud への接続トークンが発行されることを確認します。
2. **自動ログイン連携テスト**:
   * ローカルまたはテスト環境の `dojo-app` から「オンライン教室に参加」ボタンを押し、`online-go-school` に一発で遷移し、ログイン画面をスキップしてロビーに入れるかを確認します。

---

## 3. オープンクエスチョン（ご確認事項）

> [!IMPORTANT]
> - **Vercel アカウントの連携**: Vercelへのデプロイを実行するにあたり、現在ローカルのCLIでログイン済みか（`vercel login` が必要か）を確認させてください。
> - **オンライン授業の開館曜日**: 現在、火・水・土にネット生クラスがありますが、自宅移転（プランB）に向けて平日の受け皿とする際、オンラインを稼働させる具体的な曜日・時間帯の構想があれば、それに合わせて `dojo-app` 側のボタンの表示制御（開館中のみ光らせる等）を設計します。
