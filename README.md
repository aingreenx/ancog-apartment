# Ancog Apartment

[![CI](https://github.com/aingreenx/ancog-apartment/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aingreenx/ancog-apartment/actions/workflows/ci.yml)

A digital version of the paper ledger for a 13-room apartment. It's built for a real
user: my mom, who runs the apartment and has kept every tenant's rent, electricity
readings and payments in a notebook for years.

The app does what the notebook does, without the arithmetic:

- **Admins** (2) record meter readings, payments (cash or GCash) and charges, and see
  who owes what, from their phone or a desktop.
- **Tenants** sign in to see their own bills, readings (with the meter photo), payments
  and receipts, and can submit GCash payments for an admin to confirm.

The full set of rules, from electricity billing and due dates to partial payments and
move-out, is in [docs/database-design.md](docs/database-design.md).

## Tech stack

| Part     | Choice                               | Why                                                                                                                                                        |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App      | Next.js 16 (App Router) + TypeScript | One codebase for the admin screens and the tenant portal; server code (auth checks, money logic) stays on the server.                                      |
| Styling  | Tailwind CSS 4                       | Fast to build mobile-first screens; most use will be on a phone.                                                                                           |
| Database | Supabase (Postgres)                  | Real SQL for money: constraints, triggers and views keep the ledger correct even if app code has a bug.                                                    |
| Auth     | Supabase Auth                        | Email/password with sessions in cookies. Admins create tenant accounts; there's no public sign-up.                                                         |
| Security | Postgres row-level security          | Tenants can only ever read their own rows, enforced by the database itself rather than by each page.                                                       |
| Files    | Supabase Storage                     | Meter photos, GCash payment proofs and receipt PDFs, in private buckets with the same per-tenant rules.                                                    |
| Tests    | Vitest + pgTAP + Playwright          | Vitest for the billing math (checked against a real notebook page); pgTAP for the database rules and RLS; Playwright for the main flows in a real browser. |
| CI       | GitHub Actions                       | Lint, typecheck, unit tests, build, and the database tests on every push and pull request. `main` only accepts green PRs.                                  |

Money is always stored as whole centavos (`bigint`), and money rows are never edited or
deleted, only voided with a reason, so the history is as trustworthy as the notebook.

## Run it locally

You need **Node.js 22+**, **Docker Desktop** (running), and Git.

```bash
git clone https://github.com/aingreenx/ancog-apartment.git
cd ancog-apartment
npm install

npm run db:start          # starts Supabase in Docker (first run downloads images)
cp .env.example .env.local
```

Fill in `.env.local` with the `API_URL` and `ANON_KEY` that `npm run db:start` printed
(run `npx supabase status` to see them again), then:

```bash
npm run dev               # http://localhost:3000
```

The database starts with demo data from [supabase/seed.sql](supabase/seed.sql). Every
name and number in it is made up. Local logins (password `password123`):

| Login                | Role                                  |
| -------------------- | ------------------------------------- |
| `admin1@ancog.local` | Admin                                 |
| `admin2@ancog.local` | Admin                                 |
| `room3-frannie-4612` | Tenant (room 3, the notebook numbers) |
| `room5-bert-2231`    | Tenant (room 5, behind on payments)   |
| `room8-carla-7780`   | Tenant (room 8, must change password) |
| `room12-dino-5093`   | Tenant (room 12, has credit)          |

Useful extras:

- Supabase Studio (browse the database): http://localhost:54323
- `npm run db:reset`: rebuild the database from the migrations and the seed
- `npm run db:types`: regenerate `src/lib/database.types.ts` after changing the schema
- `npm run db:stop`: stop the Docker containers

> **Windows:** open the project folder with an uppercase drive letter (`D:\…`, not
> `d:\…`). A lowercase drive letter makes Vitest load itself twice and fail.

## Tests and checks

```bash
npm test                  # Vitest: billing math and login helpers
npm run test:watch        # same, re-running on save
npm run db:test           # pgTAP: schema rules + row-level security (needs db:start)
npm run test:e2e          # Playwright: main flows in a phone-sized browser (see below)
npm run lint
npm run typecheck
npm run format            # Prettier (format:check to only check)
```

CI runs all of these on every push and pull request.

**Browser tests** (`e2e/`) run against a production build and the local database with its
seed data. They add tenants and payments, so reset first:

```bash
npm run db:reset
npm run build
npx playwright install chromium   # once; or E2E_CHANNEL=msedge / chrome to use an installed browser
npm run test:e2e                   # starts the app on port 3100 (reuses one already running)
```

They cover: the admin moves in a tenant, records a reading and a payment, and a receipt PDF
is issued; a tenant sees only their own bills, pays by GCash and the admin confirms it; a
tenant can't open admin pages or another tenant's receipt.

## Project layout

```
src/
  app/                    pages: /login, /change-password, /admin, /portal
  lib/billing/            pure billing functions + tests (electricity, balances, allocation, move-out)
  lib/auth/               login helpers, session checks, server actions
  lib/supabase/           Supabase clients for the browser and the server
  proxy.ts                refreshes the session and keeps signed-out users out
supabase/
  migrations/             the database schema and security rules
  tests/                  pgTAP tests
  seed.sql                demo data (fake people only)
e2e/                      Playwright browser tests
docs/database-design.md   business rules and tables
docs/deploy.md            going live: hosting, production database, backups
```

Never commit real tenant names, phone numbers or addresses.
