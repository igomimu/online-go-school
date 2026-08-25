# online-go-school — 三村囲碁オンライン

## 基本情報
- **技術**: Vite 7 + React 19 + TypeScript 5.9 + Tailwind 4 + LiveKit + Supabase
- **状態**: ✅ 中核フロー（ログイン→対局作成→着手→同期）が実認証チェーンで成立（2026-06-13 根治、E2E 11/11 本物の緑）。断絶3点（生徒ログインのレース / authStore の握りつぶしフォールバック / 先生PWの二重真実）を修正済み。先生PWは `~/.secrets/online-go-school-teacher.env`（サーバー側 `TEACHER_PASSWORD_HASH` と整合、E2E は `TEST_TEACHER_PASSWORD` で注入）。✅ Vercel再公開完了(2026-06-13、`online.mimura15.jp`→Vercel production、バンドルにsecret無し検証済)。残: 実生徒との試験レッスン。詳細は `PROGRESS.md` と auto-memory `projects/online-go-school.md`。
- **本番**: `https://online.mimura15.jp/` は **Vercel Production**（DNS CNAME→`cname.vercel-dns.com`、レスポンスヘッダー`server: Vercel`で確認済み 2026-07-23）。GitHub `igomimu/online-go-school` の `main` へのpushで**自動デプロイ**される。旧`.cloudflared/config.yml`に残る`online.mimura15.jp→localhost:5175`のingress設定は2026-06-13のVercel切替以前の残骸で、現在DNSがVercelを指しているため到達しない（削除は未実施、混同注意）。
- **Dev server**: LEGION の `/home/mimura/projects/online-go-school` で `npm run dev`（port 5175・host true）。**これは開発専用であり本番の配信元ではない**。LEGION側を編集しただけでは本番に反映されない、`git push`してVercelの自動デプロイを待つ必要がある。
- **YOGAProから開発版を見る場合**: `ssh -L 5175:localhost:5175 legion` 後に `http://localhost:5175`

## 概要
リアルタイムで先生と生徒が対局・検討できるオンライン囲碁教室プラットフォーム。
LiveKit で映像音声＋データ通信、Supabase で対局状態を権威的に管理。

## アーキテクチャ
- **Role**: `TEACHER`（ホスト） / `STUDENT`（ゲスト）
- **Realtime transport**: 実装は2つあり、環境変数 `VITE_RTC_PROVIDER` / `RTC_PROVIDER` で選ぶ（既定 `livekit`）
  - 映像音声、カーソル、描画、チャット、Board 更新メッセージをすべてこの経路で送受信
  - `src/utils/classroomRtc.ts` … 型と `ClassroomRtc` インターフェース（アプリ側はこれだけを見る）
  - `src/utils/classroomLiveKit.ts` … LiveKit Cloud 実装
  - `src/utils/classroomRealtimeKit.ts` … Cloudflare RealtimeKit 実装
  - `src/utils/rtcProvider.ts` … どちらを作るか決める
  - **RealtimeKit で LiveKit と違うところ**（2026-08-26 実測）:
    - **自分の送信が自分にも届く**。返事を返す作りだと無限に往復するので送り主を見て捨てる
    - payload は平たいオブジェクトのみ → JSON 文字列に詰める（128KB まで到達を確認）
    - 送信は既定で毎秒5回まで、超過は例外 → 入室時に 60回/秒へ引き上げ
    - SDK の綴りが `noiseSupression`（p が1つ）。正しい綴りで書くと雑音抑制が効かない
    - **誰も居ない meeting の `active-session` は 404**。例外にすると門番が fail-open で素通しになる
- **Game authority**: Supabase 権威型
  - `live_games` / `live_moves` テーブル＋ Realtime で着手・時計・スコアリングを同期
  - `src/utils/liveGameApi.ts`, `src/hooks/useLiveGame.ts` が中核
  - メッセージ同期（旧 `BOARD_UPDATE` ブロードキャスト方式）は撤去され、Supabase row が真実
