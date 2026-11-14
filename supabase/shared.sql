-- TradeMetric: the shared news store.
-- Injury status history, story recaps and the league news archive are built once on the server and sent to
-- everyone, so a new phone or a brand-new account shows the same News tab as a computer that was open all week.
-- Run once in Supabase after the other files: SQL Editor -> New query -> paste -> Run. (Safe to run again.)
-- Then add SUPABASE_SECRET_KEY in Vercel (see the README). Until both are done the site works as before.

-- Small shared documents: the last injury report from each feed, the league news archive.
create table if not exists public.shared_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- One row every time a player's injury status changes (hurt, downgraded, upgraded, cleared).
create table if not exists public.status_log (
  id   bigint generated always as identity primary key,
  src  text not null,                 -- which feed saw it: sleeper or espn
  name text not null,
  team text not null default '',
  was  text not null default '',      -- '' = healthy
  st   text not null default '',
  body text not null default '',
  at   timestamptz not null default now()
);
create index if not exists status_log_at on public.status_log (at desc);

-- The AI recap of each news story, written once and reused for every reader.
create table if not exists public.news_recaps (
  id    text primary key,             -- hash of the story's link
  recap jsonb not null,
  at    timestamptz not null default now()
);

-- Locked down: no policies, so the public key in the page can't read or write these.
-- Only the site's own server functions (which hold the secret key) can.
alter table public.shared_kv   enable row level security;
alter table public.status_log  enable row level security;
alter table public.news_recaps enable row level security;
revoke all on public.shared_kv, public.status_log, public.news_recaps from anon, authenticated;

-- Housekeeping: call now and then to drop history nobody will see again. (The site only reads the last 8 days.)
create or replace function public.shared_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.status_log  where at < now() - interval '30 days';
  delete from public.news_recaps where at < now() - interval '30 days';
$$;
revoke all on function public.shared_cleanup() from public, anon, authenticated;
