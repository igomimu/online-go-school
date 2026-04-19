# AI Context & Development Guide

このドキュメントは、AIアシスタント（Claude Code / Antigravity）が本プロジェクト `online-go-school`（三村囲碁オンライン）を理解し、効率的に開発支援を行うためのコンテキスト情報です。

## プロジェクト概要
- **名称**: 三村囲碁オンライン（online-go-school）
- **目的**: リアルタイムで先生と生徒が対局・検討できるオンライン囲碁教室プラットフォーム
- **特徴**: LiveKit による映像音声通信 + Supabase 権威型の対局状態管理

## 技術スタック
| カテゴリ | 技術 | 詳細 |
| :--- | :--- | :--- |
| **Framework** | Vite 7 + React 19 | TypeScript 5.9 |
| **Styling** | Tailwind CSS 4 | utility-first + Lucide icons |
| **Realtime Media+Data** | LiveKit | `livekit-client` + `@livekit/components-react` |
| **Server Token** | LiveKit Server SDK | Vercel Function `api/token.ts` |
| **Game Authority** | Supabase | `live_games` / `live_moves` + Realtime |
| **AI分析** | KataGo (LEGIONサーバー) | `src/utils/katagoClient.ts` |
| **Test** | Vitest + Playwright | unit + E2E |
| **Deploy** | Vercel | `vercel.json` 配置済み |

**撤去済み技術**: Agora RTC, PeerJS（2026-04 に LiveKit + Supabase に全面移行）

## ディレクトリ構造と主要ファイル
```
src/
├── App.tsx                       # メインコンポーネント。レイアウト・状態管理統合
├── components/
│   ├── GoBoard.tsx               # SVG描画の碁盤コンポーネント
│   ├── GameBoard.tsx             # 対局盤
│   ├── LectureBoard.tsx          # 講義盤
│   ├── ReviewBoard.tsx           # 検討盤
│   ├── ProblemBoard.tsx          # 詰碁盤
│   ├── AiAnalysisPanel.tsx       # KataGo分析表示
│   ├── WinRateGraph.tsx          # 勝率推移グラフ
│   ├── VideoTiles.tsx            # LiveKitビデオタイル
│   ├── MediaControlPanel.tsx     # 音声/映像ON/OFF
│   ├── RecordingControls.tsx     # 画面録画
│   ├── LoginScreen.tsx / ClassroomSelector.tsx / Lobby.tsx
│   ├── StudentManager.tsx / SavedGameList.tsx / ProblemImporter.tsx
│   └── teacher/
│       ├── TeacherDashboard.tsx
│       ├── TeacherToolbar.tsx
│       ├── ClassroomManager.tsx / ClassroomSettingsDialog.tsx
│       ├── StudentTable.tsx / StudentLinkGenerator.tsx
│       ├── AutoPairingDialog.tsx
│       ├── GameObserverPanel.tsx
│       ├── ChatPanel.tsx
│       ├── BoardThumbnailGrid.tsx
│       └── RoomTabs.tsx
├── hooks/
│   ├── useLiveGame.ts            # 単一対局 Supabase フック
│   ├── useLiveGameList.ts        # 対局一覧 Supabase フック
│   ├── useGameManager.ts / useGameView.ts
│   ├── useGameClock.ts           # 対局時計
│   ├── useAiAnalysis.ts / useAutoReplay.ts
│   ├── useChat.ts / useNotificationSound.ts
│   ├── useScreenRecorder.ts / useProblemSession.ts
├── utils/
│   ├── classroomLiveKit.ts       # LiveKit Roomラッパー（本プロジェクトの通信中核）
│   ├── liveGameApi.ts            # Supabase対局API（権威データアクセス層）
│   ├── livekitToken.ts           # フロント側トークン取得
│   ├── authStore.ts              # localStorage認証
│   ├── gameLogic.ts              # 囲碁ルール（取り上げ等）
│   ├── scoring.ts                # スコアリング
│   ├── handicapStones.ts         # 置石配置
│   ├── sgfUtils.ts / sgfExport.ts
│   ├── treeUtilsV2.ts            # 棋譜ツリー（分岐対応）
│   ├── katagoClient.ts           # KataGoサーバー連携
│   ├── savedGames.ts / problemStore.ts
│   ├── igcImport.ts              # IGC形式インポート
│   ├── classroomStore.ts / identityUtils.ts / dojoSync.ts
│   └── audioControl.ts / videoControl.ts
└── types/
    ├── classroom.ts / game.ts / chat.ts / problem.ts / ai.ts

api/
└── token.ts                      # Vercel Function: LiveKit JWT発行

e2e/
├── multi-user-game.spec.ts
├── multi-student-game.spec.ts
├── reconnect.spec.ts
└── helpers/                       # setup, teacher-actions, student-actions, test-data
```

## アーキテクチャ・設計思想

### 1. Role
- `TEACHER`（ホスト）: 教室を作る、生徒を招待する、対局を作成・操作する、代打ちする、観戦する
- `STUDENT`（ゲスト）: 教室に入る、対局する、講義を受ける、検討に参加する

### 2. 通信レイヤー（二本立て）
- **LiveKit（リアルタイム・低レイテンシ）**
  - 映像、音声、カーソル、描画、チャット、Board 更新通知
  - `classroomLiveKit.ts` が Room ラッパー。データメッセージは `ClassroomMessage` 型で型付け
- **Supabase（権威データ）**
  - 対局の着手、時計、スコアリング、死石判定、結果 → `live_games` / `live_moves` + Realtime
  - `liveGameApi.ts` で CRUD、`useLiveGame.ts` でフックとして使用
  - **「Supabase row が真実」**。旧 `BOARD_UPDATE` ブロードキャスト方式は撤去済み

### 3. 認証
- 独自 localStorage ベース（`authStore.ts`）
- 生徒: studentId + classroomId、先生側が名前を解決
- 先生: パスワード認証、リセット機能あり
- Supabase Auth は現状使っていない

### 4. トークン発行
- LiveKit 参加には JWT が必要 → Vercel Function `api/token.ts` で `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` を使って発行
- 開発環境では `VITE_LIVEKIT_API_KEY` / `VITE_LIVEKIT_API_SECRET` を使ってフロント側で発行する経路もある（`livekitToken.ts`）

### 5. AI分析
- LEGIONで動いている KataGo サーバー（`VITE_KATAGO_SERVER_URL`）に HTTP 経由で送り、勝率・最善手を取得
- `katagoClient.ts` と `useAiAnalysis.ts` が担当

## 開発ルール・注意点
- **環境変数**: `.env` で管理、`VITE_` プレフィックス必須。詳細は `.claude/CLAUDE.md`
- **Supabase プロジェクト**: dojo-app と共用。安易にスキーマを変えない（dojo-app を壊す可能性）
- **Lint**: ESLint + TypeScript。`npm run lint` で確認
- **Test**: `npm test`（unit）, `npm run test:e2e`（Playwright）
- **Dev server の実行場所**: LEGION（port 5175）。YOGAPro で動かさない
- **dev server の稼働ディレクトリ確認**: 挙動がコード編集と合わない時は `pgrep -fa vite` で稼働パスを見る

## 今後のロードマップ
1. **実運用デビュー**: 既存生徒1人で試験レッスン → 穴埋め
2. **dojo-app 導線**: 生徒向けアプリから「オンラインレッスン参加」を起動できるようにする
3. **pokekata 連携**: Pocket KataGo で並べた局面をレッスンに持ち込む（未設計）
4. **Vercel 本番化**: 現状の Cloudflare Tunnel 直接公開から Vercel デプロイへ移行
