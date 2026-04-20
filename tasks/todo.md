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

## Stage 2: 認証パス切替（Anonymous Sign-In + Auth Hook + validate_student_session）

**目的**: 検証済みの identity を JWT claim に封入する仕組みを作る。フロントからはまだ呼ばない（並行稼働）。

### 設計方針 pivot の経緯（2026-04-20）
- 原計画「Custom JWT via Edge Function」は Supabase JWT_SECRET の1回以上の共有が必要
- JWT_SECRET は Dashboard からのコピーでのみ取得可（Management API 不可、再発行は dojo-app が壊れるので不可）
- ユーザー作業ゼロ方針と両立しないため、**自前発行を捨てて Supabase 発行 JWT に pivot**
- 本質は「自前署名すること」ではなく「**claim の中身をサーバーが決める**」こと。これを Edge Function の metadata 上書き経路で担保する

### 新設計フロー
1. フロント: `supabase.auth.signInAnonymously()` → metadata なしの anon user 作成（Supabase が自分の鍵で JWT 署名）
2. フロント: Edge Function `validate_student_session` を Authorization: Bearer <jwt> で呼ぶ
3. Edge Function: JWT から sub 取得 → dojo-app `students` 照合 → `auth.admin.updateUserById` で user_metadata に検証済み値を書き込み
4. フロント: `supabase.auth.refreshSession()` で metadata 反映済みの新 JWT を取得
5. Auth Hook (`public.custom_access_token_hook`) が user_metadata を claim トップレベルに昇格
6. Stage 7 の RLS は `auth.jwt()->>'classroom_id'` 等で claim を読む

### 完了済みの本番作業（2026-04-20）
- [x] `public.custom_access_token_hook` 関数作成・権限設定（migration `20260420204425`、Management API で適用済み）
- [x] `public.handle_new_user` 改修: anon ユーザーは profiles insert スキップ（migration `20260420211528`、適用済み）
- [x] Anonymous Sign-In と Hook の一時有効化（確認後すぐ OFF に戻した。500エラー検証時）

### 現在の状態
- Anonymous Sign-In: **OFF**
- Custom Access Token Hook: **OFF**（関数は本番に存在、URI設定は消してある）
- dojo-app の Magic Link signup は従来通り動作（handle_new_user 改修で anon skip するだけ、通常ユーザーには影響なし）

### classroom_id の検証省略（Option A 確定、2026-04-21）
2026-04-21 の実装時、dojo-app `students` テーブルに `classroom_id` カラムが**存在しない**ことが判明（online-go-school の classroom は先生ブラウザの localStorage `go-school-classrooms` で管理されている）。Edge Function で classroom_id を照合する先が無い。

方針: body の classroom_id は**検証せず**そのまま user_metadata に書き込む。
- 現行 localStorage 認証と同じセキュリティレベル → regression なし
- student_id の存在・active 検証が、現行認証に対する**本物の改善点**
- Stage 7 RLS は `student_id` / `app_role` を主ゲートにし、`classroom_id` claim は UX グルーピング / defense-in-depth にとどめる（trust boundary として使わない）
- Stage 4 の submit_move 改修では caller_identity を **JWT claim の student_id** から取得する（body 申告廃止）
- 将来マルチ教室運用で真正性が必要になったら、Supabase に classroom テーブル新設（Phase 1 以降の判断）

#### Security model: UUID moat 前提（load-bearing）
Option A は「student_id を知っている者 = 正当な生徒」に帰着する。この前提は `students.id` が **UUID v4 で非 enumerable** であることに依存している。
- 将来 `students.id` を「生徒番号001」のような人間可読・連番形式に変えると、本認証モデルは全崩壊する
- `students.id` 形式を変更する提案が出たら、そのPRで Option A を再設計する（student_id とは別の secret を併用する等）
- Stage 4 の submit_move 改修時にも同じ前提を再確認する

### 残作業
- [x] `validate_student_session` Edge Function 新設（2026-04-21、Option A 実装）
  - body: `{ studentId, classroomId }`
  - Authorization ヘッダーの JWT を Supabase auth で検証 → is_anonymous 確認 → sub 取得
  - dojo-app `students` で照合（student_type='net', status='active'）
  - OK なら service_role で `auth.admin.updateUserById(sub, { user_metadata: { student_id, classroom_id, app_role: 'student' } })`
  - NG なら 401/403
- [x] `.github/workflows/deploy-edge-functions.yml` のデプロイ対象を `validate_student_session` に差し替え（2026-04-21）
- [x] `supabase/functions/issue_session/` 削除 + `scripts/gen-teacher-hash.mjs` 削除 + `bcryptjs` devDependency 削除（2026-04-21）
- [ ] フロント側
  - [ ] `authStore.ts` に Supabase Session 連携を追加
  - [ ] ログインフロー: `signInAnonymously` → `validate_student_session` 呼び出し → `refreshSession`
  - [ ] リロード復帰時は `supabase.auth.getSession()` 経由で自動復帰
