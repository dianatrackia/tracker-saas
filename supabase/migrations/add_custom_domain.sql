-- =============================================
-- MIGRATION: Add custom_domain to workspaces
-- Run this in Supabase SQL Editor
-- =============================================

alter table public.workspaces
  add column if not exists custom_domain text unique,
  add column if not exists custom_domain_verified boolean not null default false;

create index if not exists idx_workspaces_custom_domain
  on public.workspaces(custom_domain)
  where custom_domain is not null;

-- Allow /api/collect to look up workspace by custom domain (service role already bypasses RLS)
comment on column public.workspaces.custom_domain is
  'Customer subdomain for first-party CNAME proxy, e.g. track.theirdomain.com';
