-- @workflow_state: REVIEW
alter table public.app_notification_settings
  alter column notify_via_github_issue set default false;

alter table public.user_notification_settings
  alter column notify_via_github_issue set default false;

update public.app_notification_settings
set notify_via_github_issue = false,
    updated_at = now()
where notify_via_github_issue = true;

update public.user_notification_settings
set notify_via_github_issue = false,
    updated_at = now()
where notify_via_github_issue = true;
