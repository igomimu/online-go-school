# Phase 0: セキュリティ整備計画（A+ 段階分け）

**ゴール**: 本番公開しても事故らない状態にする。具体的には (1) service_role key のフロント露出廃止、(2) submit_move のなりすまし防止、(3) `go_school_*` テーブルに適切な RLS を設定、(4) dojo-app `students` 直読み廃止。

**絶対条件**: 各 Stage の完了時点でアプリが壊れていないこと（段階ごとにデプロイ可能）。

**作成**: 2026-04-20

---

## 設計方針（確定済み）

- **Custom JWT via Edge Function** 方式で進める
- 認証フロー: 生徒ログイン → `issue_session` Edge Function → Supabase署名JWT発行 → フロントが `supabase.auth.setSession()` で装着 → 以降全ての書き込みはJWT検証つき Edge Function 経由
- RLS は `auth.jwt()->>'classroom_id'` / `'role'` / `'student_id'` 等の claim ベース
- 既存の `submit_move` パターンを各操作に拡張

---

## Stage 1: 基盤整備（migration と Edge Function 開発基盤）✅ 2026-04-20 完了

**目的**: 以降の変更を git 管理・コードレビュー可能にする

**作業**:
- [x] `online-go-school/supabase/` ディレクトリを作り `supabase init`
- [x] `supabase link --project-ref yzsyrtesydpulctjgdog` で本番 Supabase に接続
- [x] `go_school_*` 3テーブルの現状スキーマを baseline migration として取り込み（`20260420030749_baseline_go_school_tables.sql`）
- [x] `supabase migration repair --status applied` で本番履歴と同期（本番は無変更）
- [x] GitHub Actions workflow 骨組み設置（`.github/workflows/deploy-edge-functions.yml`、deploy 対象は Stage 2 以降で追加）
- [~] `submit_move` の引っ越しは Stage 2 で `issue_session` 追加と同時に実施（Stage 1 ではスコープ外にした）
- [~] `.env.development` は Stage 2 で必要になった時に作成（現状 `.env` で足りる）
- [x] `npm run test:e2e` 相当の確認: 既存機能（LEGION で稼働中の go-school.service）に影響なし

**検証済み**: 本番 Supabase への破壊的変更は一切行わず、migration の履歴だけ整えた状態。LEGION 上の dev server は引き続き稼働中。

**所要時間**: 約1時間

---

## Stage 2: 受付作り（`issue_session` Edge Function 新設）

**目的**: 本人確認してJWTを発行する仕組みを作る。フロントからはまだ呼ばない（並行稼働）

**作業**:
- [ ] `issue_session` Edge Function 新設
  - 生徒ルート: `studentId + classroomId + studentName` → dojo-app `students` と照合 → OK なら JWT 発行
  - 先生ルート: `classroomId + password` → classrooms テーブル or 環境変数で照合 → OK なら JWT 発行
- [ ] JWT claim 設計: `role` (student|teacher), `student_id` or `teacher_id`, `classroom_id`, `exp`, `iss`, `sub`
- [ ] Supabase プロジェクトの JWT_SECRET を Edge Function に渡す（Supabase.functions secrets）
- [ ] リフレッシュトークン機構も併設（期限切れ前の再発行）
- [ ] Deno test で JWT 発行・検証ロジックをユニットテスト

**検証**:
- curl で `issue_session` を叩き、返ってくる JWT をデコードして claim が正しいことを確認
- 不正な studentId で 403 が返ることを確認
- 発行された JWT を `supabase.auth.setSession()` で装着してクエリが投げられることを確認（手動）

**想定時間**: 1日

---

## Stage 3: フロント側 JWT 装着（service_role と共存期）

**目的**: アプリを壊さずに JWT 装着機構を入れる。既存の service_role 経路と並行稼働

