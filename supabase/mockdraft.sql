-- Mock drafts (offseason Draft Tools). Run once in Supabase's SQL Editor, after accounts_v2.sql.
-- Safe to run again.
--
-- Every write comes from the server function /api/draft with the secret key (SUPABASE_SECRET_KEY in Vercel),
-- which skips row-level security. People can only read rooms they are in, through the policies below.
-- Also needed: Realtime switched on for the project (it is by default). No table needs to be added to a
-- Realtime publication: the draft room uses broadcast messages, not table changes.

create table if not exists public.draft_rooms (
  id            uuid primary key,
  code          text not null unique,                  -- short invite code (#draft/<code>)
  mode          text not null check (mode in ('solo','friends','public')),
  preset        text,                                  -- public lobbies: which preset this lobby is for
  host          uuid,
  status        text not null default 'lobby' check (status in ('lobby','live','paused','done')),
  settings      jsonb not null,
  seats         jsonb not null default '[]',           -- who sits where: a person, a CPU team (with its strategy) or open
  members       uuid[] not null default '{}',          -- everyone who has sat in this room (for row-level security)
  ordered       boolean not null default false,        -- friends: the host set the draft order by hand
  cur           int not null default 0,                -- overall pick number now on the clock (0-based)
  pick_deadline timestamptz,
  paused_left   int,                                   -- ms left on the clock when it was paused
  pause_until   timestamptz,
  starts_at     timestamptz,                           -- public lobbies: when the countdown ends
  chat          jsonb not null default '[]',
  reacts        jsonb not null default '{}',
  results       jsonb,                                 -- grades for every team, written when the draft ends
  v             int not null default 0,                -- bumps on every change (lets two changes at once be told apart)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);
alter table public.draft_rooms add column if not exists ordered boolean not null default false;
-- only one open lobby per public preset
create unique index if not exists draft_rooms_one_lobby on public.draft_rooms (preset) where mode = 'public' and status = 'lobby';
create index if not exists draft_rooms_host on public.draft_rooms (host, mode, created_at desc);
create index if not exists draft_rooms_status on public.draft_rooms (status, updated_at);

create table if not exists public.draft_picks (
  room_id   uuid not null references public.draft_rooms(id) on delete cascade,
  pick_no   int  not null,                             -- overall pick number, 0-based
  seat      int  not null,
  player_id text not null,
  how       text not null check (how in ('user','queue','auto','cpu')),
  at        timestamptz not null default now(),
  primary key (room_id, pick_no),                      -- two picks can never land in the same spot
  unique (room_id, player_id)                          -- and a player can only be drafted once
);

create table if not exists public.draft_queues (
  room_id    uuid not null references public.draft_rooms(id) on delete cascade,
  user_id    uuid not null,
  ids        jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- kept after the room itself is cleaned up, so it has no link to draft_rooms
create table if not exists public.draft_results (
  user_id    uuid not null references auth.users(id) on delete cascade,
  room_id    uuid not null,
  summary    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
create index if not exists draft_results_user on public.draft_results (user_id, created_at desc);

alter table public.draft_rooms   enable row level security;
alter table public.draft_picks   enable row level security;
alter table public.draft_queues  enable row level security;
alter table public.draft_results enable row level security;

drop policy if exists draft_rooms_member_read on public.draft_rooms;
create policy draft_rooms_member_read on public.draft_rooms for select to authenticated
  using (auth.uid() = any (members));
drop policy if exists draft_picks_member_read on public.draft_picks;
create policy draft_picks_member_read on public.draft_picks for select to authenticated
  using (exists (select 1 from public.draft_rooms r where r.id = room_id and auth.uid() = any (r.members)));
drop policy if exists draft_queues_own_read on public.draft_queues;
create policy draft_queues_own_read on public.draft_queues for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists draft_results_own_read on public.draft_results;
create policy draft_results_own_read on public.draft_results for select to authenticated
  using (auth.uid() = user_id);
-- no insert / update / delete policies: only the server (secret key) writes.
