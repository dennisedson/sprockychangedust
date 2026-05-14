# Sprocky Changedust MVP

AI-assisted HubSpot Developer Changelog monitoring for connected GitHub repositories.

## MVP scope

- Supabase Auth for accounts.
- GitHub App installation for repository access.
- Vercel Cron ingestion of the public HubSpot Developer Changelog RSS feed.
- LLM classification of changelog entries.
- Repository scanning with manifest checks plus lightweight source-pattern checks.
- Email alerts and optional GitHub issue creation for impacted repositories.

HubSpot OAuth, lead capture, and CRM sync are intentionally out of MVP scope.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in Supabase, GitHub App, Resend, and OpenAI values.
3. Run the Supabase migrations in `supabase/migrations/` in filename order.
4. Install dependencies and start the app:

```bash
npm install
npm run dev
```

This app pins npm to the public registry in `.npmrc` because this workspace may default to an internal registry that does not resolve public Vercel/Next dependencies reliably.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```
