-- Run this once in your Supabase project's SQL editor
-- (Dashboard → SQL Editor → New query → paste this → Run)

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  caption text,
  story_mode text,
  char_type text,
  wardrobe text,
  villain_id text,
  villain_title text,
  avatar jsonb,
  photo_url text,
  episode2_unlocked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

-- Each signed-in user can only see, create, and update their own comics.
create policy "select own projects" on public.projects
  for select using (auth.uid() = owner_id);

create policy "insert own projects" on public.projects
  for insert with check (auth.uid() = owner_id);

create policy "update own projects" on public.projects
  for update using (auth.uid() = owner_id);
