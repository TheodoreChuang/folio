---
title: "feat: Filter uplift — chip-select dropdowns with backend filtering on Properties, Loans, and Dashboard"
type: feat
status: active
created: 2026-06-05
---

# feat: Filter uplift — chip-select dropdowns with backend filtering on Properties, Loans, and Dashboard

## Context

Both `/properties` and `/loans` use inline toggle-chips for filtering, but the visual designs show a "chip-select" dropdown pattern. Beyond the visual gap, client-side filtering would leave metric tiles (total value, total debt, cashflow) showing unfiltered totals while the table shows filtered rows — an inaccurate state. Backend filtering ensures every number on the page reflects the active filter.

The dashboard also needs entity and period filters that don't exist yet. The period filter in particular benefits from a flexible backend interface (`from`/`to` date params) so the frontend can iterate through different periods without needing backend changes.

**Scope of this plan:** `/properties` (entity), `/loans` (entity + lender + type), and `/dashboard` (entity + period). Insights is out of scope — not yet built.

**Suggested PR breakdown:** 4 PRs in dependency order:
1. Shared FilterChip component (no API changes, no page changes)
2. Properties backend filter (API + service + page)
3. Loans backend filters (API + service + page)
4. Dashboard filters + Trends API update

---

## Scope

**In scope:**
- Add Radix Popover shadcn component
- Build shared `FilterChip` component (rich variant with entity-type icons, simple variant)
- `/properties`: entity filter → backend (`entityId` query param on properties list, portfolio summary, ledger summary); FilterChip dropdown replaces button chips
- `/loans`: entity + lender + type filters → backend (`entityId`, `lender`, `loanType` query params on loans list); three FilterChip dropdowns replace button chips
- `/dashboard`: entity filter + period selector → re-fetch all three APIs (`portfolio/summary`, `ledger/summary`, `reports/trends`) with new params
- `GET /api/reports/trends`: add `entityId` param; accept `from`/`to` date range replacing the current `months` count param
- `lib/aggregate/repositories/trends.ts`: add optional `entityId` join filter to `fetchTrendData`
- `lib/property/repositories/properties.ts`: add optional `entityId` param to `listProperties`
- `lib/borrowings/repositories/loans.ts`: add optional `entityId`, `lender`, `loanType` params to `listAllLoansFlat`

**Deferred to Follow-Up Work:**
- Insights page filters (insights page not yet built)
- URL-persisted filter state
- `/properties` period filter (design may add this later)
- Lender DB normalisation or dedicated lender API

---

## Key Technical Decisions

**1. Re-fetch on filter change (backend filtering)**
When a filter changes, re-fetch from the backend. This keeps metric tiles accurate. All relevant APIs already accept `entityId` and date params (`portfolio/summary`, `ledger/summary`); the remaining ones (`/api/properties`, `/api/loans`, `/api/reports/trends`) need filter params added.

**2. Trends API: switch from `months` to `from`/`to` + `entityId`**
The current `?months=12` param hardcodes a trailing-N-months window. Since dashboard is the only caller and we're updating it in U10, we can replace `months` with explicit `from`/`to` + optional `entityId`. This gives the frontend full control over the period without future API changes.

**3. Trends entity filter via property subquery**
`property_ledger` has `property_id` but not `entity_id`. To filter by entity, `fetchTrendData` needs to filter ledger entries to properties whose `entity_id` matches — either via JOIN or a subquery IN clause. Subquery IN clause is consistent with how `fetchLedgerEntriesInRange` handles property ID filtering.

**4. Lender filter: exact string match from loaded option values**
Lenders are free-text in the DB. The dropdown shows unique lender values derived from loaded loans; selecting one filters via exact string match in the query. No normalisation needed.

**5. Period filter options (Australian FY aware)**
Frontend computes date ranges from four presets: `12m` (last 12 months), `6m` (last 6 months), `this-fy` (July 1 – June 30 of the current Australian FY), `last-fy` (July 1 – June 30 of the previous FY). These map to `from`/`to` strings passed to the APIs.

**6. Popover as dropdown primitive**
Added via `pnpm dlx shadcn@latest add popover`. FilterChip uses `Popover + PopoverTrigger + PopoverContent` with a custom listbox inside. Cleaner than DropdownMenu for this pattern — no RadioItem indicator to override, items don't auto-close.

