# AI Context & Development Guide

このドキュメントは、AIアシスタント (Claude Code / Antigravity) が本プロジェクト `online-go-school` を理解し、効率的に開発支援を行うためのコンテキスト情報です。

## プロジェクト概要
- **名称**: Online Go School
- **目的**: リアルタイムで先生と生徒が対局・検討できるオンライン囲碁教室プラットフォーム。
- **特徴**: ビデオ通話機能 (Agora) と 碁盤同期機能 (PeerJS) を併用。

## 技術スタック
| カテゴリ | 技術 | 詳細/バージョン |
| :--- | :--- | :--- |
| **Framework** | Vite + React | TypeScriptベース |
| **Realtime** | PeerJS | 碁盤の同期、カーソル共有、コマンド送信 |
| **Video/Audio** | Agora RTC SDK (ng) | リアルタイムビデオ通話 (`useAgoraClient`) |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Icons** | Lucide React | UIアイコン |

## ディレクトリ構造と主要ファイル
```
src/
├── components/
│   ├── GoBoard.tsx       # SVG描画の碁盤コンポーネント。ロジックは最小限。
│   └── video/            # [New] Agoraビデオ機能関連
│       ├── VideoPanel.tsx      # ビデオ通話UI
│       └── useAgoraClient.ts   # Agoraクライアントフック
├── utils/
│   ├── classroomPeer.ts  # PeerJSラッパー。P2P接続とデータ送受信管理。
│   ├── gameLogic.ts      # 囲碁のルールロジック (石を取る判定など)。
│   └── treeUtilsV2.ts    # 棋譜ツリー管理 (分岐、手番)。
└── App.tsx               # メインコンポーネント。レイアウトと状態管理の統合。
```

## アーキテクチャ・設計思想
1.  **Role**: `TEACHER` (ホスト) と `STUDENT` (ゲスト) の2つの役割がある。
2.  **Connection**: 
    - **PeerJS**: データ通信用。TeacherのPeerIDをルームIDとして使用。
    - **Agora**: ビデオ通話用。同じくTeacherのPeerID (または指定ID) をチャンネル名として使用。
3.  **State Sync**: Teacherが行った操作 (`BOARD_UPDATE`) を全Studentにブロードキャストして同期する。
4.  **No Backend**: 現在はViteのクライアントサイドのみで完結。トークン生成などは `import.meta.env` の設定値を利用。

## 開発ルール・注意点
- **環境変数**: `.env` で管理。`VITE_` プレフィックス必須。
  - `VITE_AGORA_APP_ID`: 必須。
- **Lint**: ESLint + TypeScript。厳格な型チェックを維持すること。
- **Video**: `agora-rtc-sdk-ng` を使用。`agora-rtc-react` は依存にあるが、現在の実装は `sdk-ng` を直接ラップしている。

## 今後のロードマップ
1.  **AI先生**: KataGoをバックエンド (またはWASM) で動かし、検討機能を追加する。
2.  **認証**: Firebase/Supabase等によるユーザー管理（現在はID入力のみ）。
3.  **対局時計**: 持ち時間管理の実装。