- **Token発行**: Vercel Function `api/token.ts`
  - 認可（Supabase JWT / dojo-app 一時トークン）と先生の在室確認はここが持つ
  - LiveKit のときは `livekit-server-sdk` で JWT を署名
  - RealtimeKit のときは `api/realtimeKit.ts` 経由で meeting を用意して participant を足し、返ってきた authToken を渡す
  - 教室 ↔ meeting の対応は `go_school_classrooms.realtime_meeting_id`（無ければ初回の入室時に作る）
- **Auth**: 独自の localStorage ベース（`src/utils/authStore.ts`）
  - 生徒: `studentId + classroomId` でログイン
  - 先生: パスワード認証＋リセット機能あり

## Supabase
- **共用プロジェクト**: dojo-app と同じ Supabase プロジェクト（`VITE_DOJO_SUPABASE_URL` / `VITE_DOJO_SUPABASE_KEY`）
- ref: `yzsyrtesydpulctjgdog`（dojo@1kawa15.com アカウント配下）

## 主要ファイル
```
src/
├── App.tsx                           # 統合レイアウト・状態管理
├── components/
│   ├── GoBoard.tsx                   # SVG碁盤
│   ├── GameBoard.tsx / LectureBoard.tsx / ReviewBoard.tsx / ProblemBoard.tsx
│   ├── AiAnalysisPanel.tsx           # KataGo分析UI
│   ├── VideoTiles.tsx                # LiveKitビデオタイル
│   ├── MediaControlPanel.tsx / AudioControls.tsx
│   ├── RecordingControls.tsx         # 画面録画
│   ├── LoginScreen.tsx / ClassroomSelector.tsx / Lobby.tsx
│   ├── StudentManager.tsx / ProblemImporter.tsx / SavedGameList.tsx
│   └── teacher/                      # TeacherDashboard, ClassroomManager, StudentTable,
│                                     # AutoPairingDialog, GameObserverPanel, ChatPanel 他
├── hooks/
│   ├── useLiveGame.ts / useLiveGameList.ts   # Supabase権威型対局フック
│   ├── useGameClock.ts                       # 対局時計
│   ├── useAiAnalysis.ts / useChat.ts
│   └── useScreenRecorder.ts / useProblemSession.ts
├── utils/
│   ├── classroomLiveKit.ts           # LiveKit Roomラッパー
│   ├── liveGameApi.ts                # Supabase対局API
│   ├── livekitToken.ts               # フロント側トークン取得
│   ├── authStore.ts                  # localStorage認証
│   ├── gameLogic.ts / scoring.ts / handicapStones.ts / sgfUtils.ts / sgfExport.ts
│   ├── treeUtilsV2.ts                # 棋譜ツリー（分岐対応）
│   ├── katagoClient.ts               # LEGIONのKataGoサーバー連携
│   ├── savedGames.ts / problemStore.ts
│   ├── igcImport.ts                  # IGC形式インポート
│   ├── classroomStore.ts / identityUtils.ts / dojoSync.ts
│   └── audioControl.ts / videoControl.ts
└── types/
    ├── classroom.ts / game.ts / chat.ts / problem.ts / ai.ts
api/token.ts                          # Vercel Function（LiveKitトークン発行）
e2e/                                  # Playwright E2E（multi-user, multi-student, reconnect）
```

## 実装済み機能
- Teacher/Student ロール切り替え
- LiveKit ビデオ・音声通話＋データメッセージ
- 囲碁盤UI（SVG、分岐棋譜、描画）
- Supabase権威型対局（着手・時計・スコアリング同期）
- 先生代打ち、複数生徒同時観戦、自動ペアリング
- KataGo AI分析（LEGIONのKataGoサーバー経由、勝率グラフ）
- SGFインポート/エクスポート、IGC形式インポート
- 対局時計、チャット、画面録画
- 詰碁問題、保存棋譜一覧
- 生徒ID+教室IDログイン、先生パスワードリセット
- Playwright E2E（multi-user-game, multi-student-game, reconnect）

## 未実装・未完了
- 実生徒での本番レッスン運用（技術的には動く、実運用デビュー前）
- dojo-app からオンラインレッスン参加への導線
- pokekata との連携（Pocket KataGo で並べた局面をレッスンに持ち込む等、未設計）

