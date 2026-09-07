# online-go-school 改善点レビュー

確認日：2026-09-07  
対象：`igomimu/online-go-school` の `31f4366`（origin/main、2026-09-06）

## 結論

優先するのは、権限の判定方法と対局の再同期です。見た目の変更より先に、通信障害時にも同じ盤面・同じ対局状態へ戻ることを保証する必要があります。

コードとローカルの再現テストによるレビューです。本番へのログイン、権限変更、対局作成、DB変更は行っていません。実機の音声・映像品質と本番DBの設定は未検証です。

## 1. P1：先生権限を、利用者が編集できる情報で判定している

- [api/token.ts 148行](https://github.com/igomimu/online-go-school/blob/31f4366/api/token.ts#L148)
- [api/presence.ts 49行](https://github.com/igomimu/online-go-school/blob/31f4366/api/presence.ts#L49)
- [JWT hook 38行](https://github.com/igomimu/online-go-school/blob/31f4366/supabase/migrations/20260420204425_custom_access_token_hook.sql#L38)

`user.user_metadata.app_role` が teacher なら入室を許可しています。JWT hookもこのmetadataから権限claimを作ります。Supabaseのuser_metadataは利用者自身が更新できる情報であり、認可に使えません。[Supabase公式の説明](https://supabase.com/docs/guides/database/postgres/row-level-security#authjwt)

実APIの依存をモックに差し替えたローカル確認では、app_metadataがstudentでもuser_metadataがteacherならホスト権限が発行されました。ゲスト先生の情報と教室IDが付いていても、別教室への要求が通る分岐になっています。

**影響：** 本番に別の保護がなければ、生徒用セッションから先生扱いになる危険があります。リポジトリ内にはmetadata変更を止める保護を見つけられませんでした。本番DBにコード外の対策があるかは未確認です。本番で権限昇格を試してはいません。

**改善：** サーバーのみが編集するapp_metadataまたは権限テーブルを正本にする。API・Edge Functions・JWT hookを同じ基準へ揃え、ゲスト先生には所属教室の制約を適用する。既存セッションの移行と再認証も合わせて設計する。修正時は「生徒が自身のmetadataを変更しても先生権限を得られない」ことを隔離環境で検証する。

## 2. P1：保存に失敗した着手が、相手の盤に残る

- [liveMoveReconcile.ts 12行](https://github.com/igomimu/online-go-school/blob/31f4366/src/utils/liveMoveReconcile.ts#L12)
- [useLiveGame.ts 340行](https://github.com/igomimu/online-go-school/blob/31f4366/src/hooks/useLiveGame.ts#L340)
- [useLiveGame.ts 575行](https://github.com/igomimu/online-go-school/blob/31f4366/src/hooks/useLiveGame.ts#L575)

着手はDB保存の完了前にRTCで相手へ届き、相手側では `temp-lk-*` として追加されます。保存に失敗すると送信者側は石を戻しますが、相手側へ保存失敗が伝わりません。

照合処理はサーバーにない `temp-*` をすべて残すため、定期再取得でもその石が消えません。

**再現：** 黒の仮着手をRTCで受け取り、サーバーの棋譜は空のままという条件で、5分間の定期照合後も石が残りました。APIをモック化した実フックで再現しています。

**影響：** 両者で盤面・手数が食い違い、応手もサーバーに拒否される可能性があります。

**改善：** 自端末で保存要求中の手と、遠隔から受けた未確定手を分ける。確定・却下の通知と操作IDを設け、サーバー照合で未確定手を解消できるようにする。単にすべての仮着手を即削除すると保存処理中の表示が戻るため、送信中の管理を維持する。

## 3. P1：切断中に取り逃した中断・再開・整地を復元できない

- [useLiveGame.ts 251行](https://github.com/igomimu/online-go-school/blob/31f4366/src/hooks/useLiveGame.ts#L251)
- [useLiveGame.ts 318行](https://github.com/igomimu/online-go-school/blob/31f4366/src/hooks/useLiveGame.ts#L318)

3秒ごとの照合が再取得するのは着手一覧だけです。対局のstatus、時計、待った要求、整地の状態は初回取得とRealtime通知に依存しています。

**再現：** 初回playingの後にサーバーをinterruptedへ変え、通知を落とすと、30秒の定期照合後もplayingのままでした。

**影響：** 回線断中に相手が中断・再開・整地へ移った場合、一方だけ古い画面や時計が残ります。着手同期の復旧だけでは解消しません。

**改善：** 購読の再接続時に対局行と着手を再取得する。定期照合でも対局行を確認し、既存の時計の重複取り込み防止を維持する。対局一覧の再取得も対応させる。

## 4. P2：新しい教室への同時入室で、映像の部屋が分裂する

- [api/realtimeKit.ts 92行](https://github.com/igomimu/online-go-school/blob/31f4366/api/realtimeKit.ts#L92)

RealtimeKitのmeetingが未作成の教室へ同時に要求が来ると、それぞれmeetingを作ります。DBの条件付きUPDATEに負けた要求は、DBに採用されたmeetingではなく、自分が作ったmeetingを返します。

**再現：** 実関数の依存をモックにして同時実行すると、DB値はmeeting-1なのに、戻り値はmeeting-1とmeeting-2に分かれました。

**影響：** 同じ教室を選んでも会えません。先生が未採用側へ入ると、生徒が先生不在と判定される場合もあります。既にmeeting IDが保存された通常の再入室は、この初回競合の対象ではありません。

**改善：** UPDATE不成立ならDBを再読して確定したIDを使う。UPDATEのエラーも扱う。同時初回入室のテストを追加する。

## 5. P2：日本語変換の確定Enterでチャットを送ってしまう

- [ChatPanel.tsx 41行](https://github.com/igomimu/online-go-school/blob/31f4366/src/components/teacher/ChatPanel.tsx#L41)

Enterかどうかだけを見て送信しています。IMEの変換中かどうかを確認していません。

**再現：** 変換中フラグ付きのEnterを入力すると、送信関数が1回呼ばれ、「検討」が宛先allへ送信されました。期待は変換の確定だけです。React Testing Library＋jsdomのイベントテストで再現しています。

**改善：** composition状態を確認して変換確定Enterを送信から除外する。変換中／確定直後／通常Enterの3条件をテストする。

付随して送信処理は完了を待たず入力欄を空にするため、送信失敗時の入力保持・再送表示も改善候補です。優先度は上記の再現済み問題より下とします。

## 6. P2：CIがアプリのテストを実行していない

- [.github/workflows/build-check.yml](https://github.com/igomimu/online-go-school/blob/31f4366/.github/workflows/build-check.yml)
- [playwright.config.ts](https://github.com/igomimu/online-go-school/blob/31f4366/playwright.config.ts)

Build Checkはnpm ciとbuildのみで、Vitest・lint・E2Eは未実行です。別のEdge FunctionsワークフローにはDenoテストとスモークがありますが、画面・対局のテストは補えません。

今回、秘密情報を入れないクリーンな環境で既存単体テスト804件を実行したところ、799件成功、5件失敗でした。失敗はすべてuseGameManager.test.tsから保存処理が実Supabaseクライアントを作ろうとする環境変数不足です。この旧hookは現行srcから使用されていないため、本番対局の5つの不具合とは扱いません。

**改善：** 保存処理をモック化し、単体テストを本番設定なしで通せるようにして、lint・VitestをCIへ追加する。E2Eは既存設定が共有名簿を書き換えるため、そのまま本番接続で自動化せず、独立したテスト教室・データと削除手順を用意する。ログイン→対局→切断復帰→終局を最小の必須経路にする。

## 検証と限界

| 確認 | 結果 |
|---|---|
| 対象版 | origin/mainとLEGIONのHEADが31f4366で一致 |
| 本体ビルド | 成功 |
| ESLint | 成功 |
| 既存Vitest | 87ファイル、804件。799成功、5失敗（上記のテスト分離不足） |
| 回復の追加再現 | 2件とも期待する回復結果との不一致を確認 |
| 日本語IMEの追加再現 | 変換確定Enterで送信を確認 |
| APIの追加再現 | 権限判定、meeting同時作成を依存モックで確認 |
| 本番DBの保護・実音声映像 | 未検証 |
| 本番への書込み・デプロイ | なし |

ビルド時の主JSは約1.72MB（gzip約460KB）で分割警告が出ます。ただし今回、初回表示速度を実測していないため優先改善とはしません。

YOGAProの元フォルダは古い版と未コミット変更が混在していました。元の変更はそのまま保持し、最新origin/mainから分離した確認用worktreeでレビューしました。プロダクションコードは変更していません。追加したものは確認用テストのみです。

## 推奨する修正順

1. 権限の正本と本番の保護状態を確認し、先生権限への昇格を防ぐ。
2. 対局行と着手の再同期をまとめて直す（仮着手の却下・中断・整地・再開）。
3. meeting初回作成競合を直す。
4. IME送信を直す。
5. 上記の回帰テストをCIへ組み込み、テスト用データを隔離する。
