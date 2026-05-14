alter table public.tracked_issues
  add column if not exists github_issue_assignees jsonb not null default '[]'::jsonb,
  add column if not exists github_issue_labels jsonb not null default '[]'::jsonb;
