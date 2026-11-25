-- TradeMetric billing: who pays for Pro (Stripe).
-- Run once in Supabase after plans.sql and emails.sql: SQL Editor -> New query -> paste -> Run. (Safe to run again.)
--
-- profiles.plan stays the ONE thing the rest of the site reads ('free' or 'pro', see api/_plan.js).
-- These tables are the record behind it. Only the server writes them (the Stripe webhook, api/stripe-webhook.js,
-- with the secret key). People can read their own subscription and nothing else. No card details are ever stored
-- here: cards stay with Stripe.

-- One row per account per Stripe mode (test or live). trial_used_at makes "one free trial per account, ever" stick,
-- even after a subscription is cancelled and deleted.
create table if not exists public.billing_customers (
  user_id            uuid not null references auth.users(id) on delete cascade,
  livemode           boolean not null default false,
  stripe_customer_id text not null unique,
  trial_used_at      timestamptz,
  created_at         timestamptz not null default now(),
  primary key (user_id, livemode)
);

-- One row per Stripe subscription. Always a copy of what Stripe says (the webhook re-reads the subscription from
-- Stripe every time, so events arriving twice or out of order can't leave it wrong).
create table if not exists public.subscriptions (
  stripe_subscription_id text primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text not null,
  livemode               boolean not null default false,
  status                 text not null,              -- trialing | active | past_due | unpaid | canceled | incomplete | incomplete_expired | paused
  plan                   text,                        -- monthly | yearly
  price_id               text,
  amount                 integer,                     -- the price, in cents, as Stripe has it
  currency               text,
  trial_end              timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  ended_at               timestamptz,
  payment_failed_at      timestamptz,                 -- first failed charge of the unpaid bill (cleared once paid)
  grace_until            timestamptz,                 -- Pro stays on until this while a payment is failing (7 days)
  first_paid_at          timestamptz,                 -- first real charge on this subscription
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_user on public.subscriptions (user_id);

-- Every Stripe event, once. The webhook writes the event id here BEFORE acting on it; a second delivery of the
-- same event finds the row and does nothing, so nothing (Pro, emails, analytics) can happen twice.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  livemode    boolean not null default false,
  received_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.stripe_events     enable row level security;

-- People can read their own subscription (the page uses it for the grace banner). Nobody can write from the page.
revoke all on public.billing_customers, public.subscriptions, public.stripe_events from anon, authenticated;
grant select on public.subscriptions to authenticated;
drop policy if exists "read own subscriptions" on public.subscriptions;
create policy "read own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);

-- Does this account get Pro from its subscriptions right now?
--   trialing or active                         yes (a cancelled plan stays active until the end of what was paid for)
--   past_due / unpaid inside the grace period  yes (7 days after the first failed charge)
--   anything else                              no
create or replace function public.billing_has_pro(p_user uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and (s.status in ('trialing', 'active')
           or (s.status in ('past_due', 'unpaid') and s.grace_until is not null and s.grace_until > now())));
$$;

-- Sets profiles.plan (and plan_renews_at) from the subscriptions. Only touches accounts that have a subscription
-- row, so an account made Pro by hand (plans.sql) without paying is left alone.
create or replace function public.billing_apply_plan(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_renews timestamptz;
begin
  if not exists (select 1 from public.subscriptions where user_id = p_user) then
    return (select plan from public.profiles where id = p_user);
  end if;
  v_plan := case when public.billing_has_pro(p_user) then 'pro' else 'free' end;
  select case when s.status = 'trialing' then s.trial_end else s.current_period_end end into v_renews
    from public.subscriptions s
    where s.user_id = p_user and s.status in ('trialing', 'active', 'past_due', 'unpaid')
    order by s.updated_at desc limit 1;
  update public.profiles set plan = v_plan, plan_renews_at = case when v_plan = 'pro' then v_renews else null end
    where id = p_user and (plan is distinct from v_plan or plan_renews_at is distinct from (case when v_plan = 'pro' then v_renews else null end));
  return v_plan;
end $$;

-- Re-checks every paying account. Run every hour (billing_cron.sql) so a grace period that runs out turns Pro off
-- even if Stripe sends nothing that day. Returns how many accounts changed.
create or replace function public.billing_refresh() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; v_before text;
begin
  for r in select distinct user_id from public.subscriptions loop
    select plan into v_before from public.profiles where id = r.user_id;
    if public.billing_apply_plan(r.user_id) is distinct from v_before then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function public.billing_has_pro(uuid), public.billing_apply_plan(uuid), public.billing_refresh() from public, anon, authenticated;
grant execute on function public.billing_has_pro(uuid), public.billing_apply_plan(uuid), public.billing_refresh() to service_role;

-- Handy later:
--   who is paying:            select s.user_id, p.username, s.status, s.plan, s.trial_end, s.current_period_end, s.cancel_at_period_end from subscriptions s left join profiles p on p.id = s.user_id order by s.updated_at desc;
--   failing payments:         select * from subscriptions where status in ('past_due', 'unpaid');
--   before going live, remove the test-mode rows (so a test subscription can't keep Pro on):
--     delete from subscriptions where not livemode;  delete from billing_customers where not livemode;  select public.billing_refresh();
