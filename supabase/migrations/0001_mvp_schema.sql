create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  title text,
  company text,
  location text,
  github_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  guid text not null unique,
  title text not null,
  link text not null,
  publication_date timestamptz not null,
  raw_content text not null default '',
  status text not null default 'new' check (status in ('new', 'analyzed', 'notified')),
  ai_summary text,
  ai_classification text check (ai_classification in ('breaking', 'enhancement', 'informational')),
  ai_severity_level text check (ai_severity_level in ('red', 'amber', 'green')),
  migration_steps text[] not null default '{}',
  impacted_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.github_app_installations (
  id uuid primary key default gen_random_uuid(),
  installation_id bigint not null unique,
  github_account_login text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installed_repositories (
  id uuid primary key default gen_random_uuid(),
  installation_id bigint not null references public.github_app_installations(installation_id) on delete cascade,
  github_repo_id bigint not null unique,
  repo_name text not null,
  repo_private boolean not null default true,
  is_active_for_scanning boolean not null default true,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email_address text,
  notify_via_email boolean not null default true,
  notify_via_github_issue boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repository_impacts (
  id uuid primary key default gen_random_uuid(),
  changelog_entry_id uuid not null references public.changelog_entries(id) on delete cascade,
  installed_repository_id uuid not null references public.installed_repositories(id) on delete cascade,
  has_hubspot_usage boolean not null default false,
  scan_signals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.github_app_installations enable row level security;
alter table public.installed_repositories enable row level security;
alter table public.user_notification_settings enable row level security;
alter table public.repository_impacts enable row level security;
alter table public.changelog_entries enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (user_id = auth.uid());

create policy "profiles_upsert_own" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "settings_select_own" on public.user_notification_settings
  for select using (user_id = auth.uid());

create policy "settings_upsert_own" on public.user_notification_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "installations_select_own" on public.github_app_installations
  for select using (user_id = auth.uid());

create policy "repositories_select_own" on public.installed_repositories
  for select using (
    exists (
      select 1
      from public.github_app_installations installations
      where installations.installation_id = installed_repositories.installation_id
        and installations.user_id = auth.uid()
    )
  );

create policy "repositories_update_own" on public.installed_repositories
  for update using (
    exists (
      select 1
      from public.github_app_installations installations
      where installations.installation_id = installed_repositories.installation_id
        and installations.user_id = auth.uid()
    )
  );

create policy "changelog_entries_read_authenticated" on public.changelog_entries
  for select to authenticated using (true);

create policy "impacts_select_own" on public.repository_impacts
  for select using (
    exists (
      select 1
      from public.installed_repositories repositories
      join public.github_app_installations installations
        on installations.installation_id = repositories.installation_id
      where repositories.id = repository_impacts.installed_repository_id
        and installations.user_id = auth.uid()
    )
  );

create index if not exists changelog_entries_status_idx on public.changelog_entries(status);
create index if not exists installed_repositories_installation_id_idx on public.installed_repositories(installation_id);
create index if not exists repository_impacts_changelog_entry_id_idx on public.repository_impacts(changelog_entry_id);
