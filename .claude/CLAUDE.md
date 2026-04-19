# online-go-school — 三村囲碁オンライン

## 基本情報
- **技術**: Vite 7 + React 19 + TypeScript 5.9 + Tailwind 4 + LiveKit + Supabase
- **状態**: 開発中（実運用デビュー前、コード側は本番投入可能レベルまで到達）
- **Dev server**: LEGION で `npm run dev`（vite.config.ts で port 5175・host true 設定済み）
- **公開URL**: `https://online.mimura15.jp/`（Cloudflare Tunnel 経由で LEGION の dev server にルーティング）
- **YOGAProから見る場合**: 公開URL、または `ssh -L 5175:localhost:5175 legion`

## 概要
リアルタイムで先生と生徒が対局・検討できるオンライン囲碁教室プラットフォーム。
LiveKit で映像音声＋データ通信、Supabase で対局状態を権威的に管理。

## アーキテクチャ
- **Role**: `TEACHER`（ホスト） / `STUDENT`（ゲスト）
- **Realtime transport**: LiveKit 一本化（旧 Agora + PeerJS は撤去済み）
  - 映像音声、カーソル、描画、チャット、Board 更新メッセージをすべて LiveKit Room 経由で送受信
  - `src/utils/classroomLiveKit.ts` が Room のラッパー
- **Game authority**: Supabase 権威型
  - `live_games` / `live_moves` テーブル＋ Realtime で着手・時計・スコアリングを同期
  - `src/utils/liveGameApi.ts`, `src/hooks/useLiveGame.ts` が中核
  - メッセージ同期（旧 `BOARD_UPDATE` ブロードキャスト方式）は撤去され、Supabase row が真実
- **Token発行**: Vercel Function `api/token.ts`（`livekit-server-sdk` で LiveKit JWT 発行）
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
- `VITE_LIVEKIT_URL`: LiveKit サーバー URL（例: `ws://172.25.188.94:7880`）
- `VITE_LIVEKIT_API_KEY` / `VITE_LIVEKIT_API_SECRET`: 開発用フロント直発行用
- `VITE_DOJO_SUPABASE_URL` / `VITE_DOJO_SUPABASE_KEY`: dojo Supabase接続
- `VITE_KATAGO_SERVER_URL`: LEGION KataGoサーバー（例: `http://localhost:2718`）
- Vercel デプロイ時のサーバー側: `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`

## UI/Design Standards
→ 詳細は `~/.claude/CLAUDE.md` の「UI/Design Standards」セクションを参照
- **Anti-AI Design**: グラデ・グロー・glassmorphism禁止、左揃え基調、装飾より情報
- **統一デザイン言語**: Tailwind、Inter + Noto Sans JP、Lucide icons
- **primary色**: indigo-600（教育、落ち着いた知性）
- **参考**: Linear, Vercel Dashboard

## デプロイ構成
- `vercel.json` + `api/token.ts` により Vercel Functions デプロイ構成は整備済み
- 現在の公開は Cloudflare Tunnel 経由で LEGION dev server を直接公開（本番用途ならVercel化が自然）

## トラブルシュート
- dev server の挙動が編集内容と一致しない → `pgrep -fa vite` で稼働ディレクトリを確認
- 2026-04-13 インシデント: 旧 `/home/mimura/online-go-school/`（git非管理）の dev server が走っていたため編集が反映されなかった。現在は削除済み、正規は `/home/mimura/projects/online-go-school/`
- LiveKit 接続不可 → `VITE_LIVEKIT_URL` が WSL2 の IP 直打ちなので、LEGION 再起動時に IP が変わると繋がらない（要見直し）