**作業**:
- [ ] `authStore.ts` に JWT 保存・期限管理を追加
- [ ] ログイン成功時に `issue_session` を呼ぶフローを追加
- [ ] `useLiveGame` 等で Supabase クライアント初期化時に `supabase.auth.setSession({ access_token, refresh_token })` を装着
- [ ] リフレッシュ機構（期限切れ前に再発行）
- [ ] JWT 装着状態を LocalStorage から復元（再読み込み対応）
- [ ] `VITE_DOJO_SUPABASE_KEY` はまだ service_role のまま（共存期）

**検証**: 
- ログイン後、ブラウザの DevTools で `localStorage` に JWT が保存されていることを確認
- Network タブで Supabase へのリクエストの Authorization ヘッダーに JWT が付いていることを確認
- 対局・検討・ログアウト・再ログインが全て動くこと
- E2E テスト再実行

**想定時間**: 半日〜1日

---

## Stage 4: `submit_move` を JWT 検証ベースに改修

**目的**: 着手のなりすまし問題を解消する（Phase 0 最重要セキュリティ修正）

**作業**:
- [ ] `submit_move` が Authorization ヘッダーの JWT を検証するよう改修
- [ ] `caller_identity` を body から取るのをやめ、JWT claim の `student_id` / `teacher_id` から取得
- [ ] 先生の代打ち（`role === 'teacher'` なら任意の `caller_identity` を受け付ける）の扱いを明示
- [ ] 互換性のため JWT 無しリクエストも一時的に許可（警告ログ）← Stage 8 で削除
- [ ] Deno test でなりすまし試行が 403 になることをテスト

**検証**:
- 正常着手が動く
- 他生徒の対局に着手しようとすると拒否される
- 先生が代打ちできる
- E2E テスト再実行

**想定時間**: 半日

---

## Stage 5: 他の書き込み操作を Edge Function 化

**目的**: フロントからの直接 update を全廃し、全書き込みをサーバー側権威に

**対象**: `createLiveGame`, `enterScoring`, `updateDeadStones`, `finishGame`, `updateClock`

**作業**:
- [ ] それぞれに対応する Edge Function 作成（または `game_action` Edge Function に action 種別を持たせて1本化）
- [ ] JWT 検証 + 権限チェック（先生 or 該当プレイヤーのみ）
- [ ] `liveGameApi.ts` のフロント実装を Edge Function 呼び出しに差し替え
- [ ] Deno test で権限拒否ケースをテスト

**検証**: 対局の一連のフロー（作成→対局→整地→終局）が全て動くこと。E2E 全通過

**想定時間**: 1〜2日

---

## Stage 6: `dojoSync.ts`（students 直読み）を Edge Function 経由に

**目的**: dojo-app `students` の直読みを廃止。anon 化時の壊れを予防

**作業**:
- [ ] `fetch_students` Edge Function 新設
  - Edge Function 内部で service_role を使って dojo-app `students` を読む
  - JWT 検証（先生のみ利用可とする）
  - 必要なフィールドだけ返す（余計な情報は返さない）
- [ ] `dojoSync.ts` を Edge Function 呼び出しに差し替え
- [ ] 既存の REST 直叩きコードを削除

**検証**: ネット生徒リストが先生画面で表示されること

**想定時間**: 半日

---

## Stage 7: RLS ポリシー作成・適用（鍵をかける）

**目的**: データベースレベルで「他の教室の対局は触れない」を強制

**作業**:
- [ ] `go_school_live_games` の RLS 有効化 + ポリシー
  - SELECT: `auth.jwt()->>'classroom_id' = classroom_id OR auth.jwt()->>'role' = 'teacher'`
  - INSERT/UPDATE/DELETE: 拒否（全て Edge Function 経由にしているので不要）
- [ ] `go_school_live_moves` の RLS 有効化 + ポリシー
  - SELECT: 対局が見える人なら見える（関連する game の classroom_id で制御）
  - INSERT/UPDATE/DELETE: 拒否（submit_move 経由のみ）
- [ ] `go_school_games` の既存「全許可」ポリシー削除 + 正しいポリシー設定
  - SELECT: 自分の教室または先生
  - INSERT/UPDATE/DELETE: 先生のみ、または本人
