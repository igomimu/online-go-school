# Forensics 報告: service_role 鍵 公開露出（2026-06 P0）

調査日: 2026-06-15 / 調査者: Claude Code / 対象 Supabase: `yzsyrtesydpulctjgdog`（dojo共用）
前提: 漏洩の封じ込め・鍵ローテは 2026-06-08 完了済み（legacy JWT鍵 無効化＝401）。
関連: memory `project_ogs_servicerole_leak_202606.md` / handoff #44d2c471 他。

## 調査範囲と前提
- 露出したのは **service_role JWT 鍵のみ**。**DB接続パスワードは非漏洩**。
  → 攻撃者が可能なのは REST(PostgREST)・Auth admin・Storage API の操作のみ。
  **任意 DDL（CREATE FUNCTION/TRIGGER 等）は不可** ＝ DB レベルの backdoor 埋め込みは原理的に不可能。
- 露出期間: biz-strategy 経由 最大88日（〜2026-06-08）/ online-go-school 経由 約13日。

## 1. 永続化バックドア（最重要・ローテで消えない脅威）→ クリーン
- **admin/staff 権限ユーザー: 10名のみ、全員身元判明**（三村 `lucky.mim@gmail.com`・`dojo@1kawa15.com`・道場スタッフ/所属プロ8名）。
  全員 2026-02-27〜04-25 に作成され、露出期間中の**不審な権限付与・昇格はゼロ**。
- 露出期間に作成された非匿名ユーザー16名 = 全て正常な保護者登録（google/email provider）＋内部テスト垢（`*.local`/`e2e-*@test.com`）。大量作成・gibberish メールなし。
- 匿名ユーザー497件 = online-go-school の anon sign-in + E2E 由来（30日 cleanup cron 対象）。権限なし（claim 昇格は実 student_id 照合の Edge Function 経由のみ）。
- public schema 関数29個 = 全て正規（dojo-app RPC/trigger/notify webhook ＋ online の `custom_access_token_hook`/`handle_new_user`/`get_user_role`）。backdoor 名なし。
- storage バケット2個（class-photos 2/27・newsletter 4/6）= いずれも露出前/初期作成。攻撃者作成のバケットなし。

## 2. 書き込み型悪用の痕跡 → 検出なし
- `transactions`: 7行のみ、全て同一 created_at（単一インポート）、金額異常0（負値・極端値なし）、注入行なし。
- `email_purchases` 109件 / `receipt_queue` 15件 = kuron の取込ペースとして正常、異常なし。
- 不正な行の挿入・改変・権限テーブル書き換えの痕跡は一切なし。

## 3. 読み取り型流出（exfiltration）→ 立証不能（本調査の限界）
- service_role 鍵は**全テーブルの読み取りを痕跡なしで**可能にする。
- **auth.audit_log_entries は 0件**（Supabase が短期purge）、API ログも露出期間（7日以上前）を保持しない。
  → 露出期間中に第三者が公開バンドルから鍵を抽出し**データを読み出したか否かは、ログから検証不可能**。
- 現実的な最悪シナリオ: 露出期間に鍵を入手した第三者が、生徒/保護者 PII・小規模な財務データを読み出した可能性。
  **その証拠はないが、無かったことも証明できない。**

## 結論
- **能動的侵害（永続化・改ざん）の証拠はゼロ。** 鍵はローテ済みで継続アクセスも不可。
- **受動的な読み取り流出は原理的に立証不能。** ただし対象は私的・小規模アプリで、財務データも極小（7行）。

## 残課題（三村さん判断 / 別作業）
1. **【要判断】個人情報保護法の観点での対応**: 生徒/保護者 PII を扱うため、漏洩懸念の通知要否は三村さんの経営判断。
   本調査では実害の証拠なし＝法的な「漏えい確定」ではないが、念のための判断材料として記録。
2. **【別件ハードニング】`class-photos` バケットが public+listing 可能**: 生徒写真が列挙され得る。service_role 漏洩とは独立の既存リスク。RLS/署名URL 化を別途検討。
3. **【整理】** 各 `.env.local`（dojo-app/biz/online）の legacy service_role は無効化済（実害なし）だが削除推奨。
4. **【監視】** 今後は SessionStart 等で sign-in 異常・新規 admin/staff 付与を定期確認できると望ましい。
