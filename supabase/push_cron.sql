-- TradeMetric: the schedule for the injury push check. PROPOSED, NOT SET UP YET (see docs/push-notifications.md).
-- The site's hosting plan only allows a scheduled job once a day, so the database's own scheduler calls the
-- check every 15 minutes instead. Run once in Supabase's SQL Editor AFTER push.sql, and only once the
-- push-notifications branch is live on www.trademetric.app.
--
-- Before running: replace PASTE_CRON_SECRET_HERE with the CRON_SECRET value you put in Vercel.
-- Do NOT save the real secret into this file in the repo (the repo is public). Paste it in the SQL Editor only.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- every 15 minutes: check for confirmed injury changes and send them
select cron.unschedule('tm-push-injuries') where exists (select 1 from cron.job where jobname = 'tm-push-injuries');
select cron.schedule('tm-push-injuries', '*/15 * * * *', $$
  select net.http_get(
    url := 'https://www.trademetric.app/api/push/cron',
    headers := jsonb_build_object('Authorization', 'Bearer PASTE_CRON_SECRET_HERE'),
    timeout_milliseconds := 55000);
$$);

-- once a day: clear old send records and devices unused for 6 months
select cron.unschedule('tm-push-cleanup') where exists (select 1 from cron.job where jobname = 'tm-push-cleanup');
select cron.schedule('tm-push-cleanup', '17 9 * * *', $$ select public.push_cleanup(); $$);

-- To stop it:  select cron.unschedule('tm-push-injuries');
-- To see runs: select * from cron.job_run_details order by start_time desc limit 20;
