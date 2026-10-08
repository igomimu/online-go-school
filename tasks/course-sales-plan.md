# 講座の販売と視聴（online.mimura15.jp/course/）

2026-10-09 三村さん決定: Systeme.io をやめ、石の形講座を三村囲碁オンラインで売る。教室の画面とは別の入口にする。

## 決めたこと
- 購入はログイン不要。個人の Stripe（acct_1UHaOWL4nVnsEDpp「三村智保」）で1回払い ¥3,000
- 支払いが済んだら、購入者ごとの「視聴リンク」を発行。決済後の画面に出し、Resend（info@mimura15.jp、mimura15.jp は確認済み）でメールでも送る
- 動画は Cloudflare R2 `course-videos`。再生のたびに4時間で切れる署名付き URL を出す
- 裂かれ形の既存購入者3人（岩本・OKA・豊田）には手動で視聴リンクを発行して送る。Systeme は3人が新しい方で見られるのを確かめてから閉じる
- 鍵は `~/.secrets/course-sales.env`（STRIPE_KOJIN_TEST_KEY / STRIPE_KOJIN_LIVE_KEY / R2_*）と `~/.secrets/resend.env`

## 作り
- DB（dojo-app と共用の Supabase）: `course_products`, `course_purchases` を新設。RLS 有効・ポリシー無し＝サービスロールの関数からだけ触る。既存の表には触れない
- 視聴リンクの鍵 = HMAC(COURSE_TOKEN_SECRET, 購入の識別子)。DB にはハッシュだけ置く。決済後の画面と webhook のどちらが先に来ても同じ鍵になる
- 関数（Vercel `api/`）
  - `course-checkout`: 商品IDを受けて Stripe Checkout（mode=payment）を作る。金額は DB から
  - `course-claim`: 決済後の画面から session_id を受け、Stripe に支払い済みを確かめて購入を記録（重複しない）→ 視聴リンクを返す。メールが未送信なら送る
  - `course-webhook`: checkout.session.completed を受けて同じ処理（画面を閉じられても記録とメールが残るように）
  - `course-access`: 視聴リンクの鍵を受けて、その人の購入済み講座と署名付き動画 URL を返す
- 画面: Vite の別入口 `course/index.html`（教室の App.tsx には触れない）。vercel.json で `/course` を先に振り分ける

## 進め方
- [x] DB のマイグレーション（新しい表だけ）2026-10-09 本番適用
- [x] 関数と画面（Vercel 無料プランは関数12個まで → api/course.ts の ?action= に4つを統合、通知だけ course-webhook）
- [x] 2目の頭（100MB版）を R2 nimoku.mp4 に置いた
- [x] 裂かれ形（423MB→114MB）を R2 sakare.mp4 に置き、購入可にした 2026-10-09
- [x] テスト用 Stripe で本番 URL まで通し（決済→記録→メール→視聴、webhook 配達0件残り）2026-10-09
- [x] 三村さんがテストカードで1回購入して確認（2026-10-09）
- [x] 本番の鍵に切り替え（2026-10-09 07:59。webhook we_1UOQFXL4nVnsEDppn3MH4HK5、Vercel 再書き出し）
- [x] mimura15.jp/ishinokatachi に第2回を足し「購入する」を新しいページへ（marketing-ai b29e325b）
- [x] 既存の3人（岩本・OKA・豊田）に視聴リンクを送った 2026-10-09 08:13（scripts/course/grant.py、Resend 配達済み）
- [ ] 3人が開いたのを last_viewed_at で確かめて Systeme を閉じる（www.mimura15.jp の向き先も確認）

## 保留の課題（三村さん「少し考えて課題としておいておく」2026-10-09）
- 教室のホーム画面に「石の形講座」への入口を置くか（今は教室から講座へのリンクが無い＝生徒は講座に気づかない）。教室の画面に触れるので授業のない時間に反映
- 三村囲碁オンラインで他のサービスも売る可能性あり（三村さん「決済が一つにまとまったのは良いこと」）。動画講座は course_products に1行＋R2 で足せる。動画以外は「購入後に渡すもの」を足す。月額制は Stripe の subscription を足す
