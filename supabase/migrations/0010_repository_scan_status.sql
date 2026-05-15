-- @workflow_state: REVIEW
alter table public.installed_repositories
  add column if not exists scan_status text not null default 'pending'
    check (scan_status in ('pending', 'scanning', 'complete', 'failed'));

alter table public.installed_repositories
  add column if not exists last_scan_error text;

update public.installed_repositories
set scan_status = case
    when last_scanned_at is not null then 'complete'
    else 'pending'
  end
where scan_status = 'pending';

create index if not exists installed_repositories_scan_status_idx
  on public.installed_repositories(scan_status);
