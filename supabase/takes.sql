-- TradeMetric takes: one AI-written take and role outlook per player (api/take.js).
-- Run this once in the Supabase SQL editor, then add SUPABASE_SERVICE_ROLE_KEY to the Vercel
-- project's environment variables (Production and Preview). Until both are done, takes are only
-- kept in the server's memory and get rewritten whenever the server restarts.
--
-- The outlook column (growing / steady / threatened) is stored here so the opportunity model can
-- read it later. Nothing reads it for scoring yet.

create table if not exists public.player_takes (
  player_id  text primary key,
  name       text not null,
  team       text,
  pos        text,
  take       text not null,
  outlook    text not null check (outlook in ('growing','steady','threatened')),
  sig        text,                          -- fingerprint of the stories the take was written from
  reports    int  not null default 0,       -- how many stories went into it
  updated_at timestamptz not null default now(),   -- when the take was written
  checked_at timestamptz not null default now()    -- when we last looked for new stories
);

-- Server only: no policies, so the browser can't read or write this table. The server uses the service role key.
alter table public.player_takes enable row level security;
