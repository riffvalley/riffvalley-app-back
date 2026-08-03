# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SpamMusic Backend - A NestJS REST API for a music review/catalog platform (Riff Valley). Uses PostgreSQL with TypeORM for data persistence, JWT authentication with Passport, and i18n for internationalization.

## Common Commands

```bash
# Development
npm run start:dev          # Start with hot-reload (also watches i18n files)
npm run build              # Build for production

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:e2e           # Run e2e tests (uses test/jest-e2e.json)

# Linting
npm run lint               # Run ESLint with auto-fix

# Database Migrations
npm run migration:generate src/migrations/MigrationName  # Generate migration from entity changes
npm run migration:run      # Run pending migrations
npm run migration:revert   # Revert last migration
```

## Architecture

### Module Structure
Each feature follows a standard NestJS module pattern in `src/<feature>/`:
- `<feature>.module.ts` - Module definition importing TypeORM entity and AuthModule
- `<feature>.controller.ts` - REST endpoints
- `<feature>.service.ts` - Business logic using injected TypeORM repositories
- `entities/<feature>.entity.ts` - TypeORM entity definition
- `dto/` - Request/response DTOs with class-validator decorators

### Authentication & Authorization
- JWT-based auth via `@nestjs/passport` with 24h token expiry
- Use `@Auth()` decorator from `src/auth/decorators/auth.decorator.ts` to protect routes
- Valid roles: `admin`, `superUser`, `user`, `riffValley` (from `src/auth/interfaces/valid-roles.ts`)
- Get current user with `@GetUser()` decorator

### Key Patterns
- Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` strips unknown properties
- API prefix: `/api` (set in `main.ts`)
- i18n: Use `x-custom-lang` header for language selection (en/es)
- TypeORM synchronize is OFF; always use migrations for schema changes

### Working against production (Heroku)

Prod is `spammusic-back` on Heroku (`heroku` CLI, app name `spammusic-back`), deployed by pushing to `origin/main` on GitHub (auto-deploy webhook runs migrations in the release phase).

**Never run anything against prod beyond read-only checks.** No `curl` with POST/PATCH/PUT/DELETE against prod endpoints, no `heroku pg:psql` writes, no manual data mutation — not even "just to verify the fix works end-to-end". Verify new endpoints and migrations locally first (`docker compose up`, or the local Postgres containers already running — check `docker ps`), and only let real traffic (or an explicit, user-approved smoke test) exercise mutating endpoints in prod. `GET` requests / `heroku config`/`heroku releases`/`heroku logs` style inspection is fine without asking.

### Environment Variables
Required in `.env` (see `.env.template`):
- `STAGE` - `dev` or `prod` (controls SSL and logging)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`
- `JWT_SECRET`
- `PORT` (defaults to 3000)

### Core Domain Entities
- `Disc` - Music albums with artist relations
- `Artist` - Musicians/bands with country/genre relations
- `User` - Users with roles, can have rates, favorites, comments
- `List` - Curated music lists linked to content/reunions
- `Content` - Platform content (articles, videos, meetings)
- `Version` - Content versions with items for workflow tracking
