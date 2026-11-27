-- TradeMetric: the schedule for emails. Running since 2026-11-27 (first real run 2026-11-28; that day's
-- version carries a harmless `where now() >= '2026-11-28'` hold that can be dropped by re-running this file).
-- Once a day the database's own scheduler calls the email check: leagues that stopped updating, playoff clinches,
-- championships, and (in August) the draft season reminder. It uses the same password as the push schedule,
-- already kept encrypted in Supabase Vault as 'tm_cron_secret' (see push_cron.sql). Never written in this file.
-- Safe to run with EMAIL_LIVE off: every email then goes only to the owner's own inbox.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- every day at 15:20 UTC (10:20am Eastern, 7:20am Pacific in winter)
select cron.unschedule('tm-email') where exists (select 1 from cron.job where jobname = 'tm-email');
select cron.schedule('tm-email', '20 15 * * *', $$
  select net.http_get(
    url := 'https://www.trademetric.app/api/email/cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tm_cron_secret')),
    timeout_milliseconds := 55000);
$$);

-- To stop it:  select cron.unschedule('tm-email');
-- To see runs: select * from cron.job_run_details order by start_time desc limit 20;
