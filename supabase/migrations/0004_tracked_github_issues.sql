create table if not exists public.tracked_issues (
  id uuid primary key default gen_random_uuid(),
  changelog_entry_id uuid not null references public.changelog_entries(id) on delete cascade,
  installed_repository_id uuid not null references public.installed_repositories(id) on delete cascade,
  github_issue_id bigint not null unique,
  github_issue_number integer not null,
  github_issue_url text not null,
  github_issue_state text not null default 'open' check (github_issue_state in ('open', 'closed')),
  dismissed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tracked_issues enable row level security;

create policy "tracked_issues_select_own" on public.tracked_issues
  for select using (
    exists (
      select 1
      from public.installed_repositories repositories
      join public.github_app_installations installations
        on installations.installation_id = repositories.installation_id
      where repositories.id = tracked_issues.installed_repository_id
        and installations.user_id = auth.uid()
    )
  );

create index if not exists tracked_issues_changelog_entry_id_idx
  on public.tracked_issues(changelog_entry_id);

create index if not exists tracked_issues_installed_repository_id_idx
  on public.tracked_issues(installed_repository_id);

create index if not exists tracked_issues_active_idx
  on public.tracked_issues(github_issue_state, dismissed_at);
