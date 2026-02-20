# online-go-school — オンライン囲碁教室

## 基本情報
- **技術**: Vite + React + TypeScript + Agora RTC + PeerJS + Tailwind
- **状態**: 開発中（中〜長期）
- **開発サーバー**: LEGION (`npm run dev -- --host`)、ポート5174
- **確認**: YOGAProブラウザから `http://100.120.126.60:5174/`

## 概要
リアルタイムで先生と生徒が対局・検討できるオンライン囲碁教室プラットフォーム。

## アーキテクチャ
- Role: TEACHER (ホスト) / STUDENT (ゲスト)
- PeerJS: データ通信。TeacherのPeerIDをルームIDとして使用
- Agora: ビデオ通話。同じPeerIDをチャンネル名に使用
- State Sync: Teacherの操作 (BOARD_UPDATE) を全Studentにブロードキャスト
- No Backend: クライアントサイドのみで完結

## 主要ファイル
```
src/
├── components/GoBoard.tsx           # SVG碁盤
├── components/video/VideoPanel.tsx  # ビデオ通話UI
├── components/video/useAgoraClient.ts
├── utils/classroomPeer.ts           # PeerJSラッパー
├── utils/gameLogic.ts               # 囲碁ルール
├── utils/treeUtilsV2.ts             # 棋譜ツリー（分岐対応）
└── App.tsx
```

## 完了
- Teacher/Student ロール切り替え、ビデオ/音声通話(Agora)
- 囲碁盤UI (SVG)、P2P盤面同期 (PeerJS)、取り上げロジック
- SGFユーティリティ（分岐対応）

## 未実装
- SGFインポート/エクスポートUI、KataGo連携、認証、対局時計

## 環境変数
- `VITE_AGORA_APP_ID=0cead207dab34dd188322c1725076f13`

## 既知の問題
- YOGAProからのアクセスで真っ白画面（Vite HMR WebSocket問題の可能性）
