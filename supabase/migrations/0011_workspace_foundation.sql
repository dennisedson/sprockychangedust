-- @workflow_state: REVIEW
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  personal_owner_user_id uuid unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.github_app_installations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table public.user_notification_settings
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.user_notification_settings
  drop constraint if exists user_notification_settings_user_id_key;

insert into public.workspaces (name, personal_owner_user_id)
select
  coalesce(nullif(split_part(users.email, '@', 1), ''), 'personal') || ' workspace',
  users.id
from auth.users users
where not exists (
  select 1
  from public.workspaces workspaces
  where workspaces.personal_owner_user_id = users.id
);

insert into public.workspace_memberships (workspace_id, user_id, role)
select workspaces.id, workspaces.personal_owner_user_id, 'owner'
from public.workspaces workspaces
where workspaces.personal_owner_user_id is not null
on conflict (workspace_id, user_id) do nothing;

update public.github_app_installations installations
set
  workspace_id = workspaces.id,
  updated_at = now()
from public.workspaces workspaces
where installations.user_id = workspaces.personal_owner_user_id
  and installations.workspace_id is null;

update public.user_notification_settings settings
set
  workspace_id = workspaces.id,
  updated_at = now()
from public.workspaces workspaces
where settings.user_id = workspaces.personal_owner_user_id
  and settings.workspace_id is null;

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;

create policy "workspaces_select_member" on public.workspaces
  for select using (
    exists (
      select 1
      from public.workspace_memberships memberships
      where memberships.workspace_id = workspaces.id
        and memberships.user_id = auth.uid()
    )
  );

create policy "memberships_select_own" on public.workspace_memberships
  for select using (user_id = auth.uid());

create policy "installations_select_workspace_member" on public.github_app_installations
  for select using (
    exists (
      select 1
      from public.workspace_memberships memberships
      where memberships.workspace_id = github_app_installations.workspace_id
        and memberships.user_id = auth.uid()
    )
  );

create policy "repositories_select_workspace_member" on public.installed_repositories
  for select using (
    exists (
      select 1
      from public.github_app_installations installations
      join public.workspace_memberships memberships
        on memberships.workspace_id = installations.workspace_id
      where installations.installation_id = installed_repositories.installation_id
        and memberships.user_id = auth.uid()
    )
  );

create policy "repositories_update_workspace_member" on public.installed_repositories
  for update using (
    exists (
      select 1
      from public.github_app_installations installations
      join public.workspace_memberships memberships
        on memberships.workspace_id = installations.workspace_id
      where installations.installation_id = installed_repositories.installation_id
        and memberships.user_id = auth.uid()
        and memberships.role in ('owner', 'admin')
    )
  );

create policy "impacts_select_workspace_member" on public.repository_impacts
  for select using (
    exists (
      select 1
      from public.installed_repositories repositories
      join public.github_app_installations installations
        on installations.installation_id = repositories.installation_id
      join public.workspace_memberships memberships
        on memberships.workspace_id = installations.workspace_id
      where repositories.id = repository_impacts.installed_repository_id
        and memberships.user_id = auth.uid()
    )
  );

create policy "tracked_issues_select_workspace_member" on public.tracked_issues
  for select using (
    exists (
      select 1
      from public.installed_repositories repositories
      join public.github_app_installations installations
        on installations.installation_id = repositories.installation_id
      join public.workspace_memberships memberships
        on memberships.workspace_id = installations.workspace_id
      where repositories.id = tracked_issues.installed_repository_id
        and memberships.user_id = auth.uid()
    )
  );

create policy "repository_manifests_select_workspace_member" on public.repository_manifests
  for select using (
    exists (
      select 1
      from public.installed_repositories repositories
      join public.github_app_installations installations
        on installations.installation_id = repositories.installation_id
      join public.workspace_memberships memberships
        on memberships.workspace_id = installations.workspace_id
      where repositories.id = repository_manifests.installed_repository_id
        and memberships.user_id = auth.uid()
    )
  );

create index if not exists github_app_installations_workspace_id_idx
  on public.github_app_installations(workspace_id);

create index if not exists workspace_memberships_user_id_idx
  on public.workspace_memberships(user_id);

create unique index if not exists user_notification_settings_user_workspace_idx
  on public.user_notification_settings(user_id, workspace_id);