**7. FilterChip lives in `components/`**
App-specific shared component (not a shadcn/ui primitive), consistent with `components/app-shell.tsx` and `components/sidebar.tsx`.

---

## High-Level Technical Design

*Directional guidance — not implementation specification.*

```
FilterChip props:
  label: string               // "Entity", "Lender", "Type"
  value: string | null        // selected option id; null = "all"
  options: FilterOption[]
  onChange: (id: string | null) => void
  variant?: 'rich' | 'simple' // default 'simple'
  actionLink?: { href: string; label: string }

FilterOption:
  id: string
  name: string
  subLabel?: string           // e.g. "Discretionary trust" or "Interest only"
  count: number               // shown in the option row
  entityType?: EntityType     // drives icon in 'rich' variant
  disabled?: boolean          // "No properties / No loans" greyed out state

Period filter (dashboard only):
  Four preset options each mapping to a { from: string; to: string } pair.
  Implemented as a FilterChip variant with static options (no API needed for option list).
```

Chip trigger: label prefix + current value name (or "All {label}s") + chevron + ×-clear (visible only when value is non-null). Clicking ×-clear fires `onChange(null)` without opening the panel.

Popover panel: menu-label header → "All {label}s" option (total count) → separator → individual options → optional separator + action link.

---

## Implementation Units

### U1. Add Popover component

**Goal:** Install Radix Popover so U2 can build on it.

**Files:**
- `components/ui/popover.tsx` (new — generated by shadcn)

**Approach:** Run `pnpm dlx shadcn@latest add popover`. No manual edits needed.

**Test expectation:** none — scaffolding only.

**Verification:** `components/ui/popover.tsx` exists and exports `Popover`, `PopoverTrigger`, `PopoverContent`.

---

### U2. Build FilterChip component

**Goal:** Create the reusable chip-select dropdown used by all three pages.

**Dependencies:** U1

**Files:**
- `components/filter-chip.tsx` (new)

**Approach:**
- Props: `label`, `value`, `options`, `onChange`, `variant = 'simple'`, `actionLink?`
- Use `Popover + PopoverTrigger + PopoverContent`; trigger is a custom chip button, content is a custom listbox panel
- Active state (value non-null): accent border/bg on chip; ×-clear button visible
- ×-clear: calls `onChange(null)` with `stopPropagation()` so the popover doesn't open
- Rich variant: glyph column with entity-type inline SVG. Map all 5 entity types to inline SVGs — `individual` (person silhouette), `joint` (two-person), `trust` (briefcase), `company` (building grid), `superannuation` (shield). Designs provide exact SVGs for trust/individual/company; derive reasonable SVGs for joint/superannuation.
- Simple variant: no glyph column
- `disabled` option: reduced opacity, `pointer-events-none`
- Clicking an option fires `onChange(id)` and closes; "All …" fires `onChange(null)` and closes
- Keyboard accessibility: Escape closes popover (Radix handles this natively)

**Patterns to follow:**
- `cn()` for Tailwind class composition (same as `components/ui/button.tsx`)
- Inline SVGs consistent with existing use in `app/(app)/loans/page.tsx`

**Test scenarios:**
- `value=null`: trigger shows "All Entities", no ×-clear
- `value` set: trigger shows option name, active chip styles, ×-clear visible
- Open popover: selected option has highlight style
- Click option: `onChange` fires with option id; popover closes
- Click "All …": `onChange` fires with null; popover closes
- Click ×-clear: `onChange` fires with null; popover does NOT open
- `disabled` option: greyed out, not clickable
- `actionLink` present: `<a>` tag at bottom of panel
- Rich variant: glyph column visible; simple variant: no glyph column

**Test expectation:** none — frontend-only component per project testing conventions; covered by manual browser verification.

**Verification:** Component renders correctly with both variants; all interactions work as described.

---

### U3. Add entityId filter to listProperties repository

**Goal:** Allow `listProperties` to optionally filter to a single entity.

**Dependencies:** none

**Files:**
- `lib/property/repositories/properties.ts` (modify `listProperties` signature)
- `lib/property/index.ts` (re-export if signature change needed)

