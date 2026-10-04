# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Riff Valley App Backend - A NestJS REST API for the Riff Valley music review/catalog platform. Uses PostgreSQL with TypeORM for data persistence, JWT authentication with Passport, and i18n for internationalization.

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

### Organization for complex modules
Apply this convention when a module has enough responsibilities and auxiliary services to justify it. Keep the module root limited to its main files, keep root `__tests__/` for those main files, and organize each extracted responsibility with its own service, tests, and exclusive support files:

```text
src/<module>/
  <module>.controller.ts
  <module>.service.ts
  <module>.module.ts

  __tests__/
    <module>.controller.spec.ts
    <module>.service.spec.ts

  <responsibility>/
    <responsibility>.service.ts
    <responsibility>.service.spec.ts
    # helpers/constants used only by this responsibility

  dto/
  entities/
```

- Keep only the main controller, facade service, and module files at the module root. Keep shared DTOs in `dto/` and shared entities in `entities/`.
- Keep `__tests__/` at the module root only for tests of those main files and their facade/delegation behavior. Put each auxiliary service's spec and responsibility-exclusive helpers/constants beside that service in its responsibility folder.
- Do not create `shared/` in advance. Keep a helper with its responsibility while it is exclusive; move it to `shared/` only after real reuse by at least two responsibilities.
- Create fixtures or helpers inside `__tests__/` only when the volume of shared test support for the root-module tests justifies it.
- Do not create folders per endpoint, artificial architectural layers, or empty folders. Do not add auxiliary services to small modules just to match this layout.

### Progressive service extraction
When extracting a responsibility from a monolithic service, move its implementation to the corresponding responsibility folder and progressively move its specific tests to that service's adjacent spec. Keep the root service spec focused on facade delegation and facade behavior. Do not duplicate complete suites between the original and extracted services. Preserve contracts and behavior during extraction.

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

## Contract and integration findings

During any refactor, report a contract or integration finding before changing the affected behavior if you find an unusual or inconsistent HTTP contract; an oversized payload or legacy field; eager relations consumed implicitly by the frontend; relations included accidentally in responses; frontend calls that appear to compensate for a deficient contract; backend-calculated data discarded by the frontend; complex frontend transformations caused by the API shape; similar endpoints with incompatible contracts; confusing filter semantics; historical behavior forcing a clearly suboptimal implementation; a frontend/backend dependency preventing a reasonable optimization; or a possible improvement requiring changes in both repositories.

Do not silently change the contract or expand the current task. Describe the current behavior, why it appears problematic or inefficient, and the impact as **backend-only**, **frontend-only**, or **backend + frontend**. Explain the reasonable options and recommend one, including whether to preserve compatibility, create an independent contract task, or coordinate a backend/frontend refactor. Do not create a /v2, alternate endpoints, contract migrations, frontend adaptations, or cross-repository tasks automatically; these require an explicit decision. Detecting an oddity does not itself require creating a task: assess its relevance first, document minor findings when useful, and create future work only for a concrete improvement worth its cost.

Preserving the current contract is the default for an internal refactor, not a reason to build an artificial or clearly inefficient workaround. If the contract is the source of unnecessary work or complexity, report that instead of silently changing it or disguising it as an internal optimization. A coordinated backend/frontend refactor is valid when there is a concrete, justified improvement; do not choose a dual refactor for convenience. Continue the independent parts of the current task when they can be completed without deciding the finding. If it blocks a safe implementation, state that explicitly and do not perform the dependent change until a decision is made.

For eager-loading findings, identify the current cost, consumers, and a possible smaller alternative such as favoriteId, pendingId, commentCount, or another projection. State whether the alternative requires frontend work. Do not redesign the response automatically; keep compatibility until there is an explicit decision. In the Discs roadmap, follow the consumer classification and required sequence in D39–D44: characterize the response, load relations explicitly where needed, prove the response is unchanged, then consider removing eager loading.

Use this format when reporting a finding:

### Contract finding

**Current behavior:** Brief description.

**Problem:** What is unusual, costly, or hard to maintain.

**Impact:** Backend-only / frontend-only / backend + frontend.

**Options:**

1. Preserve compatibility.
2. Refactor internally.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** Preferred option and reason.

**Blocks the current task:** Yes / No, with a brief explanation.
