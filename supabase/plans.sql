-- TradeMetric plans: the "was here during the beta" marker.
-- Run once in Supabase after accounts_v2.sql: SQL Editor -> New query -> paste -> Run. (Safe to run again.)
--
-- profiles.plan ('free' or 'pro', added in accounts_v2.sql) stays the one record of what someone pays for.
-- This adds beta_users: one row for every account that existed while the beta was on, so those accounts can
-- be given a deal later. It is its own table (not a column on profiles) because people who signed in with
-- Google or Discord and skipped picking a username have no profiles row to mark.

create table if not exists public.beta_users (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  marked_at timestamptz not null default now()
);
alter table public.beta_users enable row level security;

-- People can see their own marker and nothing else. Nobody can add or remove one from the page:
-- only the server (secret key) and this file write here.
drop policy if exists "read own beta marker" on public.beta_users;
create policy "read own beta marker" on public.beta_users for select using (auth.uid() = user_id);
revoke all on public.beta_users from anon, authenticated;
grant select on public.beta_users to authenticated;

-- Mark every account that exists right now.
-- While the beta switch is on, the server also marks each account the next time it opens the site, so new
-- sign-ups are covered automatically. Run this file once more on the day the beta switch goes off, to catch
-- anyone who signed up but never came back.
insert into public.beta_users (user_id, marked_at)
select id, now() from auth.users
on conflict (user_id) do nothing;

-- Handy later:
--   how many beta accounts:        select count(*) from public.beta_users;
--   make one account Pro by hand:  update public.profiles set plan = 'pro' where username = 'their_username';
--   back to free:                  update public.profiles set plan = 'free' where username = 'their_username';