**Approach:**
- Change signature: `listProperties(userId: string, entityId?: string | null)`
- Add `entityId ? eq(properties.entityId, entityId) : undefined` inside the existing `and()` where clause
- No schema changes; `properties.entityId` already exists

**Patterns to follow:** `and(eq(...), isNull(...))` pattern from `docs/conventions.md §4`.

**Test scenarios:**
- No `entityId`: returns all properties for the user (unchanged behavior)
- With `entityId`: returns only properties with matching `entity_id`
- With `entityId` for a different user's entity: returns empty (userId guard prevents cross-user access)
- With `entityId` that has no matching properties: returns empty array

**Verification:** Integration test passes (requires `supabase start`). Type-check passes.

---

### U4. Accept entityId in GET /api/properties

**Goal:** Expose the entityId filter from U3 as a query param on the properties API.

**Dependencies:** U3

**Files:**
- `app/api/properties/route.ts` (modify GET handler)

**Approach:**
- Parse `entityId` from `searchParams` — validate as a UUID if present (use existing `UUID_REGEX` pattern already in `app/api/loans/route.ts`)
- Pass to `listProperties(user.id, entityId)`
- No Zod needed — single optional string query param follows existing patterns in `ledger/summary` and `portfolio/summary`

**Patterns to follow:** How `app/api/portfolio/summary/route.ts` and `app/api/ledger/summary/route.ts` parse and pass `entityId`.

**Test scenarios:**
- `GET /api/properties` (no params): returns all properties (unchanged)
- `GET /api/properties?entityId=<valid-uuid>`: returns only properties for that entity
- `GET /api/properties?entityId=not-a-uuid`: returns 400
- `GET /api/properties?entityId=<uuid-of-different-users-entity>`: returns empty array (userId scoping in repo)
- Unauthenticated request: returns 401

**Verification:** Unit test passes; type-check passes.

---

### U5. Update Properties page to use FilterChip + backend filter

**Goal:** Replace the existing button-chip entity filter with `FilterChip`; re-fetch all page data when the filter changes.

**Dependencies:** U2, U4

**Files:**
- `app/(app)/properties/page.tsx` (modify)

**Approach:**
- Change `entityFilter` state from `string` (default `'all'`) to `string | null` (default `null`)
- Move the data-loading logic into a function that accepts `entityId` and re-calls it when the filter changes; tie the `useEffect` dependency to `entityFilter` state
- On each load: pass `?entityId=...` (when non-null) to `/api/properties`, `/api/portfolio/summary`, and `/api/ledger/summary`
- Remove the existing button-chip block; replace with a `<FilterChip>` using `variant="rich"`
- Show filter bar regardless of entity count (even 1 entity — the manage-entities link is useful)
- Option counts: count properties per entity from the loaded (filtered or unfiltered) properties list. Load the full entity list separately from `/api/entities` once on mount (independent of filter); compute counts from the current full-list fetch
- Include `actionLink={{ href: '/entities', label: 'Add or manage entities' }}`
- Add a helper `entityTypeSubLabel(type: EntityType): string` mapping to display labels (e.g., `trust` → `'Discretionary trust'`, `individual` → `'Individual'`, `company` → `'Company'`, `joint` → `'Joint'`, `superannuation` → `'Superannuation'`)

**Note on counts:** Option counts should reflect the unfiltered total (how many properties are in each entity), not the current filtered result. This requires fetching the entity list plus full property counts independently. One approach: fetch all properties once to compute counts, then separately apply the entity filter for the actual display list. Alternatively, compute counts from the full list on initial load and keep them static. Either approach is valid; choose whichever is simpler.

**Patterns to follow:** `loadLoans` / `useCallback` pattern from `app/(app)/loans/page.tsx` for refetching on filter change.

**Test scenarios:**
- Filter bar renders with entity options
- Selecting entity: re-fetches and table + metric tiles reflect that entity only
- Total value / total debt metric tiles update when entity filter applied
- `missingStatements` alerts update to reflect entity filter
- Entities with 0 properties render as disabled options
- Clearing filter (`null`): re-fetches full portfolio
- Sold properties remain visible under entity filter (existing behavior preserved)

