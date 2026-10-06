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

### Services by responsibility

A service should represent a cohesive functional responsibility. When it combines distinct work such as catalog reads, writes, statistics, or external integrations, separate those responsibilities where the code and callers justify it. Do not create a class for every method or endpoint. Keep a facade when it preserves existing callers and makes an incremental migration simpler; delegate implementation without duplicating it.

Service size is a signal for review, not a fixed extraction rule. At roughly 300–400 lines, inspect whether the service still has one cohesive responsibility. A smaller service can still mix unrelated work, and a somewhat larger service can remain cohesive; do not split based on line count alone.

### Organization for complex modules

Apply this convention when a module has enough responsibilities and auxiliary services to justify it. Keep the module root limited to its main files, and organize each extracted responsibility with its own service and spec at that responsibility's root. Add `helpers/`, `loaders/`, or `__tests__/` subfolders when the amount of code or tests makes them useful:

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
    helpers/
    loaders/
    __tests__/  # when test volume justifies grouping, especially cross-piece integration

  dto/
  entities/
```

- Keep the main controller, facade service, and module at the module root. Keep shared DTOs in `dto/` and shared entities in `entities/`.
- Keep the main service and its spec together at the module root; keep an extracted service and its spec together at the root of its responsibility. Put tests for the main controller/facade/module in the module-root `__tests__/` when there is enough test support to justify that folder.
- Put responsibility-exclusive helpers and loaders with that responsibility. Pure mapping, grouping, normalization, calculation, and transformation functions may live in `helpers/`; do not extract trivial expressions into helpers. Split growing helpers by coherent responsibility instead of accumulating unrelated functions in a monolithic `*.helpers.ts` file. Give non-trivial helpers direct tests or clear nearby coverage.
- When one responsibility accumulates several independent queries, they may be organized as responsibility-specific `loaders/`. A loader is not a generic repository; do not add generic query/repository layers without a concrete shared use.
- Do not create `shared/` in advance or use it as a catch-all. Move code there only after real reuse by at least two responsibilities.
- Use subfolders when real code or test volume benefits from them. Avoid both very large flat folders and artificial nesting, per-endpoint folders, empty folders, or auxiliary services added only to satisfy a layout.

### Characterization and incremental extraction

Before moving or optimizing existing logic, add or identify tests that fix the behavior being changed. Characterize the relevant inputs, queries, payloads, errors, ordering, null versus zero/absence, relations, and side effects; cover the dimensions that apply to the operation. Build or typecheck alone does not establish behavioral equivalence.

Extract incrementally: first stabilize and characterize a functional block, then move it into a cohesive service, and afterwards clean up helpers, imports, and structure. Keep these steps separate when doing so makes regressions easier to attribute. Move implementation instead of copying it, update module providers and dependency injection, and preserve existing contracts unless a contract change is explicitly decided.

Move the implementation's specific tests with it to the service's adjacent spec. Keep facade specs focused on delegation and facade behavior; do not duplicate full characterizations after moving code. Place unit tests beside the piece they protect. PostgreSQL or other cross-cutting integration tests may live in `__tests__/` when they span multiple pieces. After extraction, review imports, types, exports, injected dependencies, providers, and stale references; keep cleanup separate from functional changes unless a demonstrated need requires combining them.

### Queries and performance

Optimize and measure SQL before introducing caching. Do not add indexes by intuition: tie each candidate to a real query and verify the plan with representative parameters and data using `EXPLAIN ANALYZE` before and after. Account for write and storage costs as well as read plans. A performance task may conclude with no production change when the evidence does not justify one. Avoid query rewrites or micro-optimizations that trade away clarity without a demonstrated benefit.

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

For eager-loading findings, identify the current cost, consumers, and a possible smaller alternative such as an ID, count, or another projection. State whether the alternative requires frontend work. Do not redesign the response automatically; keep compatibility until there is an explicit decision. Treat eager relations as part of the observable response until proven otherwise. Before removing one, identify its consumers and classify any unresolved consumer as observable but unconfirmed; characterize the current payload, add explicit relation loading where consumers need it, verify response equivalence, and only then remove eager loading. If a consumer remains observable but unconfirmed, preserve the eager relation.

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
