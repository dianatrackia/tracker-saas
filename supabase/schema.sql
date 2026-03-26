-- =============================================
-- TRACKER SAAS - Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================
-- WORKSPACES (one per customer/site)
-- =============================================
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  domain      text,
  tracking_id text unique not null default 'trk_' || replace(gen_random_uuid()::text, '-', ''),
  plan        text not null default 'free', -- 'free', 'pro', 'enterprise'
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- =============================================
-- INTEGRATIONS (credentials per workspace)
-- =============================================
create table public.integrations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  type         text not null check (type in ('meta', 'activecampaign', 'mailchimp', 'stripe')),
  config       jsonb not null default '{}', -- encrypted credentials stored as JSON
  enabled      boolean not null default true,
  last_tested  timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (workspace_id, type)
);

-- =============================================
-- VISITORS (unique tracked users per workspace)
-- =============================================
create table public.visitors (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade not null,
  visitor_id    text not null,        -- first-party cookie value or fingerprint
  fingerprint   text,                 -- browser fingerprint hash
  ip            text,
  country       text,
  user_agent    text,
  email         text,                 -- enriched when lead is captured
  first_seen    timestamptz default now(),
  last_seen     timestamptz default now(),
  unique (workspace_id, visitor_id)
);

-- =============================================
-- EVENTS
-- =============================================
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  visitor_id   text not null,         -- references visitors.visitor_id
  session_id   text not null,
  event_name   text not null check (event_name in (
    'page_view',
    'scroll_25', 'scroll_50', 'scroll_75', 'scroll_100',
    'lead',
    'purchase'
  )),
  url          text,
  referrer     text,
  ip           text,
  user_agent   text,
  properties   jsonb not null default '{}',  -- extra data per event type
  -- Lead specific
  email        text,
  -- Purchase specific
  value        numeric,
  currency     text default 'USD',
  order_id     text,
  -- Verification
  verified     boolean default false,   -- verified by AC/Mailchimp/Stripe
  verified_by  text,                   -- 'activecampaign' | 'mailchimp' | 'stripe'
  created_at   timestamptz default now()
);

-- =============================================
-- EVENT FORWARDING LOG
-- =============================================
create table public.event_forwards (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references public.events(id) on delete cascade not null,
  integration text not null,          -- 'meta', 'activecampaign', etc.
  status      text not null check (status in ('success', 'error', 'skipped')),
  response    jsonb,
  error_msg   text,
  created_at  timestamptz default now()
);

-- =============================================
-- INDEXES for performance
-- =============================================
create index idx_events_workspace     on public.events(workspace_id);
create index idx_events_created_at    on public.events(created_at desc);
create index idx_events_visitor       on public.events(visitor_id);
create index idx_events_name          on public.events(event_name);
create index idx_visitors_workspace   on public.visitors(workspace_id);
create index idx_visitors_email       on public.visitors(email);
create index idx_forwards_event       on public.event_forwards(event_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
alter table public.workspaces    enable row level security;
alter table public.integrations  enable row level security;
alter table public.visitors      enable row level security;
alter table public.events        enable row level security;
alter table public.event_forwards enable row level security;

-- Workspaces: users can only see their own
create policy "Users see own workspaces"
  on public.workspaces for all
  using (auth.uid() = user_id);

-- Integrations: users can only manage their workspace integrations
create policy "Users manage own integrations"
  on public.integrations for all
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
    )
  );

-- Events: users can only see their workspace events
create policy "Users see own events"
  on public.events for all
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
    )
  );

-- Visitors: same as events
create policy "Users see own visitors"
  on public.visitors for all
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
    )
  );

-- Event forwards: same
create policy "Users see own forwards"
  on public.event_forwards for all
  using (
    event_id in (
      select e.id from public.events e
      join public.workspaces w on w.id = e.workspace_id
      where w.user_id = auth.uid()
    )
  );

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.handle_updated_at();

create trigger integrations_updated_at
  before update on public.integrations
  for each row execute function public.handle_updated_at();

-- Auto-create a default workspace when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.workspaces (user_id, name)
  values (new.id, 'Mi primer sitio');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
