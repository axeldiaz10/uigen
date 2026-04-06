# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Setup (first time)
npm run setup          # install deps, generate Prisma client, run migrations

# Development
npm run dev            # dev server with Turbopack at localhost:3000
npm run dev:daemon     # background dev server, logs to logs.txt

# Build & production
npm run build
npm run start

# Testing
npm test               # run all tests with Vitest
npm test -- src/lib/file-system.test.ts  # run a single test file

# Database
npm run db:reset       # reset SQLite database (destructive)

# Linting
npm run lint
```

## Architecture Overview

UIGen is a three-panel AI-powered React component generator with live preview.

**Layout** (`src/app/main-content.tsx`): Resizable panels — left 35% is chat, right 65% is a tabbed Preview/Code view.

**Routing:**
- `/` — anonymous users see main UI; authenticated users redirect to their most recent project
- `/[projectId]` — protected, loads saved project state

**AI Chat** (`src/app/api/chat/route.ts`): Streams text via Vercel AI SDK (`streamText`). Uses `claude-haiku-4-5` by default; falls back to `MockLanguageModel` when `ANTHROPIC_API_KEY` is absent. On stream completion, saves messages + file state to the database.

**Two AI tools** operate on the virtual file system (not disk):
- `str_replace_editor` (`src/lib/tools/str-replace.ts`) — create, view, and edit files
- `file_manager` (`src/lib/tools/file-manager.ts`) — rename and delete files/directories

**Virtual File System** (`src/lib/file-system.ts`): In-memory Map-based tree. All "files" live here during a session. Serialized as JSON into the `Project.data` column on save.

**Live Preview** (`src/lib/transform/jsx-transformer.ts`): Babel standalone transforms JSX in-browser, injects an import map pointing to `esm.sh` CDN, then renders into an iframe. No build step for preview.

**Authentication** (`src/lib/auth.ts`, `src/middleware.ts`, `src/actions/`): JWT in httpOnly cookies (7-day expiry), bcrypt passwords, server actions for signUp/signIn/signOut. Minimum password length is 8 characters.

**Database** (`prisma/schema.prisma`): SQLite via Prisma.
```
User  → Projects (one-to-many, cascade delete)
Project: name, userId, messages (JSON), data (JSON)
```

**Provider fallback** (`src/lib/provider.ts`): When no API key is set, `MockLanguageModel` generates deterministic fake components (counter, form, card) so the app runs without credentials.

**Anonymous sessions** (`src/lib/anon-work-tracker.ts`): Work done before sign-in is stored in localStorage and can be migrated to a new project on registration.

## Key Conventions

- Path alias `@/*` maps to `src/*` (tsconfig).
- UI primitives come from Shadcn/UI (new-york style) under `src/components/ui/`.
- Tailwind v4 is used — configuration is CSS-first (`src/app/globals.css`), not `tailwind.config.js`.
- Tests use Vitest + jsdom + `@testing-library/react`. Test files live alongside source in `__tests__/` subdirectories.
- Prisma client is generated into `src/generated/prisma/` (non-standard output path, set in `schema.prisma`).
