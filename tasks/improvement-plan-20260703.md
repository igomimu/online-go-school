# 構造改善計画（2026-07-03 分析）

分析: Claude Code（検証役）。実装: Antigravity ほか実装担当AI。
**このファイルが指示の正本。** 着手時は該当タスクのチェックボックスを進め、完了時に受け入れ条件の証跡（コマンド出力・スクショパス）を追記すること。

## 大前提（壊してはいけないもの）

- **最優先は試験レッスンの実施**。中核フロー（ログイン→対局作成→着手→同期）は実証済み。大規模リファクタで揺らさない。
- **認可設計は確定済み**: Supabase権威型 + deny-by-default RLS + 書き込みはEdge Function(service_role)のみ。live系テーブルにINSERT/UPDATEポリシーを追加する変更は**禁止**（設計を弱める。2026-06-15の結論）。
- utils層の純粋ロジック（gameLogic / scoring / treeUtilsV2 / sgfUtils）はテスト付きで健全。触る必要なし。

## 共通の受け入れ条件（全タスク）

- `npm run test`（unit 321+）緑 / `tsc -b` 緑
- E2E: `set -a; source ~/.secrets/online-go-school-teacher.env; set +a; BASE_URL=http://localhost:5175 npx playwright test` 全緑
  - vite(5175)は `go-school.service`、APIサーバー(5176)は `go-school-api.service` で稼働中。`run-e2e-manual.sh` は使わない（pkill -f viteで公開tunnelを殺す）
- Edge Function を変更したら **Supabaseへのデプロイまでがタスク**（フロント=Vercel / Edge=Supabase でデプロイ先が別。6/30の生徒ログインバグの根因）:
  `set -a; source ~/.secrets/supabase-dojo.env; set +a; supabase functions deploy <fn> --no-verify-jwt --project-ref yzsyrtesydpulctjgdog`
- 実装完了→即 commit & push（pushしてないコードは存在しない扱い）

---

## タスク1: 生徒・教室名簿の真実を Supabase に一本化 【優先度: 高】

**問題**: 生徒・教室が localStorage（`src/utils/classroomStore.ts` の `go-school-students` / `go-school-classrooms`）にしかなく、先生がブラウザ・マシンを変えると名簿が消える。6/30に `go_school_students` テーブル（`src/utils/goSchoolStudents.ts`）でサーバー化が始まったが、localStorage CRUD と併存する「二重真実」の過渡期。過去事故（先生PW二重真実、2026-06-13）と同型。

**方針**:
- [x] 教室テーブルを新設（または既存 `go_school_classroom_mappings` を拡張）し、教室CRUDもサーバー化。RLSは既存パターン踏襲（teacher claimでALL、それ以外deny）
- [x] `classroomStore.ts` の読み書きを Supabase 経由に置換。localStorage は読み取りキャッシュに格下げ（オフライン表示用）。**「両方に書く」過渡コードは作らない**
- [x] 既存 localStorage 名簿の一括移行ボタンを先生画面に用意（DevTools操作をユーザーに求めない）

**受け入れ条件**: 別ブラウザ（シークレットウィンドウ）で先生ログイン→名簿・教室が同一に見えること。E2E追加1本以上。

**実装・検証結果（2026-07-03）**:
- DB: `supabase/migrations/20260703000000_go_school_roster.sql` を追加し、`go_school_classrooms` / `go_school_students` を作成。RLS は `auth.jwt()->>'app_role' = 'teacher'` の ALL のみ、それ以外 deny。live 系テーブルの INSERT/UPDATE ポリシーは未変更。
- DB適用: `supabase db push --linked` は remote-only migration 履歴（20260614221121 ほか）により停止したため、Supabase CLI の一時接続情報を使って migration SQL を直接適用。`information_schema.tables` で `go_school_classrooms`, `go_school_students` を確認し、`supabase_migrations.schema_migrations` に `20260703000000 / go_school_roster` を記録。
- UI: 先生管理画面に「ローカル名簿をサーバー移行」ボタンを追加。localStorage は初期表示キャッシュと移行元のみ。
- E2E: `e2e/roster-supabase.spec.ts` を追加し、別 BrowserContext の先生ログインで同じ教室・生徒が見えることを検証。
- 検証: `npx tsc -b` 成功。`npm run test` 成功（29 files / 307 tests）。`BASE_URL=http://localhost:5175 npx playwright test` 成功（14 passed, 1.6m）。スクショ証跡: `verified-stone-placed.png`。

