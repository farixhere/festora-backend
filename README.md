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

## Staging implementation status

The staging API implements the frontend's `POST /api/exec` envelope and currently includes:
- Scrypt password hashing, email OTP verification, opaque hashed sessions, logout and password-change session revocation.
- Festival creation, membership-scoped access, role-aware login, user management and soft deletion.
- Server-side execution of the existing 35 festival reducer operations, with server-derived actor metadata.
- Transactional festival operation sequencing, idempotent client operation IDs, and a JSONB festival-state snapshot in Neon.
- Public festival reads with open/results/code/closed modes.
- Plan, free-trial, coupon, manual UPI claim and owner payment-review flows.
- Visitor analytics and owner dashboard data.
- Health endpoint and strict TypeScript build check.

The festival snapshot and ordered operation log are the authoritative sync store today. The relational domain tables are created and seeded for plan reference data; full normalized projection writes and object-storage migration for large image assets remain follow-up work.

## Required staging configuration

Already configured in Vercel Preview/Development: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `APP_ENV`, and `CORS_ORIGINS`.

Still required before real public signup/payment workflows:
- `RESEND_API_KEY`: Resend sending key.
- `EMAIL_FROM`: sender address on a verified Resend domain.
- A UPI ID in `platform_settings` under key `upi_id` to enable the existing manual UPI flow.
- Payment gateway credentials and verified webhook handling before enabling online checkout. Until then, online checkout is deliberately disabled; manual UPI claims require owner review.

The backend Vercel project currently has Vercel Authentication (SSO) protection enabled. A public browser frontend cannot call it until that protection is explicitly disabled for the staging backend or a suitable custom domain/protection arrangement is configured. Do not expose a Vercel protection-bypass token in frontend code.

The existing Apps Script endpoint and the frontend's default branch remain untouched. The separate frontend branch `backend-staging` points to the staging API alias; do not merge it to `main` until the end-to-end checks pass.
