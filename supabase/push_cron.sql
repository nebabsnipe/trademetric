-- TradeMetric: the schedule for push notifications (injuries, trade deadlines, lineup fixes).
-- SET UP 2026-11-25. The site's hosting plan only allows a scheduled job once a day, so the database's own scheduler
-- calls the check every 15 minutes instead. The password (same value as CRON_SECRET in Vercel) is kept encrypted in
-- Supabase Vault as 'tm_cron_secret'. It is never written in this file (the repo is public).
--
-- To change the password: put the new value in Vercel's CRON_SECRET, redeploy, then in the SQL Editor run
--   select vault.update_secret((select id from vault.secrets where name = 'tm_cron_secret'), 'NEW_VALUE');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- every 15 minutes
select cron.unschedule('tm-push-injuries') where exists (select 1 from cron.job where jobname = 'tm-push-injuries');
select cron.unschedule('tm-push') where exists (select 1 from cron.job where jobname = 'tm-push');
select cron.schedule('tm-push', '*/15 * * * *', $$
  select net.http_get(
    url := 'https://www.trademetric.app/api/push/cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tm_cron_secret')),
    timeout_milliseconds := 55000);
$$);

-- once a day: clear old send records and devices unused for 6 months
select cron.unschedule('tm-push-cleanup') where exists (select 1 from cron.job where jobname = 'tm-push-cleanup');
select cron.schedule('tm-push-cleanup', '17 9 * * *', $$ select public.push_cleanup(); $$);

-- To stop it:  select cron.unschedule('tm-push');
-- To see runs: select * from cron.job_run_details order by start_time desc limit 20;
--              select status_code, content from net._http_response order by id desc limit 5;
