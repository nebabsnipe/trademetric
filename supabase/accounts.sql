-- TradeMetric: usernames + password sign-in.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. (Safe to run again.)

create extension if not exists pgcrypto with schema extensions;

-- Usernames, created automatically when someone signs up
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'username' then
    insert into public.profiles (id, username) values (new.id, lower(new.raw_user_meta_data->>'username'));
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is a username free? (used on the sign-up form)
create or replace function public.username_available(p_username text) returns boolean
language sql security definer set search_path = public stable as $$
  -- Your own username never counts as taken, or you could not re-save it.
  select not exists (
    select 1 from public.profiles
    where username = lower(p_username) and (auth.uid() is null or id <> auth.uid()));
$$;

-- Sign in with a username: returns the account email only when the password is right.
-- 10 wrong passwords for a username locks it for 15 minutes.
create table if not exists public.login_attempts (username text not null, at timestamptz not null default now());
alter table public.login_attempts enable row level security;

create or replace function public.login_email(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_email text; v_hash text; v_fails int;
begin
  delete from public.login_attempts where at < now() - interval '1 day';
  select count(*) into v_fails from public.login_attempts
    where username = lower(p_username) and at > now() - interval '15 minutes';
  if v_fails >= 10 then raise exception 'Too many wrong passwords. Try again in 15 minutes.'; end if;
  select u.email, u.encrypted_password into v_email, v_hash
    from auth.users u join public.profiles p on p.id = u.id
    where p.username = lower(p_username);
  if v_email is null or v_hash is null or extensions.crypt(p_password, v_hash) <> v_hash then
    insert into public.login_attempts (username) values (lower(p_username));
    return null;
  end if;
  return v_email;
end $$;

revoke all on function public.login_email(text, text) from public;
revoke all on function public.username_available(text) from public;
grant execute on function public.login_email(text, text) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
