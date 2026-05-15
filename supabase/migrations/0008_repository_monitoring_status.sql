-- @workflow_state: REVIEW
alter table public.installed_repositories
  add column if not exists monitoring_status text not null default 'pending'
    check (monitoring_status in ('pending', 'watched', 'ignored'));

update public.installed_repositories
set monitoring_status = 'watched'
where has_hubspot_usage = true
  and monitoring_status = 'pending';

create index if not exists installed_repositories_monitoring_status_idx
  on public.installed_repositories(monitoring_status);
