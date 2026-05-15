# Folio — Data Model Principles & Domain Design

This document captures the guiding principles and architectural decisions for Folio's data model.
It is written from the perspective of the ideal end-state. Not every domain or table described here
is implemented yet — that is intentional. The boundaries are defined now; the implementation grows
into them as the product warrants.

---

## Guiding Principles

### 1. Domain = future microservice boundary

Design each domain so it could be extracted into its own service with minimal cross-service
coupling. The test: *if this domain were owned by a separate team, what data would they need to
own entirely?*

Domain boundaries are the expensive thing to get wrong — they affect API design, data ownership,
and any future splitting. Get them right early. Tables within a domain can be added incrementally.

### 2. Lock the boundaries, defer the implementation

Two rules follow from principle 1:

- **If you're unsure whether a table belongs to domain A or domain B — that's a boundary problem.
  Resolve it now.** Fuzzy boundaries become painful migrations later.
- **If you're unsure whether to build a table today or later — defer it.** Tables within a
  correctly-bounded domain can be added any time without affecting other domains.

### 3. Entities with different attributes get different tables

Use domain-specific tables when entities carry meaningfully different data and business rules.
A property (address, valuation, depreciation, ownership splits) is not the same shape as a bank
account (BSB, account number, balance) or a loan (lender, rate type, LVR, repayment schedule).
Forcing unlike things into a shared table produces sparse columns or JSONB — both signal a missed
boundary.

Use a shared generic table with a type discriminator when entities are genuinely uniform in
structure and differ only in classification (e.g. government benefit types, business income
distributions).

### 4. Every financial entity follows the three-layer pattern

Any domain object that represents a financial entity should be designed to support three layers,
built when needed:

```
entity              — the thing (attributes, metadata, configuration)  [entity table]
entity_valuations   — time-varying balance or value snapshots          [snapshot table]
entity_ledger       — the financial event stream                       [ledger table]
```

Not all layers are built on day one, but the schema should never paint itself into a corner that
prevents adding them. Almost everything in finance eventually has a transaction stream.

See principle 15 and `docs/conventions.md §8` for the mutability rules that govern each layer.

### 5. Transactions follow their domain

Each domain object that generates a financial event stream owns its transaction table.
Transactions for different domains look similar (date, amount, description) but carry
domain-specific fields and business rules:

- A rent transaction drives yield calculations
- A loan transaction carries a principal/interest/fees split that other transaction types do not
- A payslip transaction carries gross/tax/net breakdown

Merging these into one table moves that domain logic into the application layer where it
cannot be enforced.

### 6. Categorisation is reference data, not domain entities

Each transaction type has its own category taxonomy — property transactions use property
categories (rent, management, repairs, rates); personal finance uses lifestyle categories
(groceries, entertainment, utilities). These are not one shared list.

Categories are reference data: they carry no lifecycle, relationships, or business rules — they
are labels. Implement as enums or simple lookup tables. No business logic attaches to the
category itself; the logic lives in the domain that uses it.

### 7. Cross-domain relationships are explicit junction tables

When two domains need to reference each other, model the relationship explicitly rather than
embedding a foreign key inside one domain's table. The junction table sits at the boundary and
travels with whichever domain logically owns the relationship.

```
loan_property_securities (loan_id, property_id)   — owned by Borrowings domain
property_ownerships      (property_id, entity_id, ownership_percentage)
```

### 8. Derived data is projected, not duplicated

Asset-derived income (rent, dividends, bank interest) is stored only as transactions in the
asset's domain. The Income view in the UI aggregates these at read time — no separate income
entity is created, no data is duplicated into the Income domain.

The Income domain only owns income that has no parent asset: PAYG, self-employed, business
distributions, government benefits. If an income stream has a parent asset, it belongs to that
asset's domain and is projected into Income views at the API/UI layer.

### 9. Time-varying state gets snapshot tables

Never store a mutable "current value" column on a main entity row for values that change
independently of transactions. Property market value, loan balance, account balance — these
all change between transactions. Each gets a dedicated snapshot table:

```
property_valuations   (property_id, valued_at, value_cents)
loan_balances         (loan_id, recorded_at, balance_cents)
```

### 10. The "account" abstraction is a UI concept, not a schema concept

