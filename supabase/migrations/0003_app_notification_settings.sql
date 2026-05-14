create table if not exists public.app_notification_settings (
  id boolean primary key default true check (id),
  email_address text,
  notify_via_email boolean not null default true,
  notify_via_github_issue boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_notification_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.app_notification_settings enable row level security;
