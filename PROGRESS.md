# 開発進捗記録 — online-go-school（三村囲碁オンライン）

## 最終更新: 2026-04-20

## 現状（スナップショット）

### Runtime
- **Dev server**: LEGION の `npm run dev`、`http://localhost:5175/`
- **公開URL**: `https://online.mimura15.jp/`（Cloudflare Tunnel → LEGION port 5175）
- **本番デプロイ**: 未実施（Vercel 構成は準備済み）

### 技術スタック（確定）
- Vite 7 + React 19 + TypeScript 5.9 + Tailwind 4
- LiveKit（映像音声＋データ、`livekit-client` + `@livekit/components-react`）
- Supabase（対局の権威データ、dojo-app と共用プロジェクト）
- LiveKit Server SDK で Vercel Function `api/token.ts` が JWT 発行
- KataGo 連携（LEGIONサーバー、`katagoClient.ts`）
- Vitest + Playwright E2E

### 実装済み
- Teacher / Student ロール
- LiveKit ビデオ・音声・データメッセージ
- 囲碁盤 UI、分岐棋譜、描画、カーソル
- **Supabase 権威型対局**（着手・時計・スコアリング・死石判定を Supabase row で管理）
- 先生代打ち、複数生徒観戦、自動ペアリング
- KataGo AI 分析、勝率グラフ
- SGF / IGC インポート・エクスポート
- 対局時計、チャット、画面録画
- 詰碁問題、保存棋譜一覧
- 生徒ID + 教室ID ログイン、先生パスワードリセット
- Playwright E2E（multi-user-game, multi-student-game, reconnect）

### 未実装・次の一手
1. **実運用デビュー**（最優先）: 既存生徒 1 人で試験レッスン → フィードバック → 穴埋め
2. **dojo-app 導線**: 生徒向けアプリから「オンラインレッスン参加」へ
3. **pokekata 連携**: Pocket KataGo の局面をレッスンに持ち込み
4. **Vercel 本番化**: 現状の Tunnel 直接公開から Vercel へ
5. `VITE_LIVEKIT_URL` の WSL2 IP 直打ち問題の恒久対処

---

## アーキテクチャ変遷

- **〜2026-02**: Agora RTC + PeerJS（No Backend）でプロトタイプ
- **2026-03**: LiveKit 移行、生徒 ID + 教室 ID ログイン、Igo Campus 機能移植
- **2026-04**:
  - 先生パスワードリセット機能、LiveKit 再接続修正
  - **Supabase 権威型対局への全面移行**（BOARD_UPDATE ブロードキャストから脱却）
  - 先生代打ち復活、Playwright E2E 拡張
  - Agora / PeerJS 依存は完全撤去

---

## 直近のコミット（参考、実態は git log で確認）
- `94e637c` 2026-04-15 LEGION側既存作業の取り込み（E2E拡張 + 小改善）
- `5e10960` fix(live-game): 先生の代打ちを復活
- `5b349e0` feat(live-game): Supabase権威型対局システムへ移行
- `e16d882` fix(student-login): 生徒招待リンク経由の接続を修復
- `beb7067` fix(teacher): ツールバーに教室ID表示とワンタッチコピー
- `e2c4207` style: 先生パスワードリセットリンクを視認しやすい色に変更
- `78ce626` fix: LiveKit再接続時のdestroy、碁盤サイズ同期、秒読み初期化、パス処理改善
- `25bc1bc` feat: 先生パスワードリセット機能追加
- `738c7a0` feat: Playwright E2Eテスト基盤導入
