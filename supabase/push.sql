-- TradeMetric: phone and desktop notifications (web push).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. (Safe to run again.)
--
-- push_subs: one row per device that turned on alerts. The page writes its own rows; only the server reads them all.
-- push_sent: which notices each account has already been sent, so nothing is sent twice. Server only.

create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  keys       jsonb not null,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs(user_id);
alter table public.push_subs enable row level security;
drop policy if exists "read own subs"   on public.push_subs;
drop policy if exists "insert own subs" on public.push_subs;
drop policy if exists "update own subs" on public.push_subs;
drop policy if exists "delete own subs" on public.push_subs;
create policy "read own subs"   on public.push_subs for select using (auth.uid() = user_id);
create policy "insert own subs" on public.push_subs for insert with check (auth.uid() = user_id);
create policy "update own subs" on public.push_subs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own subs" on public.push_subs for delete using (auth.uid() = user_id);

create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  k       text not null,
  at      timestamptz not null default now(),
  primary key (user_id, k)
);
alter table public.push_sent enable row level security;   -- no policies: only the server (secret key) can use it
