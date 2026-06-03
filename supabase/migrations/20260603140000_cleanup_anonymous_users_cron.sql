-- ---------- pg_cron による未使用の匿名ユーザー自動削除ジョブ ----------
--
-- 生徒がログインするたびに作成される匿名ユーザーが auth.users に蓄積され、
-- dojo-app の auth.users 参照クエリに性能影響が出るのを防ぐため、
-- 30日以上未使用（last_sign_in_at が 30日以上前）の匿名ユーザーを日次でクリーンアップします。

-- pg_cron 拡張機能が有効であることを確認
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 既存の同名ジョブがあれば削除
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-anonymous-users';

-- 毎日午前 3:00 (UTC) に実行するジョブを登録
SELECT cron.schedule(
    'cleanup-anonymous-users',
    '0 3 * * *',
    $$ DELETE FROM auth.users WHERE is_anonymous = true AND last_sign_in_at < now() - interval '30 days' $$
);
