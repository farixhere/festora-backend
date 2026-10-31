# Festora Backend

A separate replacement API for Festora. This repository is intentionally developed and tested independently from the live frontend and the existing Google Apps Script backend.

## Stack

- Node.js 20+
- TypeScript
- Vercel Functions
- Neon PostgreSQL
- Drizzle ORM
- Zod request validation

## Safety boundary

- Do not change the Festora frontend API URL during development.
- Do not disable, delete, or modify the existing Google Apps Script deployment or spreadsheet.
- Use a separate Neon development/staging branch or project.
- Do not connect production data until a migration plan has been reviewed.
- Production cutover requires explicit approval.

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set the staging Neon pooled connection as `DATABASE_URL`.
5. Set the staging Neon direct connection as `DATABASE_URL_UNPOOLED`.
6. Set `CORS_ORIGINS` to the exact staging frontend origin(s).
7. Run `npm run dev`.

## Endpoints

- `GET /api/health` — reports service health and whether a database URL is configured.
- `POST /api/exec` — compatibility envelope for the current Festora frontend's action-based API.

The compatibility endpoint currently validates and recognises the existing action names, but intentionally returns `501 ACTION_NOT_IMPLEMENTED`. Individual actions will be enabled only after their request fields, response shape, permissions, and data effects have been verified.

## Database

The first schema migration establishes the platform foundation:

- users
- festivals
- festival memberships
- sessions
- festival operation log

Domain tables for registrations, participants, teams, programmes, schedules, judging, results, appeals, payments, and coupons will be designed from the existing frontend contract before implementation. The JSON operation payloads must not be guessed or silently discarded.

## Database commands

- `npm run db:generate` — generate Drizzle migrations.
- `npm run db:migrate` — apply migrations using the direct connection.
- `npm run typecheck` — TypeScript check.

Never commit real environment variables or database credentials.