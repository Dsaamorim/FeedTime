create extension if not exists "pgcrypto";

create table if not exists public.time_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null check (platform in ('facebook', 'linkedin')),
  log_date    date not null,
  seconds     integer not null check (seconds > 0 and seconds <= 3600),
  created_at  timestamptz not null default now()
);

create index if not exists time_logs_user_date_idx
  on public.time_logs (user_id, log_date, platform);

alter table public.time_logs enable row level security;

create policy "select own logs"
  on public.time_logs for select
  using (auth.uid() = user_id);

create policy "insert own logs"
  on public.time_logs for insert
  with check (auth.uid() = user_id);

create or replace view public.daily_totals as
  select user_id, log_date, platform, sum(seconds)::integer as seconds
  from public.time_logs
  group by user_id, log_date, platform;

alter view public.daily_totals set (security_invoker = on);
