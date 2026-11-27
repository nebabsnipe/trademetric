-- TradeMetric: the hourly billing check. NOT RUN YET. Run it once payments are live on main (after billing.sql).
-- Every hour the database's own scheduler:
--   1. re-checks every paying account, so Pro turns off when a failed payment's 7-day grace period runs out
--      (pure SQL, no website call needed)
--   2. calls the site's billing check, which sends the "your trial ends in 2 days" email
-- The call uses the same password as the push schedule, kept encrypted in Supabase Vault as 'tm_cron_secret'
-- (see push_cron.sql). Never written in this file (the repo is public).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('tm-billing-refresh') where exists (select 1 from cron.job where jobname = 'tm-billing-refresh');
select cron.schedule('tm-billing-refresh', '7 * * * *', $$ select public.billing_refresh(); $$);

select cron.unschedule('tm-billing') where exists (select 1 from cron.job where jobname = 'tm-billing');
select cron.schedule('tm-billing', '12 * * * *', $$
  select net.http_get(
    url := 'https://www.trademetric.app/api/billing/cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tm_cron_secret')),
    timeout_milliseconds := 55000);
$$);

-- To stop it:  select cron.unschedule('tm-billing'); select cron.unschedule('tm-billing-refresh');
-- To see runs: select * from cron.job_run_details where jobname like 'tm-billing%' order by start_time desc limit 20;