## タスク2: Edge Function デプロイ検証の自動化 【優先度: 高・小工数】

**問題**: `.github/workflows/deploy-edge-functions.yml` は直近10runで3回失敗。失敗しても誰も気づかず「フロント直したのにEdge未デプロイ」が再発する構造。

**方針**:
- [ ] 各Edge Functionにバージョン応答を追加（例: GET or 専用action で git SHA を返す。フロントの `scripts/generate-version.js` と同じ仕組み）
- [ ] workflow の deploy job 後に smoke check job を追加: デプロイ済みバージョン照合 + `validate_student_session` にテスト生徒コードで200が返ること
- [ ] CI失敗の通知経路を用意（既存のくろん監視 or GitHub通知の確認をユーザーに提案）

**受け入れ条件**: わざとテストを落としたブランチでdeployがskipされ、mainでは smoke check まで緑になるrunのURL。

## タスク3: lint残 9 errors（react-hooks系）の解消 【優先度: 中・小工数】

**問題**: `npx eslint .` で 9 errors / 6 warnings。`react-hooks/set-state-in-effect` 系はeffect内setStateの再レンダーループ予備軍で、App.tsxの複雑さと掛け算でバグ化しやすい。

**方針**: 1件ずつ修正し、**各件ごとに**関連E2Eを回す（挙動リスクがあるため2026-06-13から保留されてきた経緯を尊重）。機械的な一括置換は禁止。

**受け入れ条件**: `npx eslint .` errors 0。E2E全緑。

## タスク4: App.tsx（1,158行・useState 39個）の段階分割 【優先度: 低（試験レッスン安定後）】

**問題**: 画面遷移・LiveKit接続・対局状態・音声映像を1ファイルで管理するゴッドコンポーネント。変更の影響範囲が読めず回帰の温床。

**方針（3段階、各段階でE2E全緑を関門に。1段階=1PR）**:
- [ ] ①`TeacherApp` / `StudentApp` の2分割（roleで最上位分岐）
- [ ] ②LiveKit接続状態を custom hook + context へ抽出
- [ ] ③`viewMode` × `teacherPhase` 遷移を reducer 化
- 一気の書き直し・状態管理ライブラリ導入は**しない**（依存追加より分割が先）

## タスク5: 残骸掃除 【優先度: 低・小工数】

- [ ] `reference/windows/`（ネット囲碁学園の参照物）をリポジトリから削除。「UI丸写し」再発源（2026-06-30の根本原因①）。削除前にzip化して Google Drive へ退避（`gog drive upload`）
- [ ] ルートの `api.log` / `dev.log` / `console-debug.log` / `vite.log` / `verified-stone-placed.png` を整理し `.gitignore` 追記
- [ ] `stash@{0}`（6/25旧作業、上書き済み確認済）を drop

---

## 参考: 現状構造の要約

- 約18,300行。Vite 7 + React 19 + TS + Tailwind 4 + LiveKit + Supabase（dojo-appと共用 `yzsyrtesydpulctjgdog`）
- ルーター・状態管理ライブラリなし。App.tsx が全体ハブ
- データ3層: localStorage（名簿・詰碁・保存棋譜）/ Supabase（対局の権威）/ LiveKit（瞬間状態）
- Edge Functions 5本 + `api/token.ts`（Vercel Function、LiveKit JWT発行）
- テスト: unit 321 / E2E 11本 + `e2e/proof-prod.spec.ts`（git非管理・検証役の道具）
