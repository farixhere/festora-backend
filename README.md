# Festora Backend

Festora's independent production API, deployed on Vercel and powered by Neon PostgreSQL.

## Production services

- Frontend: https://festoraa.vercel.app
- API: https://festora-backend-dupekingsam-7855.vercel.app/api/exec
- Health: https://festora-backend-dupekingsam-7855.vercel.app/api/health
- Database: Neon PostgreSQL
- Runtime: Node.js 20.x, Vercel Functions, TypeScript, Drizzle ORM

## API contract

- `GET /api/health` checks the API and database connection.
- `POST /api/exec` accepts the action-based JSON API used by the Festora frontend.
- Requests are validated server-side; authentication uses scrypt password hashes, hashed opaque sessions, and role-scoped festival memberships.
- Festival updates are written through ordered, idempotent operations with transactional snapshots and relational projections.

## Required environment variables

- `DATABASE_URL` — Neon pooled connection.
- `DATABASE_URL_UNPOOLED` — Neon direct connection for migrations.
- `AUTH_SECRET` — private authentication/OTP signing secret.
- `APP_ENV` — `production` in production.
- `CORS_ORIGINS` — exact allowed frontend origins.
- `RESEND_API_KEY` and `EMAIL_FROM` — required for email verification and new organiser signup.

## Payments

- Manual UPI claim/review is supported when `platform_settings.upi_id` is configured.
- Online checkout is intentionally disabled until a payment provider and verified webhook are configured.

## Development

1. Install Node.js 20.x.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Configure the environment variables above using development credentials.
5. Run `npm run dev`.
6. Run `npm run typecheck` before committing.

## Database migrations

- `npm run db:generate` generates Drizzle migrations.
- `npm run db:migrate` applies migrations using the direct Neon connection.

Never commit secrets, connection strings, or real environment files.
