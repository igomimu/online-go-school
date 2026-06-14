# 試験レッスン 当日チェックリスト（online-go-school）

実生徒1人との初回試験レッスン用。技術的な疎通は 2026-06-15 に本番で実証済み
（anon→validate_student_session→JWT claim昇格→/api/token 200→LiveKit JWT 取得、
別教室は403で拒否）。**残るは A/V 品質の人間確認のみ。**

## 事前確認（レッスン前日〜30分前）
- [ ] 公開URL が開く: https://online.mimura15.jp/ → ログイン画面が出る（HTTP 200 / Vercel）
- [ ] 先生ログインができる（PW: `~/.secrets/online-go-school-teacher.env`）
- [ ] 生徒に渡す情報を準備: 生徒ID（dojo students.id, `student_type='net' AND status='active'`）＋ 教室名
- [ ] LiveKit Cloud が生きている（`wss://...livekit.cloud`、公開到達可）
- [ ] カメラ・マイクの許可をブラウザで事前に通しておく（Chrome推奨）

## レッスン本番フロー
- [ ] 先生: ログイン → 教室を選択 → ダッシュボード表示
- [ ] 生徒: 公開URL → 生徒ID＋教室名でログイン → ロビー入室
- [ ] **映像**: 先生・生徒の双方の顔が見える（VideoTiles）
- [ ] **音声**: 双方向で聞こえる（ハウリング対策にイヤホン推奨）
- [ ] 先生が対局を作成 → 碁盤が両者に出る
- [ ] 生徒が着手 → 先生画面に即時反映（Supabase権威型同期）
- [ ] 先生が代打ち / 着手 → 生徒画面に反映
- [ ] 検討モード・詰碁モードの切替（使うなら）
- [ ] チャットが双方向で届く
- [ ] レッスン終了 → 先生がロビーに戻ると生徒側の盤面もクリア（REVIEW_END拡張）

## A/V で見るポイント（人間確認の本丸）
- [ ] 映像の遅延・カクつきは実用範囲か
- [ ] 音声の途切れ・エコー・遅延はないか
- [ ] 回線が一時的に切れても再接続するか（LiveKit再接続）
- [ ] モバイル/タブレットでも碁盤が崩れず操作できるか

## 既知の落とし穴
- **LiveKit URL**: dev は WSL2 IP 直打ち（LEGION再起動でIP変化）。本番Vercelは LiveKit Cloud を使うので影響なし。
- **KataGo AI分析**: `VITE_KATAGO_SERVER_URL=localhost:2718` は本番公開未対応。**分析機能のみ非動作**（対局・レッスンには影響なし）。使うなら別途トンネル要。
- **dojo-app からの入室導線（join_token パスA）**: 未配線。生徒は公開URLから直接ログイン（JWTパスB）で入る。
- 編集が反映されない時: `pgrep -fa vite` で稼働ディレクトリ確認（正は `~/projects/online-go-school/`）。本番はVercelなので通常は無関係。

## ロールバック / 緊急時
- 公開を止める: Cloudflare の `online.mimura15.jp` レコードを Tunnel(`722f5977-...cfargotunnel.com`/proxied) に戻す（cloudflared ingress は `~/.cloudflared/config.yml` に残置）。
- 認証が壊れた時の最終手段: dev server(LEGION 5175 + api 5176, 両者systemd)へ切替。
