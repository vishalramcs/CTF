# SPIDEY tracXer — Search the SpiderXman

Spider-Man–themed beginner CTF for a live 75-minute college event (EYE club, PSG Tech). Next.js 15 + Supabase on Vercel.

## Prerequisites
- Node 20.12+ and pnpm
- A Supabase project **for development only**. Tests and `pnpm seed` wipe its app tables, so never use the event project. Docker isn't needed.

## Setup
```bash
pnpm install
pnpm gen-secrets > .env.local     # then fill in the Supabase values below
pnpm db:push                      # applies supabase/migrations/
pnpm seed                         # 1 admin, 10 test teams, practice + 10 placeholder challenges
pnpm dev
```

Values to fill in `.env.local`, from the Supabase dashboard:

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service role key |
| `DATABASE_URL` | Connect → Transaction pooler (port 6543) |
| `DIRECT_DATABASE_URL` | Connect → Session pooler (port 5432) |
| `WIPEABLE_DB_REF` | The dev project's ref, which allows seed and tests to wipe it |

Percent-encode any special characters in the database password.

## Scripts
| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` | Run or build the app |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code checks and formatting |
| `pnpm test` | Unit and integration tests. Needs `.env.local` and **wipes the dev app tables**, so run `pnpm seed` afterwards |
| `pnpm db:push` | Applies migrations to `DIRECT_DATABASE_URL` |
| `pnpm seed` | Wipes and reloads dev data. Writes `seed-output/` (gitignored). Refuses other databases unless `--force` |
| `pnpm gen-secrets` | Prints a `.env.local` block with fresh secrets |
| `pnpm bench:argon2` | Times one hash and 100 concurrent hashes for each profile in TRD §5.1 |

## Folder map
```text
docs/                 PRD, TRD, app flow, design brief, schema, implementation plan
supabase/migrations/  SQL source of truth (never use drizzle-kit push)
scripts/              seed, gen-secrets, db-push, bench-argon2
src/lib/              env, db, crypto, auth, flags, variants
tests/                unit and integration
QUESTIONS_TEMPLATE.md format for the organisers' questions
```

## Docs
[PRD](docs/01-PRD.md) · [TRD](docs/02-TRD.md) · [App flow](docs/03-App-Flow.md) · [Design brief](docs/04-Design-Brief.md) · [Backend schema](docs/05-Backend-Schema.md) · [Implementation plan](docs/06-Implementation-Plan.md)