**Verification:** `/properties` in browser: dropdown renders with rich icons; entity filter updates table and metric tiles correctly; no console errors.

---

### U6. Add entityId, lender, loanType filters to listAllLoansFlat

**Goal:** Allow loans to be filtered server-side by entity, lender, and/or loan type.

**Dependencies:** none

**Files:**
- `lib/borrowings/repositories/loans.ts` (modify `listAllLoansFlat` signature)
- `lib/borrowings/index.ts` (re-export if signature change needed)

**Approach:**
- Change signature: `listAllLoansFlat(userId: string, filters?: { entityId?: string | null; lender?: string | null; loanType?: string | null })`
- Add optional conditions to the `installmentLoans` query's `where` clause using `and()` + conditional filters
- Lender filter: `eq(installmentLoans.lender, filters.lender)` — exact string match
- Loan type filter: `eq(installmentLoans.loanType, filters.loanType)` — matches the enum
- Entity filter: `eq(installmentLoans.entityId, filters.entityId)`

**Patterns to follow:** Drizzle `and()` with conditional filters from `docs/conventions.md §4`.

**Test scenarios:**
- No filters: returns all loans for the user (unchanged behavior)
- `entityId` filter: returns only loans with matching `entity_id`
- `lender` filter: returns only loans with matching `lender` string
- `loanType` filter: returns only loans with matching `loan_type`
- Combined `entityId` + `loanType`: returns intersection
- Any filter with a value not present in the data: returns empty array
- Cross-user isolation: userId guard prevents returning other users' loans regardless of filter values

**Verification:** Integration test passes (requires `supabase start`). Type-check passes.

---

### U7. Accept filter params in GET /api/loans

**Goal:** Expose the U6 filters as query params on the loans API.

**Dependencies:** U6

**Files:**
- `app/api/loans/route.ts` (modify GET handler)

**Approach:**
- Parse `entityId`, `lender`, `loanType` from `searchParams`
- Validate `entityId` as UUID if present; validate `loanType` against the enum values (`interest_only`, `principal_and_interest`, `line_of_credit`) if present; `lender` is a plain string (no special validation needed, length cap reasonable)
- Pass as filters object to `listAllLoansFlat(user.id, { entityId, lender, loanType })`

**Patterns to follow:** How existing GET handlers in `portfolio/summary` and `ledger/summary` parse and validate `entityId`.

**Test scenarios:**
- `GET /api/loans` (no params): returns all loans (unchanged)
- `GET /api/loans?entityId=<uuid>`: returns entity-filtered loans
- `GET /api/loans?lender=CBA`: returns only CBA loans
- `GET /api/loans?loanType=interest_only`: returns only IO loans
- `GET /api/loans?loanType=invalid`: returns 400
- `GET /api/loans?entityId=not-a-uuid`: returns 400
- Unauthenticated: returns 401

**Verification:** Unit test passes; type-check passes.

---

### U8. Update Loans page to use three FilterChips + backend filters

**Goal:** Replace the existing entity chips with `FilterChip` and add lender + type filters; re-fetch from backend when any filter changes.

**Dependencies:** U2, U7

**Files:**
- `app/(app)/loans/page.tsx` (modify)

**Approach:**
- Add state: `lenderFilter: string | null` and `typeFilter: string | null`
- Move fetch into a `useCallback` that includes `entityFilter`, `lenderFilter`, `typeFilter` as dependencies; pass as `?entityId=...&lender=...&loanType=...` query params to `/api/loans`
- All metric tiles (totalDebtCents, monthlyRepayments, weightedAvgRate, propertiesSecured) are computed from the fetched `loans` — they automatically reflect backend-filtered results
- Remove the existing entity chip block; add a filter bar with three `<FilterChip>` components:
  1. **Entity** (`variant="rich"`): fetch entity list once on mount; compute per-entity counts from a full unfiltered loans fetch on mount (same approach as U5); `actionLink` to `/entities`
  2. **Lender** (`variant="simple"`): derive unique lenders from the unfiltered loans fetch; subLabel = friendly lender name where known (small static map or just use the lender value as both name and subLabel)
  3. **Type** (`variant="simple"`): derive unique non-null `loanType` values from unfiltered loans; option `name` = `loanTypeLabel()` result (e.g., "IO"); `subLabel` = full description ("Interest only")