## 環境変数（.env）
- `VITE_RTC_PROVIDER`: `livekit`（既定） / `realtimekit`。**未設定なら LiveKit のまま動く**
- `VITE_LIVEKIT_URL`: LiveKit サーバー URL（例: `ws://172.25.188.94:7880`）。RealtimeKit では不要
- `VITE_LIVEKIT_API_KEY` / `VITE_LIVEKIT_API_SECRET`: 開発用フロント直発行用
- `VITE_DOJO_SUPABASE_URL` / `VITE_DOJO_SUPABASE_KEY`: dojo Supabase接続
- `VITE_KATAGO_SERVER_URL`: LEGION KataGoサーバー（例: `http://localhost:2718`）
- Vercel デプロイ時のサーバー側:
  - `RTC_PROVIDER`（フロントの `VITE_RTC_PROVIDER` と必ず揃える）
  - LiveKit のとき: `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL`
  - RealtimeKit のとき: `CLOUDFLARE_ACCOUNT_ID` / `REALTIMEKIT_APP_ID` / `CLOUDFLARE_REALTIME_TOKEN`
- ローカル開発では `~/.secrets/cloudflare-realtime.env` を `scripts/dev-api-server.ts` が読む
  （`RTC_PROVIDER=realtimekit npx tsx scripts/dev-api-server.ts` と
  `VITE_RTC_PROVIDER=realtimekit npx vite` の2つを立てて検証する）

## UI/Design Standards
→ 詳細は `~/.claude/CLAUDE.md` の「UI/Design Standards」セクションを参照
- **Anti-AI Design**: グラデ・グロー・glassmorphism禁止、左揃え基調、装飾より情報
- **統一デザイン言語**: Tailwind、Inter + Noto Sans JP、Lucide icons
- **primary色**: indigo-600（教育、落ち着いた知性）
- **参考**: Linear, Vercel Dashboard

## デプロイ構成
- **本番は Vercel**（project: `online-go-school`, `prj_y5WHUn1KXyNoj7IDf8gsQRVgAZXT`, org `team_7JqT0ZVMnu8j5zvqb3OOpknH`、Vercel account `igomimu`）。`main`へのpushで自動デプロイ。手動デプロイ/env反映は `npx vercel deploy --prod`（要`npx vercel whoami`で認証確認）
- 本番用の環境変数は **Vercelプロジェクト設定側に個別追加が必要**（`.env`はローカルdevのみ、Vercelには自動反映されない）。追加は `npx vercel env add <NAME> production`
- KataGo連携: `api/katago-analyze.ts`がサーバーサイドで`KATAGO_API_KEY`(pokekataのサービス間キー)を使いpokekataへ中継。本番では`KATAGO_SERVER_URL=https://pokekata.mimura15.jp`（ローカルdevはデフォルト`http://localhost:5177`のまま、LEGION同居のため到達可）
- `vercel.json` + `api/token.ts`/`api/katago-analyze.ts` により Vercel Functions デプロイ構成は整備済み

## トラブルシュート
- dev server の挙動が編集内容と一致しない → `pgrep -fa vite` で稼働ディレクトリを確認
- **本番の反映確認は `curl -sD- -o /dev/null https://online.mimura15.jp/ | grep -i vercel` でVercel配信であることをまず確認**。LEGION側を編集しても本番URLには直接反映されない（2026-07-23、この思い込みで一度誤診断した教訓）
- 2026-04-13 インシデント: 旧 `/home/mimura/online-go-school/`（git非管理）の dev server が走っていたため編集が反映されなかった。現在は削除済み、正規は `/home/mimura/projects/online-go-school/`（YOGAPro/Antigravity側に同名の同期用ディレクトリが再出現することがあるが、これはgit管理外のデザイン作業コピーであり本番/開発いずれの配信元でもない）
- LiveKit 接続不可 → `VITE_LIVEKIT_URL` が WSL2 の IP 直打ちなので、LEGION 再起動時に IP が変わると繋がらない（要見直し）