Presenting all financial entities as uniform "cards" (Assets / Borrowings / Income / Expenses)
is a useful UX pattern. It is not a schema pattern. A `financial_accounts` parent table with a
type discriminator couples all domains at the database layer — the opposite of microservice
readiness. A property and a bank account share a presentation metaphor; they do not share a
table.

Each domain exposes a consistent API interface (`/summary`, `/transactions`, `/balance`). The
uniformity lives in the interface contract, not in shared storage.

### 11. A domain is something you build features around

The distinction between a domain and supporting context:

- **Domain**: the application builds features around it; it has its own CRUD, business rules,
  and transaction stream.
- **Supporting context**: configuration or estimates that exist to make other domains' features
  work. These are lightweight and don't warrant rich feature development.

This distinction guides how much schema complexity a concept deserves at any given point in
the product's evolution.

### 12. The user account is the tenancy boundary; entities are filters

Every domain table carries `user_id`. This is the sole isolation boundary — all queries filter
by `user_id` at the domain boundary. Cross-user data does not exist within a domain.

`entity_id` (personal, company, trust, SMSF) is an ownership attribute used for filtering and
reporting, not an access boundary. An investor managing multiple legal structures sees all of
them under one login because the consolidated view across entities is the product's core value.

Joint ownership is modelled as a single user account. Ownership splits (e.g. 50/50) are metadata
on the asset for reporting and tax purposes, not an access control concern.

Third parties (accountants, mortgage brokers) are not users of Folio. They work with source
documents — PDFs and exports — not the application itself. No advisor access model is needed.

### 13. Domains do not read each other's tables

In the monolith, the Reporting domain reads other domain tables directly via SQL joins. No other
domain does this — domains communicate through APIs, not shared table access. This discipline is
cheap to maintain now and makes future microservice extraction straightforward: only Reporting's
DB reads need replacing with API calls.

### 14. Aggregate roots own cascade behaviour

Each domain has an aggregate root (e.g. `properties` in the Property domain). Deletions cascade
within an aggregate: deleting a property removes its transactions, valuations, leases, and
ownerships. Cross-domain foreign keys use `ON DELETE SET NULL` or `ON DELETE RESTRICT` — never
`CASCADE` across domain boundaries. A loan referencing a property should not be destroyed when
the property is deleted.

### 15. Tables follow three mutability patterns

Every table belongs to exactly one of three patterns:

- **Entity table** — the domain object itself; any column may be updated; no naming suffix.
  Examples: `properties`, `installment_loans`, `bank_accounts`

- **Ledger table** (`_ledger` suffix) — financial event stream; append-only. Rows record
  something that happened and are permanent audit evidence. `deletedAt` soft-deletes are
  permitted; no other field may be updated after insert.
  Examples: `property_ledger`, `loan_ledger`, `income_ledger`

- **Snapshot table** (descriptive plural name) — point-in-time value recording; append-only.
  A new measurement always produces a new row; existing rows are never updated.
  Examples: `property_valuations`, `loan_balances`

See `docs/conventions.md §8` for the decision guide and the full permitted-operations matrix
for ledger tables.

---

## Domain Map

### Property Domain
The core domain. The primary reason Folio exists.

```
properties                — entity table
property_ownerships       — entity table; junction: property + entity + ownership %
property_leases           — entity table; rental arrangement metadata (expected rent, frequency)
property_valuations       — snapshot table; market value snapshots over time
property_ledger           — ledger table; all property cashflow (rent, management, repairs, rates, etc.)
```

Rental income lives here. The Income domain never owns rent.

---

### Assets Domain
Covers all asset types that are not property. Sub-domains have their own tables because their
attributes differ meaningfully. Each follows the three-layer pattern as implemented.

**Sub-domains (own tables per type):**
- Bank accounts — savings, transaction, offset accounts
- Investments — shares, bonds, managed funds, business interests
- Superannuation
- Vehicles
- Life insurance
- Other assets

Cross-domain note: an offset bank account references its linked loan in the Borrowings domain.
The bank account is owned by Assets; the linkage is a FK reference, not shared ownership. If
split offsets or multiple offsets per loan become necessary, the linkage should move to an
explicit `loan_offset_accounts` junction table rather than a single FK on the bank account.

