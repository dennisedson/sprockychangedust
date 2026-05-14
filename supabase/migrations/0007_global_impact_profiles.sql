-- @workflow_state: REVIEW
create table if not exists public.changelog_impact_profiles (
  id uuid primary key default gen_random_uuid(),
  changelog_entry_id uuid not null unique references public.changelog_entries(id) on delete cascade,
  profile_cache_key text not null,
  analysis_method text not null default 'heuristic',
  target_versions text[] not null default '{}',
  affected_versions text[] not null default '{}',
  api_patterns text[] not null default '{}',
  file_markers text[] not null default '{}',
  function_calls text[] not null default '{}',
  scope_changes text[] not null default '{}',
  product_areas text[] not null default '{}',
  search_terms text[] not null default '{}',
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repository_manifests (
  installed_repository_id uuid primary key references public.installed_repositories(id) on delete cascade,
  manifest_hash text not null,
  platform_versions text[] not null default '{}',
  api_paths text[] not null default '{}',
  api_version_segments text[] not null default '{}',
  sdk_packages text[] not null default '{}',
  sdk_symbols text[] not null default '{}',
  scopes text[] not null default '{}',
  file_markers text[] not null default '{}',
  product_areas text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.changelog_impact_profiles enable row level security;
alter table public.repository_manifests enable row level security;

create policy "changelog_impact_profiles_read_authenticated"
  on public.changelog_impact_profiles
  for select to authenticated using (true);

create policy "repository_manifests_select_own"
  on public.repository_manifests
  for select using (
    exists (
      select 1
      from public.installed_repositories repositories
      join public.github_app_installations installations
        on installations.installation_id = repositories.installation_id
      where repositories.id = repository_manifests.installed_repository_id
        and installations.user_id = auth.uid()
    )
  );

create index if not exists changelog_impact_profiles_entry_idx
  on public.changelog_impact_profiles(changelog_entry_id);

create index if not exists repository_manifests_product_areas_idx
  on public.repository_manifests using gin(product_areas);

create index if not exists repository_manifests_api_version_segments_idx
  on public.repository_manifests using gin(api_version_segments);
