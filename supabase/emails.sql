-- TradeMetric: emails.
-- A record of every email sent (so nobody ever gets the same one twice), each account's email switches,
-- addresses that bounced or marked us as spam (never emailed again), and the "seen it more than once" notes
-- the daily check uses before it believes a clinch, a title or a broken league.
-- Run once in Supabase after push.sql: SQL Editor -> New query -> paste -> Run. (Safe to run again.)

-- Every email, one row. (user, type, key, live) can only exist once: that is what stops a repeat, even if two
-- checks run at the same moment. key names the event, e.g. "espn:12345:2026" for a league and season.
-- live = false rows are test sends (EMAIL_LIVE off), kept apart so testing never uses up a real send.
create table if not exists public.email_sent (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  type      text not null,                    -- welcome, sync_broke, clinch, champ, recap, draft, weekly, injury, deadline, moves
  key       text not null,
  live      boolean not null default false,
  status    text not null default 'sending',  -- sending -> sent, or capped (dropped by the one-a-day limit)
  resend_id text,
  at        timestamptz not null default now(),
  unique (user_id, type, key, live)
);
create index if not exists email_sent_user_at on public.email_sent (user_id, at desc);

-- The switches in Account -> Email. No row means the defaults: everything on except injuries.
create table if not exists public.email_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  clinch     boolean not null default true,   -- clinched a playoff spot
  champ      boolean not null default true,   -- won the championship
  recap      boolean not null default true,   -- season recap is ready
  draft      boolean not null default true,   -- draft season reminder
  updated_at timestamptz not null default now()
);
-- Added 2026-11-25: the weekly recap's four sections, injuries, trade deadlines and offseason player moves.
alter table public.email_prefs add column if not exists matchup  boolean not null default true;   -- weekly recap: your matchup result
alter table public.email_prefs add column if not exists perf     boolean not null default true;   -- weekly recap: standout games
alter table public.email_prefs add column if not exists top      boolean not null default true;   -- weekly recap: #1 at his position
alter table public.email_prefs add column if not exists clips    boolean not null default true;   -- weekly recap: highlights
alter table public.email_prefs add column if not exists inj      boolean not null default false;  -- injuries (off until switched on)
alter table public.email_prefs add column if not exists deadline boolean not null default true;   -- trade deadline reminder
alter table public.email_prefs add column if not exists moves    boolean not null default true;   -- offseason player moves

-- Addresses we must stop emailing: a hard bounce or a spam complaint (reported by the email service).
create table if not exists public.email_block (
  email  text primary key,                    -- lower case
  reason text not null,                       -- bounce | complaint
  at     timestamptz not null default now()
);

-- Things the daily check has to see more than once before it emails anyone:
--   sync   a saved league that can't be read (emailed after 48 hours of failures in a row)
--   clinch a playoff spot that is mathematically locked (emailed once two checks a day apart agree)
--   champ  a championship win (same)
-- The row is removed the moment a check says otherwise.
create table if not exists public.email_watch (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null,
  key     text not null,
  since   timestamptz not null default now(),
  seen    integer not null default 1,
  last_at timestamptz not null default now(),
  note    text not null default '',
  primary key (user_id, kind, key)
);

alter table public.email_sent  enable row level security;
alter table public.email_prefs enable row level security;
alter table public.email_block enable row level security;
alter table public.email_watch enable row level security;

-- Locked down: no policies, so only the site's own server functions (which hold the secret key) can use these.
revoke all on public.email_sent, public.email_block, public.email_watch from anon, authenticated;

-- Email switches: each person can read and change only their own row, and only the four switches.
revoke all on public.email_prefs from anon, authenticated;
grant select on public.email_prefs to authenticated;
grant insert (user_id, clinch, champ, recap, draft, matchup, perf, top, clips, inj, deadline, moves) on public.email_prefs to authenticated;
grant update (clinch, champ, recap, draft, matchup, perf, top, clips, inj, deadline, moves) on public.email_prefs to authenticated;
drop policy if exists "read own email prefs"   on public.email_prefs;
drop policy if exists "insert own email prefs" on public.email_prefs;
drop policy if exists "update own email prefs" on public.email_prefs;
create policy "read own email prefs"   on public.email_prefs for select using (auth.uid() = user_id);
create policy "insert own email prefs" on public.email_prefs for insert with check (auth.uid() = user_id);
create policy "update own email prefs" on public.email_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.email_prefs_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists email_prefs_touch on public.email_prefs;
create trigger email_prefs_touch before update on public.email_prefs
  for each row execute function public.email_prefs_touch();

-- Who to email: address, username and when the account was last used. Server only (the secret key).
-- p_ids = null returns every account.
create or replace function public.email_accounts(p_ids uuid[] default null)
returns table (id uuid, email text, confirmed boolean, username text, created_at timestamptz, last_sign_in_at timestamptz, state_at timestamptz)
language sql security definer set search_path = public, auth stable as $$
  select u.id, u.email::text, (u.email_confirmed_at is not null), p.username, u.created_at, u.last_sign_in_at, s.updated_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_state s on s.user_id = u.id
  where u.email is not null and (p_ids is null or u.id = any(p_ids));
$$;
revoke all on function public.email_accounts(uuid[]) from public, anon, authenticated;
grant execute on function public.email_accounts(uuid[]) to service_role;