- [ ] migration として commit、`supabase db push` で本番反映
- [ ] Realtime の RLS 対応を確認（`supabase_realtime` publication、RLS 自動適用）

**検証**:
- 別の classroom_id の JWT で SELECT しようとして弾かれること
- 生徒が他の教室の対局を見れないこと
- 先生が全対局を監視できること
- E2E 全通過

**想定時間**: 1日（RLS のテストケース書くのに時間がかかる）

---

## Stage 8: キーを anon (publishable) に切り替え、service_role 廃止

**目的**: マスターキー完全撤去

**作業**:
- [ ] `.env` の `VITE_DOJO_SUPABASE_KEY` を `sb_publishable_...` に変更
- [ ] `VITE_LIVEKIT_API_KEY` / `VITE_LIVEKIT_API_SECRET` をフロントから削除
- [ ] `livekitToken.ts` のフロント直発行コード削除、`api/token.ts` 経由一本化
- [ ] `api/token.ts` も JWT 検証追加（先生と該当プレイヤーだけが LiveKit 部屋に入れる）
- [ ] Stage 4 で残した互換コード（JWT 無しリクエスト許可）を削除
- [ ] dev server / E2E を全て anon key で動かして動作確認

**検証**:
- `.env` に service_role key を戻さなくてもアプリ全体が動くこと
- ブラウザで公開されている JS バンドルに service_role が含まれていないこと（`grep service_role dist/` で確認）
- E2E 全通過

**想定時間**: 半日

---

## Stage 9: E2E テスト拡充 + 本番デプロイ準備

**目的**: 本番公開前の最終品質確認

**作業**:
- [ ] Playwright E2E にセキュリティテスト追加
  - 別教室のJWTで対局取得 → 403
  - 生徒が先生のみの操作をしようとして 403
  - 無効JWTでアクセスして 401
- [ ] `vercel.json` の環境変数・ビルド設定を本番想定で整備
- [ ] Vercel Preview デプロイで最終動作確認（online.mimura15.jp は切り替えない）
- [ ] Phase 0 の変更点を .claude/CLAUDE.md / AI_CONTEXT.md に反映

**検証**: 全E2Eパス、Preview URLで手動確認OK

**想定時間**: 半日〜1日

---

## Stage 10（=Phase 1）: Vercel化 + DNS切り替え

**目的**: LEGION依存から解放する

**作業**:
- [ ] Vercel プロジェクト作成、GitHub 連携（igomimu/online-go-school）
- [ ] Vercel Dashboard に環境変数投入（`VITE_*` は publishable のみ、`LIVEKIT_API_*` は VITE_ なし）
- [ ] 初回デプロイ、Preview で動作確認
- [ ] `online.mimura15.jp` の Cloudflare DNS を Vercel に切り替え
- [ ] LEGION の `cloudflared-pokekata.service` config から `online.mimura15.jp` ルート削除（または `dev.online.mimura15.jp` に退避）
- [ ] 本番URLで一通り動作確認

**検証**: LEGION の dev server を止めても生徒がアクセスできること

**想定時間**: 半日

---

## 全体見積もり

合計: **6〜8日間の集中作業**（テスト時間含む）

段階ごとにデプロイ・動作確認するので、1日ずつ進めて合計10〜15日（実働）の想定が現実的。

---

## 着手順の原則

1. **Stage 1〜3 は「並行稼働の準備」** — まだセキュリティは改善していないが、壊さず進める土台
2. **Stage 4 で submit_move のなりすまし解消** — ここで大きな価値が出る
3. **Stage 5〜6 で全書き込みを権威化**
4. **Stage 7 で RLS 有効化** — この時点でフロントが正しく JWT を持っていないと読めなくなる（だから Stage 3 が先）
5. **Stage 8 で service_role 廃止** — ここまで来てようやく安全
6. **Stage 9 で最終確認**
7. **Stage 10 で Vercel化**

各 Stage の完了時点で git tag を切っておき、問題があれば戻れるようにする。
