-- TradeMetric: push notifications.
-- One row per device that turned notifications on, tied to the signed-in account, plus a record of what was sent
-- so nobody gets the same alert twice.
-- Run once in Supabase after shared.sql: SQL Editor -> New query -> paste -> Run. (Safe to run again.)

-- A device (really: one browser on one device) that can receive notifications. One account can have many.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,          -- the browser's push address for this device
  p256dh       text not null,                 -- the device's public encryption keys
  auth         text not null,
  label        text not null default '',      -- "iPhone · Safari", "Mac · Chrome"
  tz           text not null default '',      -- the device's time zone, for quiet hours
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Each person can only see and remove their own devices. Adding one goes through push_claim() below.
drop policy if exists "read own devices"   on public.push_subscriptions;
drop policy if exists "delete own devices" on public.push_subscriptions;
create policy "read own devices"   on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "delete own devices" on public.push_subscriptions for delete using (auth.uid() = user_id);
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Turn notifications on for this device, for whoever is signed in. If someone else was signed in on this same
-- browser before, the device moves to the new account, so one person's alerts never land on another's sign-in.
create or replace function public.push_claim(p_endpoint text, p_p256dh text, p_auth text, p_label text, p_tz text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000
     or coalesce(length(p_p256dh), 0) not between 20 and 300 or coalesce(length(p_auth), 0) not between 8 and 100 then
    raise exception 'Bad subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, label, tz)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_label, ''), 60), left(coalesce(p_tz, ''), 60))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        label = excluded.label, tz = excluded.tz, last_used_at = now(),
        created_at = case when public.push_subscriptions.user_id = excluded.user_id
                          then public.push_subscriptions.created_at else now() end
  returning id into v_id;
  -- a sensible ceiling: keep an account's 20 most recently used devices
  delete from public.push_subscriptions where user_id = auth.uid() and id not in (
    select id from public.push_subscriptions where user_id = auth.uid() order by last_used_at desc limit 20);
  return v_id;
end $$;
revoke all on function public.push_claim(text, text, text, text, text) from public, anon;
grant execute on function public.push_claim(text, text, text, text, text) to authenticated;

-- What was sent to whom. The key names the event (player + new status + when), so the same event can never go
-- to the same person twice, and the count per hour is what the rate limit reads.
create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null,
  kind    text not null default '',           -- inj, summary, test ...
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists push_sent_at on public.push_sent (sent_at desc);

-- Locked down: no policies, so only the site's own server functions (which hold the secret key) can use it.
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

-- Housekeeping: old send records, and devices that haven't opened the site in 6 months.
create or replace function public.push_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.push_sent where sent_at < now() - interval '14 days';
  delete from public.push_subscriptions where last_used_at < now() - interval '180 days';
$$;
revoke all on function public.push_cleanup() from public, anon, authenticated;
