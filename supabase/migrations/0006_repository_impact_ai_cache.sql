-- @workflow_state: REVIEW
alter table public.repository_impacts
  add column if not exists analysis_method text not null default 'scanner',
  add column if not exists analysis_cache_key text,
  add column if not exists match_reason text,
  add column if not exists match_confidence numeric;

delete from public.repository_impacts older
using public.repository_impacts newer
where older.ctid < newer.ctid
  and older.changelog_entry_id = newer.changelog_entry_id
  and older.installed_repository_id = newer.installed_repository_id;

create unique index if not exists repository_impacts_entry_repository_idx
  on public.repository_impacts(changelog_entry_id, installed_repository_id);

create table if not exists public.ai_batch_jobs (
  id uuid primary key default gen_random_uuid(),
  openai_batch_id text not null unique,
  input_file_id text not null,
  output_file_id text,
  job_type text not null check (job_type in ('repository_impact')),
  status text not null default 'validating',
  request_count integer not null default 0,
  requests jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.ai_batch_jobs enable row level security;

create index if not exists ai_batch_jobs_status_idx
  on public.ai_batch_jobs(status);
