-- TradeMetric accounts, part 2: social sign-in usernames, username changes, plans, account deletion.
-- Run once in Supabase after accounts.sql: SQL Editor -> New query -> paste -> Run. (Safe to run again.)

-- People who sign in with Google / Apple / Discord pick a username afterwards, and anyone can change theirs.
-- Column grants mean a user can only ever write their own id and username, never their plan.
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

-- Subscription plan, for later. Everyone starts on 'free' (shown as the Beta plan).
-- Only the server (service role, e.g. a Stripe webhook) can change it.
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists plan_renews_at timestamptz;

-- Delete my account: removes the sign-in, profile and saved leagues (they cascade).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