- [ ] Management API で Anonymous Sign-In と Hook を再有効化
- [ ] dojo-app の Magic Link signup smoke test（Hook 再有効化後）

### 先生認証は Stage 4 に延期
- 理由: 先生パスワードの Edge Function secret 投入が再度ブロッカーになる。Stage 4 の submit_move 改修で classroom_id ベース権限判定と一緒にやる方が自然
- 暫定: Stage 3 までは localStorage SHA-256 のまま。三村さん単独先生のため実質リスクゼロ

### 検証（load-bearing check）
- curl で `signInAnonymously` → `validate_student_session` → `refreshSession` を通し、新 JWT の claim に `student_id` / `classroom_id` / `app_role` が載ることを確認
- 不正な studentId で 403 が返ることを確認
- dojo-app の Magic Link signup を smoke test（retired user でも retire されていない tester で再テスト）

**想定時間**: 残り 0.5〜1日

---

## Stage 3: フロント側 Session 装着（service_role と共存期）

**目的**: アプリを壊さずに Supabase Session 機構を入れる。既存の service_role 経路と並行稼働。

**Stage 2 pivot の反映**: Stage 2 の新フロー（`signInAnonymously` + `validate_student_session` + `refreshSession`）で得た Session を supabase-js が自動で使う。`setSession` の手動装着は不要。

**作業**:
- [ ] `authStore.ts` に Supabase Session の有無チェックと復帰処理を追加
- [ ] ログインフローを Stage 2 の新フローに切替（生徒のみ先行、先生は Stage 4 まで localStorage SHA-256）
- [ ] `useLiveGame` 等は既存の `supabase` client をそのまま使う（auth 状態で Authorization ヘッダーが自動付与される）
- [ ] リロード時の自動復帰は supabase-js 標準（persistSession デフォルト）で成立する想定。要検証
- [ ] `VITE_DOJO_SUPABASE_KEY` はまだ service_role のまま（共存期、Stage 8 で anon に切替）

**検証**: 
- ログイン後、ブラウザの DevTools で `localStorage` に JWT が保存されていることを確認
- Network タブで Supabase へのリクエストの Authorization ヘッダーに JWT が付いていることを確認
- 対局・検討・ログアウト・再ログインが全て動くこと
- E2E テスト再実行

**想定時間**: 半日〜1日

---

## Stage 4: `submit_move` を JWT 検証ベースに改修

**目的**: 着手のなりすまし問題を解消する（Phase 0 最重要セキュリティ修正）

### 先生認証切替のリスク管理（着手前に必読）
Stage 4 で先生（三村さん自身）の認証を localStorage SHA-256 → Supabase Session に切り替える。**ここにバグがあると三村さん自身がログインできず、当日のレッスンが飛ぶ**。以下を準備してから着手：

1. **dual-auth 窓**: localStorage SHA-256 と Supabase Session を**両方並行稼働**させる期間を設ける。Stage 4 で先生認証を Supabase に追加するが、localStorage 経路は Stage 8 まで削除しない
2. **切替はレッスン無い日**: Anonymous/Hook 再有効化、先生認証本番切替は **日曜夜 or 祝日昼間** など、翌日にレッスンが無い時間帯で実施
3. **ロールバックコマンド事前準備**: 以下を実行前にターミナルにコピペできる状態で用意
   ```bash
   # Hook OFF ロールバック
   curl -X PATCH "https://api.supabase.com/v1/projects/yzsyrtesydpulctjgdog/config/auth" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -H "User-Agent: supabase-cli/1.0.0" \
     -d '{"hook_custom_access_token_enabled": false}'
   ```
4. **validate_teacher_session Edge Function の設計**: 先生パスワード照合を Edge Function 内で完結。secret は Edge Function 環境変数（TEACHER_PW_HASH）に投入

**作業**:
- [ ] `validate_teacher_session` Edge Function 新設（bcrypt で TEACHER_PW_HASH 照合 → 成功なら `app_role: 'teacher'`, `teacher_id` を user_metadata に書き込み）
- [ ] 先生ログインフローに Supabase Session 確立を追加（localStorage SHA-256 と並行、両方成功で認可）
- [ ] `submit_move` が Authorization ヘッダーの JWT を検証するよう改修
- [ ] `caller_identity` を body から取るのをやめ、JWT claim の `student_id` / `teacher_id` から取得
- [ ] 先生の代打ち（`app_role === 'teacher'` なら任意の `caller_identity` を受け付ける）の扱いを明示
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
- [ ] **anon user 清掃ポリシー策定**: 共用 Supabase の `auth.users` に生徒ログインごとに anon user が溜まる（1年で数千件規模）。dojo-app の `auth.users` 参照クエリに性能影響の可能性
  - pg_cron で「30日以上未使用の anon user を削除」する定期ジョブを設置
  - `delete from auth.users where is_anonymous = true and last_sign_in_at < now() - interval '30 days'`
  - migration として commit、本番で dry-run → 件数確認 → 本番有効化

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