---

### Borrowings Domain
All forms of debt. One domain, two table groups internally because installment loans and
revolving credit have different attributes, amortisation logic, and query patterns.

**Installment loans** — home loans, investment loans, car loans, personal loans, HECS/HELP,
ATO debt, and other amortising debt.
```
installment_loans         — entity table
loan_balances             — snapshot table; balance recordings over time
loan_ledger               — ledger table; principal, interest, fees per payment
loan_property_securities  — entity table; junction: loan + property (many-to-many for cross-collateralisation)
```

**Revolving credit** — credit cards, overdrafts, lines of credit, store cards, charge cards.
```
credit_facilities         — entity table
credit_balances           — snapshot table
credit_ledger             — ledger table
```

Key fields on loans (not exhaustive):
- `purpose: investment | owner_occupied | personal | business` — first-class queryable field,
  not derived from a type label. Drives tax deductibility logic.
- `rate_type: variable | fixed | split`
- `repayment_type: IO | PI`

Edge case — hybrid loan products: some home loans include a redraw facility that behaves as
revolving credit for the redraw portion. These are modelled under installment loans (dominant
behaviour) with the redraw capacity tracked as metadata, not as a separate credit facility.

---

### Income Domain
Standalone income streams that have no parent asset. Asset-derived income (rent, dividends,
bank interest) is never stored here — it is aggregated from the relevant asset domain.

Some sub-domains get own tables (distinct attributes and business rules):

```
payg_income               — entity table; employer, gross, tax withheld, net, TFN
self_employed_income      — entity table; ABN, business name, BAS quarters
income_ledger             — ledger table; payslips, distributions, payments
```

Others share a generic entity table with a type discriminator:
```
other_income              — entity table; type: govt_benefit | business_distribution | pension | other
                          — covers: family allowance, unemployment, dividends from company/trust/
                            partnership, private pension, etc.
```

---

### Personal Finance Domain
Captures the household financial baseline that enables investment analysis and affordability
forecasting. Without household income and outgoing context, questions like "can I afford another
investment property?" cannot be answered — the portfolio cash flow alone is insufficient.

Principles for this domain:
- All entries are user-provided estimates, not imported actuals. Personal transaction tracking
  is out of scope for Folio; users manage that elsewhere.
- Granularity is user-determined. A single "total income" row is as valid as twenty categorised
  line items — the same table accommodates both without schema changes.
- Each entry carries an effective date range so changes over time are tracked (e.g. a salary
  increase, a new recurring expense).
- Amounts are stored with their native frequency (weekly, fortnightly, monthly, annual);
  monthly-equivalent figures are derived at read time for comparison.
- Categories follow the personal finance taxonomy, consistent with expense categorisation used
  in the Assets domain for bank transaction labelling.

```
personal_budget_items   — type (income|expense), category, amount, frequency, effective dates
```

Personal actual transactions (groceries, utilities, etc.) are not tracked here. If a user
connects a bank account, those transactions live in the Assets domain with expense category labels
applied. This domain holds plans, not actuals.

---

### Reporting Domain
Two responsibilities:

1. **Reads across domains** to produce cross-domain views: portfolio P&L, net worth, cashflow
   waterfall, affordability analysis, tax position summaries. This is the only domain that reads
   other domains' tables directly (see principle 13). All financial figures are computed live
   from source domain tables — no financial totals are stored or cached.

2. **Captures reporting-specific inputs and outputs** that belong to no other domain: goals,
   scenario parameters, forecast assumptions, AI commentary. These are not transactions or domain
   entities — they are inputs to and outputs of analysis. AI commentary is generated on demand
   and cached here; it is invalidated when the underlying period's data changes.

```
forecast_scenarios    — entity table; user-defined what-if scenarios (e.g. "buy property X at Y price")
portfolio_goals       — entity table; target net worth, LVR, yield, or cashflow at a point in time
report_commentary     — entity table; AI-generated and user-annotated commentary keyed by period
```

Cross-domain aggregation logic lives here, never inside domain business rules. Domains do not
know about Reporting; Reporting knows about domains.

---