- Load unfiltered loans once on mount to populate filter option lists + counts; filter changes only re-fetch the filtered list
- Remove the `entityChips` derivation (replaced by full entity list from `/api/entities`)

**Approach for option counts:** Fetch `/api/loans` once on mount with no filters to get all loans for computing option lists and counts. Subsequent filter-change fetches use the filtered endpoint. Keep a separate `allLoans` state for option computation vs `filteredLoans` for display.

**Patterns to follow:** Existing `loadLoans` / `useCallback` pattern; `loanTypeLabel()` already in the file.

**Test scenarios:**
- Entity filter: re-fetches and all metric tiles + table reflect entity filter
- Lender filter: selecting "CBA" shows only CBA loans; total debt updates
- Type filter: selecting "IO" shows only IO loans; metrics update
- Combined entity + lender filter: intersection applied correctly
- Clearing any filter: reverts to broader result set
- Lender options: derived from actual lenders in data (not hardcoded preset list)
- Type options: only loan types present in data are shown
- All metric tiles (debt, repayments, weighted rate, properties secured) update with each filter change

**Verification:** All three filters work on `/loans` in browser; metric tiles update correctly with each filter combination.

---

### U9. Update Trends API to accept entityId + from/to date range

**Goal:** Replace the `months` count param with a flexible `from`/`to` date range param and add optional `entityId` filtering to the trends endpoint.

**Dependencies:** none (parallel with U1–U8)

**Files:**
- `lib/aggregate/repositories/trends.ts` (modify `fetchTrendData`)
- `app/api/reports/trends/route.ts` (modify GET handler)

**Approach:**

**`fetchTrendData` signature change:**
- New signature: `fetchTrendData(userId: string, from: string, to: string, entityId?: string | null)`
- When `entityId` provided: filter ledger entries to properties whose `entity_id` matches via a subquery: `AND property_ledger.property_id IN (SELECT id FROM properties WHERE entity_id = entityId AND user_id = userId AND deleted_at IS NULL)`
- Use Drizzle subquery or raw SQL fragment for the IN clause; follow the pattern from `fetchLedgerEntriesInRange` in the same file/module

**`GET /api/reports/trends` param change:**
- Remove `months` param (dashboard is the only caller; it will be updated in U10)
- Accept `from` + `to` (required, YYYY-MM-DD, validated with existing DATE_REGEX pattern) and optional `entityId`
- Generate month range from `from`/`to` instead of computing from `months + currentMonth()`
- Validate that from <= to and that the range spans no more than 24 months (existing upper bound)
- Pass `entityId` to `fetchTrendData`

**Patterns to follow:**
- Date validation from existing `ledger/summary` route
- `fetchPropertiesActiveInRange`'s `entityId` filtering approach for the subquery pattern
- Drizzle `and()` + conditional filter from conventions

**Test scenarios for `fetchTrendData`:**
- No `entityId`: returns trend rows for all user's properties (unchanged)
- With `entityId`: returns only trend rows for properties belonging to that entity
- With `entityId` that has no properties: returns empty array
- Cross-user: `userId` in subquery prevents cross-user data leakage

