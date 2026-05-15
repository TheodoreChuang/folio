# Folio — Application Architecture

## Pattern: Modular Monolith

Folio is a single deployable application with a single database, organised internally into
domain modules with enforced boundaries. This is a Modular Monolith.

The goal is not to avoid a monolith — a monolith is the right choice at this stage. The goal
is to avoid an *unstructured* monolith where domain logic bleeds across boundaries and every
future change becomes a risk. Clear module boundaries now make the application maintainable as
it grows, and make microservice extraction tractable if that day ever comes.

See `docs/data-model.md` for the domain boundaries and the principles that govern them.

---

## Why not microservices now?

Microservices solve problems Folio does not yet have: independent deployability, team autonomy,
scaling individual services. They introduce problems Folio cannot afford: distributed systems
complexity, network latency, cross-service transactions, operational overhead.

The Modular Monolith captures the structural discipline of microservices — clear boundaries,
domain ownership, explicit interfaces — without the operational cost. If a domain ever needs to
be extracted, the module is already the extraction unit.

---

## Two layers

Next.js App Router imposes one layer; Folio owns the other.

```
app/api/          ← HTTP transport layer. Next.js convention — cannot be changed.
                    Route handlers live here, organised by resource path.
                    app/api/properties/[id]/route.ts → /api/properties/:id

lib/              ← Domain logic layer + shared infrastructure. Folio convention.
                    Domain modules live in lib/{domain}/. Shared utilities at lib/ root.
```

These layers have different jobs and different owners. Never collapse them.

---

## Internal module structure

Each domain module in `lib/` follows a consistent internal structure, inspired by
hexagonal (Ports & Adapters) principles:

```
lib/{domain}/
  services/        ← business logic; no infrastructure imports
  repositories/    ← all data access for this domain (Drizzle queries only)
  index.ts         ← public API: the only file other modules may import
```

**Services** contain domain business logic. They are pure — they call repositories and
other services within the same module, nothing else. No Drizzle imports, no Supabase
imports. Pure TypeScript functions that are straightforward to unit test.

**Repositories** contain all database queries for the domain. They are the only layer
that imports from Drizzle or any other data source. If the ORM or database changes,
only repositories change.

**`index.ts`** is the module's public contract. It explicitly exports only what route
handlers or other modules are permitted to use. Internal files are not importable from
outside the module. This is the boundary enforcement mechanism.

---

## Shared infrastructure

Shared infrastructure utilities live at the `lib/` root and are importable by any layer:

```
lib/supabase/      ← Supabase client factories (auth, storage)
lib/db.ts          ← Drizzle client
lib/logger.ts      ← structured logging
lib/env.ts         ← environment variable access (server-only)
```

These are infrastructure, not domains. They have no `index.ts` boundary — import
directly from the file.

---

## Route handlers are thin adapters

Route handlers in `app/api/` have one job: translate between HTTP and domain logic.

```typescript
// app/api/properties/[id]/valuations/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1. Authenticate
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Parse and validate input
  const parsed = createValuationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  // 3. Call domain service via module public API
  const valuation = await createValuation(user.id, params.id, parsed.data)

  // 4. Return response
  return NextResponse.json({ valuation }, { status: 201 })
}
```

No business logic. No direct Drizzle queries. If a handler grows beyond this shape,
logic belongs in a service.

---

## Module communication

Modules communicate only through their `index.ts` public API, never by importing
internal files directly.

```
// ✓ correct
import { getLoansByProperty } from '@/lib/borrowings'

// ✗ wrong — bypasses module boundary
import { loanRepository } from '@/lib/borrowings/repositories/loans'
```

The Reporting module is the sole exception: it reads other domain tables directly via
SQL for cross-domain aggregation queries. SQL joins across tables are materially more
efficient than API aggregation for analytical workloads. All other modules never query
another module's tables. See `docs/data-model.md` — Principle 13.

---

## Module map

```
lib/property/          ← Property domain
lib/assets/            ← Assets domain (bank accounts, investments, super, vehicles)
lib/borrowings/        ← Borrowings domain (installment loans, revolving credit)
lib/income/            ← Income domain (PAYG, self-employed, other income)
lib/personal-finance/  ← Personal Finance domain (household budget estimates)
lib/reporting/         ← Reporting domain (cross-domain aggregation, live queries, AI commentary)
lib/ingestion/         ← Ingestion domain (document receipt, extraction staging, routing memory)
```

Identity (Supabase-managed) is not a domain module — it is shared infrastructure managed
externally. Users and auth live in Supabase; `lib/supabase/` contains only the client
factories that other modules use to interact with it.

---

## Microservice extraction

The module is the extraction unit. Each `lib/{domain}/` folder contains all business
logic, all data access, and a clear public API for that domain.

Extracting a domain to a microservice means:
1. Moving `lib/{domain}/` to a new service repository
2. Adding an HTTP transport layer wrapping the module's existing public API
3. Replacing direct DB access in the Reporting module with API calls to the new service

Domain code does not change. Route handlers in the new service wrap the same services.
The `index.ts` contract becomes the service's API contract.
