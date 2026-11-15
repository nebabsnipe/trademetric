-- TradeMetric: problem reports.
-- When something on the site fails to load or breaks in a visitor's browser, the page sends a short technical report
-- (what failed, browser, screen width, site version, how much news loaded). This is how problems that only happen on
-- other people's computers get found. No league contents, emails or passwords.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. (Safe to run again.)

create table if not exists public.client_reports (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  sid      text,                       -- one page visit
  uid      uuid,                       -- the signed-in account, as the page reported it
  username text,
  snap     jsonb not null default '{}',
  notes    jsonb not null default '[]',
  country  text
);
create index if not exists client_reports_at on public.client_reports (at desc);

-- Written only by the site's server (secret key). Read only by the site owner's own account.
alter table public.client_reports enable row level security;
revoke all on public.client_reports from anon, authenticated;
grant select on public.client_reports to authenticated;
drop policy if exists "owner reads reports" on public.client_reports;
create policy "owner reads reports" on public.client_reports for select to authenticated
  using (auth.uid() = '1cf5c595-1619-4ffc-bb69-b042382443f3'::uuid);

-- Reports older than 30 days go when the shared cleanup runs.
create or replace function public.shared_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.status_log     where at < now() - interval '30 days';
  delete from public.news_recaps    where at < now() - interval '30 days';
  delete from public.client_reports where at < now() - interval '30 days';
$$;
revoke all on function public.shared_cleanup() from public, anon, authenticated;
