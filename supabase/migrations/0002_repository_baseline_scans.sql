alter table public.installed_repositories
  add column if not exists has_hubspot_usage boolean not null default false,
  add column if not exists latest_scan_signals jsonb not null default '[]'::jsonb;

create index if not exists installed_repositories_has_hubspot_usage_idx
  on public.installed_repositories(has_hubspot_usage);