### Ingestion Domain
Owns the full lifecycle of uploaded files: receipt, extraction, staging, routing, and commit to
domain tables. Other domains never reach into Ingestion's tables — they receive committed rows
via the Ingestion service's public API after a user confirms and commits the staged data.

```
source_documents          — entity table; file metadata, storage path, upload provenance, extraction status
document_staging_items    — entity table; JSONB extracted fields awaiting user review and commit;
                            keyed by (source_document_id, line_item_index)
document_source_mappings  — entity table; learned routing rules (document type → property/entity mapping)
                            used to pre-fill matching on future uploads
```

Any ledger or entity row created from a document carries an optional `source_document_id` FK.
The document row owns extraction provenance and status (parsed, AI extraction succeeded/failed,
re-extraction queued). Rows produced from a document reference back to it; the document does not
reference its derived rows.

Staging items are transient: once committed (user confirms, rows written to domain tables) or
rejected, the staging row may be soft-deleted. The `source_document_id` on the committed domain
row is the permanent audit link.

The `document_source_mappings` table is the domain's memory: it stores which document types
have historically mapped to which properties or entities, enabling auto-classification suggestions
on future uploads.

---

### Identity (Supabase-managed)
```
entities   — individual, joint, trust, company, superannuation fund
users      — managed by Supabase Auth
```

Every domain table carries a `user_id`. Entity ownership (who legally holds what) is expressed
via junction tables in each relevant domain (e.g. `property_ownerships`).

---

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| Rental income domain | Property, not Income | Rent is inseparable from the property; Income view is a UI projection |
| Asset-derived income | Projected at read time, not duplicated into Income domain | Storing a copy creates sync problems and blurs domain ownership |
| Expense categories | Domain-specific enums/lookups, no entity tables | Categories are classification labels; business logic lives in the domain using them, not on the category |
| Loan → property relationship | Many-to-many junction (`loan_property_securities`) | Cross-collateralisation is real; hard `NOT NULL` FK was wrong |
| Loan purpose | First-class column, not parsed from type label | Tax deductibility requires a queryable `purpose` field |
| Credit cards | Borrowings domain (revolving credit group) | Liability nature and serviceability calculations outweigh transactional similarity to bank accounts |
| Co-ownership | Junction table with percentage (`property_ownerships`) | Single `entity_id` FK cannot express split ownership |
| "Account" abstraction | API/UI layer only, not schema | Shared parent table couples all domains at the DB layer |
| Document processing | Ingestion domain (not cross-cutting infrastructure) | Owns a full lifecycle (receipt → staging → routing → commit) that warrants domain status |
| Extraction staging | Single JSONB staging table (`document_staging_items`) per document, committed to domain tables on user confirmation | Keeps extracted data in one place until validated; avoids partial writes to domain tables |
| Document routing memory | `document_source_mappings` table within Ingestion domain | Learned mappings (document type → property/entity) live where the routing logic lives |
| Financial report totals | Live queries only; no stored financial totals | Stored totals drift from source data; live aggregation is the source of truth |
| AI commentary | Generated on demand, cached in `report_commentary` | Regeneration is cheap; stale AI commentary against changed data is misleading |
| Ledger table naming | `_ledger` suffix (e.g. `property_ledger`, `loan_ledger`) | Suffix signals append-only semantics at a glance; prevents accidental update/delete |
| Budget vs actuals | Never conflated in the same table | Budget items are plans; transactions are evidence; the gap between them is insight |
| Cross-domain DB reads | Reporting domain only | All other domains communicate via API; this keeps future extraction cheap |
| Tenancy model | User account is the sole boundary; entities are filters | Consolidated cross-entity view is the core product value; isolation at entity level would break it |
| Joint ownership | Single login per household | Ownership splits are reporting metadata, not an access control concern |
| Third-party access (accountants, brokers) | Out of scope; they receive document exports | They need source documents, not application access |
| Cascade on delete | Within aggregate only; `SET NULL` or `RESTRICT` across domain boundaries | Prevents destructive cross-domain side effects |
| Currency | AUD only; multi-currency out of scope | Simplifies all amount storage, comparison, and reporting |
| Hybrid loan products (redraw) | Modelled as installment loan with redraw metadata | Dominant behaviour determines table group; revolving split adds complexity with minimal benefit |
