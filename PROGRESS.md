# 開発進捗記録 - online-go-school

## 📅 最終更新: 2026-02-03

## ✅ 完了した作業

### 1. 環境設定
- [x] `.env` ファイル作成
  - Agora App ID設定: `0cead207dab34dd188322c1725076f13`
  - KataGo設定（後回し）
- [x] `.gitignore` 更新（.envを除外）
- [x] `vite.config.ts` 更新（HMR設定追加）

### 2. 実装確認
- [x] 既存コードの確認
  - `GoBoard.tsx`: 囲碁盤UI実装済み
  - `VideoPanel.tsx`: Agoraビデオ通話UI実装済み
  - `useAgoraClient.ts`: Agoraクライアント実装済み
  - `classroomPeer.ts`: PeerJS P2P通信実装済み
  - `sgfUtils.ts`: SGF処理（パース・生成）実装済み
  - `gameLogic.ts`: 囲碁ルール（取り上げ判定）実装済み

### 3. 基本機能の実装状況
- ✅ Teacher/Student ロール切り替え
- ✅ ビデオ通話機能（Agora）
- ✅ 音声通話機能（Agora）
- ✅ 囲碁盤UI（SVGベース）
- ✅ P2P盤面同期（PeerJS）
- ✅ 取り上げロジック
- ⏸️ SGFインポート/エクスポート（UI未実装）
- ❌ KataGo連携（後回し）

## 🚧 現在の状況

### 開発サーバー
- **場所**: LEGION上で起動中
- **ポート**: 5174
- **Tailscale IP**: `100.120.126.60`
- **アクセスURL**: `http://100.120.126.60:5174/`

### 問題
- YOGAProブラウザからアクセスすると真っ白な画面
- HTMLは正しく返されている
- JavaScriptモジュール（`/src/main.tsx`）の読み込みに問題がある可能性
- Vite HMR WebSocketの接続に問題がある可能性

## 🎯 次のステップ（推奨）

### YOGAPro側でのセットアップ

**理由:**
- YOGAPro = 開発用PC（CLAUDE.mdの方針）
- ネットワーク問題を回避
- 開発体験が最良

**手順:**

```bash
# YOGAPro側で実行

# 1. プロジェクトディレクトリへ移動
cd /home/mimura/projects/online-go-school

# 2. 依存関係インストール
npm install

# 3. .envファイルが存在するか確認
cat .env
# なければ、LEGION側からコピーするか、以下を作成:
# VITE_AGORA_APP_ID=0cead207dab34dd188322c1725076f13

# 4. 開発サーバー起動
npm run dev

# 5. ブラウザでアクセス
# http://localhost:5173/ (または5174)
```

## 📋 テスト手順（サーバー起動後）

### 基本動作確認

1. **Teacher側（ブラウザ1）**
   - `Instruction Mode` を選択
   - カメラ・マイクの許可
   - 表示されたPeer IDをコピー

2. **Student側（ブラウザ2 / シークレットモード）**
   - `Student Mode` を選択
   - Teacher の Peer ID を入力
   - `Join` ボタンをクリック

3. **確認項目**
   - [ ] ビデオが両方に表示される
   - [ ] 音声が聞こえる
   - [ ] Teacherが石を置くとStudentに同期される
   - [ ] 取り上げが正しく動作する

## 🔧 技術情報

### 使用技術
- **Frontend**: Vite + React + TypeScript
- **Video/Audio**: Agora RTC SDK
- **P2P Data**: PeerJS
- **Styling**: Custom CSS (Glass morphism)
- **Icons**: Lucide React

### ネットワーク構成
- **LEGION**:
  - IP (Tailscale): `100.120.126.60`
  - 用途: 生徒の囲碁研究（KataGo常駐）
  - 開発時の注意: GPU負荷を考慮

- **YOGAPro**:
  - IP (Tailscale): `100.115.174.113`
  - 用途: 開発作業、ブラウザ確認

## 📝 メモ

### 重要な設計方針
1. **AI機能（KataGo）は後回し**
2. **基本機能を優先**: 顔を見て、声でやり取りして、囲碁が打てる
3. **LEGIONのGPU負荷に配慮**: 日中は生徒の研究用

### 既存の実装品質
- 囲碁盤UI: 非常に洗練されている
- SGFユーティリティ: 完全実装（分岐対応）
- ビデオ通話: Agora統合済み
- P2P通信: シンプルで効率的

## 🔄 今後の開発タスク

- [ ] YOGAPro側で開発サーバー起動・動作確認
- [ ] ビデオ通話の完全テスト
- [ ] 盤面同期の完全テスト
- [ ] UIの改善（接続状態表示、エラーハンドリング）
- [ ] SGFインポート/エクスポートUI追加
- [ ] 対局時計機能（将来）
- [ ] KataGo連携（将来）