**Test scenarios for GET /api/reports/trends:**
- `?from=2025-07-01&to=2026-06-30`: returns monthly trend points for the FY
- `?from=2025-07-01&to=2026-06-30&entityId=<uuid>`: entity-filtered trends
- Missing `from` or `to`: returns 400
- `from > to`: returns 400
- Range > 24 months: returns 400
- No `months` param needed anymore (old callers would get 400 if they don't pass from/to — acceptable since only dashboard calls this)

**Verification:** Integration test confirms entity-filtered trend data; unit test confirms API param validation; type-check passes.

---

### U10. Add entity + period filter to Dashboard page

**Goal:** Add entity filter and period selector to the dashboard; re-fetch all APIs when either filter changes.

**Dependencies:** U2, U9

**Files:**
- `app/(app)/dashboard/page.tsx` (modify)

**Approach:**
- Add state: `entityFilter: string | null` and `period: PeriodKey` (e.g., `'12m' | '6m' | 'this-fy' | 'last-fy'`, default `'12m'`)
- Add a helper `periodToDateRange(period: PeriodKey): { from: string; to: string }` that computes date ranges:
  - `12m`: last 12 months from current month
  - `6m`: last 6 months from current month  
  - `this-fy`: July 1 of current Australian FY to June 30 (current FY = starting year if month ≥ July, otherwise starting year minus 1)
  - `last-fy`: July 1 to June 30 of the previous FY
- Fetch strategy: all four API calls re-run when entity or period changes
  - `GET /api/portfolio/summary?entityId=...` — entity only (point-in-time, not period-bounded)
  - `GET /api/ledger/summary?from=...&to=...&entityId=...` — period is the full selected range (not just current month)
  - `GET /api/reports/trends?from=...&to=...&entityId=...` — replace `?months=12`
  - `GET /api/plan/context` — no filter (household budget is global)
- Replace the three separate `useEffect` hooks with a single load function in `useCallback` that takes `entityFilter` and `period` as dependencies
- Period filter UI: a `<FilterChip variant="simple">` placed in the page-head controls area (top right, matching the design's `.page-head .controls` position). Static options — no API needed for the option list.
- Entity filter UI: a `<FilterChip variant="rich">` in a filter bar below the page head. Fetch entity list from `/api/entities` once on mount.
- Entity options: fetch `/api/entities` once; compute per-entity counts from... (see note below)
- Section label updates: "Portfolio position · {monthLabel}" and "Cashflow trend · last 12 months" labels should reflect the active period (e.g., "Cashflow trend · last 6 months", "Cashflow trend · FY 2025–26")

**Note on entity option counts:** The dashboard doesn't have a simple "count" to show per entity (unlike properties or loans). Show counts from a separate `/api/properties` fetch (property count per entity) or omit counts from entity options here. Simpler: omit counts on the entity filter on the dashboard; show entity name + type subLabel only.

**Period filter option subLabels:** Each period option should show the computed date range as subLabel (e.g., "Jul 2025 – Jun 2026") so the user can see exactly what period they're selecting.

**Patterns to follow:** `useCallback` refetch pattern from loans page; `periodToDateRange` helper is pure and can be defined at module scope.

**Test scenarios:**
- Default state (`12m`, no entity): same behavior as current dashboard
- Period `6m`: ledger summary and trends re-fetch with 6-month range; chart shows 6 monthly bars
- Period `this-fy`: ledger summary shows FY totals; chart shows FY monthly breakdown
- Period `last-fy`: shows previous FY data
- Entity filter: portfolio summary, ledger summary, and trends all scoped to the entity; metric tiles update
- Entity + period combined: both filters applied to all API calls
- Clearing entity filter: reverts to all-entities results
- `periodToDateRange` pure function: correct dates for all 4 presets across different months of the year

**Verification:** Dashboard filters work in browser; metric tiles and chart update correctly for all period/entity combinations.

---

## Test Files

Backend units (U3, U4, U6, U7, U9) should follow TDD:
- `__tests__/api/properties.test.ts` — extend with entityId filter tests for GET
- `__tests__/api/loans.test.ts` — extend with entityId/lender/loanType filter tests for GET
- `__tests__/api/reports-trends.test.ts` — new or extend: test from/to param validation, entityId param
- Integration tests for WHERE clause correctness (requires `supabase start`):
  - `__tests__/api/properties.integration.test.ts` — entityId filter returns correct rows
  - `__tests__/api/loans.integration.test.ts` — each filter param returns correct rows
  - `__tests__/lib/trends.integration.test.ts` — entityId filter on `fetchTrendData` returns correct rows

---

## Verification

1. `pnpm dlx shadcn@latest add popover` succeeds; `components/ui/popover.tsx` exists
2. `pnpm tsc --noEmit` — zero type errors across all modified files
3. `pnpm lint` — clean
4. `pnpm test` — all unit tests pass
5. `pnpm test:integration` (with `supabase start`) — WHERE clause integration tests pass
6. Browser: `/properties` — entity filter dropdown (rich icons); metric tiles update when entity selected
7. Browser: `/loans` — three filter dropdowns (entity rich, lender simple, type simple); all metric tiles update
8. Browser: `/dashboard` — entity filter in filter bar + period selector top-right; chart + metric tiles update for all period/entity combinations
