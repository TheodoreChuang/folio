---
title: "feat: Plan page — scenario calculators"
date: 2026-06-02
status: active
origin: docs/brainstorms/plan-page-requirements.md
type: feat
---

# feat: Plan page — scenario calculators

**Origin:** `docs/brainstorms/plan-page-requirements.md`  
**Routes:** `/plan`, `/plan/rate-sensitivity`, `/plan/interest-only`, `/plan/model-purchase`, `/plan/hold-reinvest`

---

## Problem Frame

The Plan page is stubbed out (`app/(app)/plan/page.tsx` currently shows "Coming soon"). This feature implements it fully: a card-grid landing that gates 4 read-only scenario calculators based on portfolio data availability, plus each of the 4 calculator pages as separate routes.

All calculators are **client-side only** — they fetch data from one backend endpoint but write nothing. No scenario is persisted.

---

## Scope Boundaries

### In scope
- `GET /api/plan/context` — new aggregated endpoint for all calculator data needs
- `/plan` landing: 2×2 card grid with enabled/disabled logic
- `/plan/rate-sensitivity`: variable loan repayment impact slider
- `/plan/interest-only`: IO→P&I timeline, rollover table, stepped cashflow chart
- `/plan/model-purchase`: full purchase calculator (funding, cashflow, portfolio impact tiles)
- `/plan/hold-reinvest`: 3-step sale/reinvest comparison with equity trajectory chart

### Deferred to Follow-Up Work
- CGT computation (user enters estimate manually per design)
- Stamp duty computation (user enters manually)
- Scenario saving / persistence
- Extra repayments calculator (excluded per PRD)
- Lender integration or live rate lookup
- Settlement period modeling
- Cashflow/yield comparison in Hold vs Reinvest (pure capital growth only)

---

## Key Technical Decisions

**Single shared API endpoint (`GET /api/plan/context`)**
All 4 calculators use the same endpoint rather than composing multiple existing routes. Existing routes (`GET /api/loans`, `GET /api/properties`) return the wrong shape or insufficient data — loans returns only `id/lender/nickname`, not rates or balances. A dedicated context endpoint calls `lib/aggregate/plan/context.ts` which assembles all required data in one place.

**`lib/aggregate/` as the BFF layer (renamed from `lib/reporting/`)**
`lib/reporting/` already centralises cross-cutting portfolio aggregation (`fetchPortfolioData`, `fetchLedgerEntriesInRange`, `computeReport`, `computePortfolioLVR`). Renaming it to `lib/aggregate/` makes that responsibility explicit. Each frontend surface gets a subdirectory here: `lib/aggregate/plan/` is first; `lib/aggregate/dashboard/` could follow. `lib/aggregate/repositories/` and `lib/aggregate/services/` remain shared infrastructure — repositories for DB queries, services for pure computations.

**`lib/aggregate/plan/` — no own repositories**
`plan/context.ts` orchestrates existing functions — `fetchPortfolioData()` and `fetchLedgerEntriesInRange()` from `lib/aggregate/repositories/`, `listBudgetItems()` from `lib/household/` — and assembles the `PlanContext` shape. It adds no new DB queries. Pure function calculators live in `lib/aggregate/plan/calculators/` — extracted so calc logic can be unit-tested without a DOM or React.

**shadcn Slider for Rate Sensitivity**
No Slider component exists in the project. Install via `pnpm dlx shadcn@latest add slider`. Adds one Radix UI primitive; consistent with the existing shadcn setup.

**Recharts for charts**
IO Rollover stepped cashflow uses `LineChart` with `type="stepAfter"`. Hold vs Reinvest equity trajectory uses `ComposedChart` with `Line` + `Area` for shaded bands. Recharts is already a prod dependency (used on dashboard).

**Portfolio baseline in plan context (trailing 3-month average)**
Rate Sensitivity shows full portfolio cashflow (rent − expenses − recalculated repayments). The context endpoint computes a trailing 3-month ledger average via the existing `fetchLedgerEntriesInRange` + `computeReport` utilities. Returns `null` when no ledger data exists; calculators degrade gracefully to showing repayment-only impact.

**IO P&I repayment: PMT formula**
`PMT(r, n, pv) = r × pv / (1 − (1+r)^−n)` where `r = annualRatePct / 100 / 12`, `n = remainingP&IMonths`, `pv = balanceCents`. Implemented as a pure function in `lib/aggregate/plan/calculators/io-rollover.ts`. P&I rate defaults to `ioRate − 0.30%` (the 0.30% discount from PRD); user-editable per loan.

---

## High-Level Technical Design

This illustrates the intended data flow and is directional guidance for review, not implementation specification.

```
Browser
  └── /plan (landing)
        ├── fetch: GET /api/plan/context → { counts, properties, loans,
        │                                    householdSurplus, portfolioBaseline }
        └── renders card grid; disables cards based on counts

  └── /plan/rate-sensitivity
        ├── fetch: GET /api/plan/context (on mount)
        ├── state: rateDelta (slider, −3 to +3, step 0.25)
        └── renders: derived from computeRateSensitivity(loans, delta, baseline, household)

  └── /plan/interest-only
        ├── fetch: GET /api/plan/context (on mount)
        ├── state: per-loan editable P&I rates (keyed by loan id)
        └── renders: computeIoRollover(ioLoans, editableRates, household)

  └── /plan/model-purchase
        ├── fetch: GET /api/plan/context (on mount)
        ├── state: all form inputs (price, rent, deposit source, costs, loan terms)
        └── renders: computeModelPurchase(inputs, properties, loans, household)

  └── /plan/hold-reinvest
        ├── fetch: GET /api/plan/context (on mount)
        ├── state: selected property, sale details, reinvest costs, growth rates, horizon
        └── renders: computeHoldReinvest(inputs, properties, loans, household)
```

**Plan context shape (TypeScript sketch — directional):**

```typescript
// Directional — implementer finalises field names
type PlanContext = {
  counts: { variableLoans: number; ioLoans: number; properties: number }
  properties: Array<{
    id: string; address: string; nickname: string | null
    startDate: string; endDate: string | null
    latestValuation: { valueCents: number; valuedAt: string } | null
  }>
  loans: Array<{
    id: string; lender: string; nickname: string | null; propertyId: string | null
    loanType: LoanType | null; rateType: RateType | null
    interestRate: string | null  // numeric string from DB
    ioEndDate: string | null; loanTermYears: number | null
    originalAmountCents: number | null
    latestBalance: { balanceCents: number; recordedAt: string } | null
  }>
  householdSurplusMonthlyCents: number | null   // null = no budget items
  portfolioBaseline: {
    rentMonthlyCents: number
    expensesMonthlyCents: number   // non-loan expenses
    loanRepaymentsMonthlyCents: number
  } | null   // null = no ledger data
}
```

---

## Output Structure

```
app/
  (app)/
    plan/
      page.tsx                  ← UPDATE existing stub
      rate-sensitivity/
        page.tsx                ← NEW
      interest-only/
        page.tsx                ← NEW
      model-purchase/
        page.tsx                ← NEW
      hold-reinvest/
        page.tsx                ← NEW
  api/
    plan/
      context/
        route.ts                ← NEW

lib/
  aggregate/                      ← renamed from lib/reporting/ (PR 0)
    repositories/
      portfolio.ts                  (existing)
      ledger.ts                     (existing)
      trends.ts                     (existing)
    services/
      compute.ts                    (existing)
      portfolio.ts                  (existing)
    plan/
      context.ts                  ← NEW
      calculators/
        rate-sensitivity.ts       ← NEW
        io-rollover.ts            ← NEW
        model-purchase.ts         ← NEW
        hold-reinvest.ts          ← NEW
    index.ts                        (update exports)

components/
  plan/
    household-surplus-bar.tsx   ← shared bar used in 3 calculators
    back-to-scenarios.tsx       ← back link shared across all 4 pages

__tests__/
  api/
    plan-context.test.ts
  lib/
    plan-rate-sensitivity.test.ts
    plan-io-rollover.test.ts
    plan-model-purchase.test.ts
    plan-hold-reinvest.test.ts
```

---

## Implementation Units

### U1. API — `GET /api/plan/context`

**Goal:** Provide a single aggregated context endpoint that every calculator page loads on mount.

**Requirements:** Landing card enable/disable logic (counts), calculator portfolio context (properties + valuations, loans + balances, household surplus, portfolio baseline). (see origin: `docs/brainstorms/plan-page-requirements.md` §"Data the page loads")

**Dependencies:** None

**Files:**
- `app/api/plan/context/route.ts` (new)
- `lib/aggregate/plan/context.ts` (new)
- `__tests__/api/plan-context.test.ts` (new)

**Approach:**

Context orchestrator (`lib/aggregate/plan/context.ts`): No own DB queries. Calls existing functions in parallel via `Promise.all`:
1. `fetchPortfolioData(userId)` from `lib/aggregate/repositories/portfolio.ts` — returns properties, valuations (desc by `valuedAt`), loans, balances (desc by `recordedAt`)
2. `listBudgetItems(userId)` from `lib/household/repositories/budget-items.ts`
3. `fetchLedgerEntriesInRange(userId, from, to)` from `lib/aggregate/repositories/ledger.ts` — date range: first day of the month 3 months ago through last day of last month

Assembles results into the `PlanContext` shape: filters active properties/loans (no `endDate` or `endDate ≥ today`), deduplicates to latest valuation/balance per entity, derives counts. Calls `computeSummary` from `lib/household/compute.ts` for household surplus (returns `null` when `items.length === 0`). Calls `computeReport` from `lib/aggregate/services/compute.ts` on the ledger entries to derive `portfolioBaseline`; returns `null` when no ledger entries exist.

Route (`app/api/plan/context/route.ts`): Auth check → calls context orchestrator → returns `{ context: PlanContext }`.

**Patterns to follow:** `app/api/portfolio/summary/route.ts` (auth → service → response shape), `lib/aggregate/repositories/portfolio.ts` (latest-row deduplication pattern)

**Test scenarios:**
- Returns 401 when unauthenticated
- Returns `counts.variableLoans = 0` when no variable loans exist
- Returns `counts.variableLoans = 2` when 2 loans have `rateType = 'variable'`
- Returns `counts.ioLoans` counting only IO loans where `ioEndDate IS NOT NULL` (an IO loan without an end date is excluded from the count)
- Returns `latestValuation: null` for a property with no valuation rows
- Returns `latestBalance: null` for a loan with no balance rows
- Returns `householdSurplusMonthlyCents: null` when no budget items exist
- Returns `portfolioBaseline: null` when no ledger entries exist in the trailing 3-month window
- Returns `portfolioBaseline.rentMonthlyCents` as a 3-month average when ledger data exists
- Active property filter: a property with `endDate < today` is excluded from `properties` array (but may still count if `endDate` semantics differ — document this)
- Active loan filter: a loan with `endDate < today` is excluded from `loans` array

**Verification:** `pnpm test` passes. `pnpm tsc --noEmit` passes.

---

### U2. Plan landing page — card grid

**Goal:** Replace the "Coming soon" stub with the 2×2 card grid. Each card is enabled or disabled based on counts from the plan context.

**Requirements:** Enable/disable logic per PRD table; disabled cards show the lock icon and reason string; clicking an enabled card navigates to its route. (see origin: `docs/brainstorms/plan-page-requirements.md` §"Page Layout")

**Dependencies:** U1

**Files:**
- `app/(app)/plan/page.tsx` (update)

**Approach:**

`'use client'` component. On mount, `fetch('/api/plan/context')` and set state. While loading, cards render in a skeleton/disabled state. Once loaded:

| Card | Disabled when |
|------|--------------|
| Rate Sensitivity | `counts.variableLoans === 0` |
| IO Rollover | `counts.ioLoans === 0` |
| Model a Purchase | Never |
| Hold vs Reinvest | `counts.properties === 0` |

Card click → `router.push('/plan/rate-sensitivity')` etc. Disabled card click → no-op (button with `aria-disabled="true"`).

Follow the visual design in `docs/visual-designs/plan.html` / `plan.css` for card layout, eyebrow labels, lock icon, and disabled states.

**Patterns to follow:** `app/(app)/household/page.tsx` (client page with `useEffect` fetch), `docs/visual-designs/plan.html` (card markup, disabled states)

**Test scenarios:** None — frontend only page. Visual correctness verified by running the app and checking both "full portfolio" and "empty portfolio" states. Confirm enabled/disabled card states visually for each scenario.

**Verification:** Dev server shows 2×2 card grid. Rate Sensitivity, IO Rollover, and Hold vs Reinvest cards visually disabled when no portfolio data exists. Clicking enabled cards navigates to the correct route.

---

### U3. Rate Sensitivity calculator

**Goal:** Move all variable loan rates by a delta and see total portfolio cashflow impact.

**Requirements:** Slider input (−3% to +3%, step 0.25%); headline net cashflow; delta vs today; per-loan impact table; household surplus bar; excluded loans footnote. (see origin: `docs/brainstorms/plan-page-requirements.md` §"Scenario 1")

**Dependencies:** U1, U2

**Files:**
- `app/(app)/plan/rate-sensitivity/page.tsx` (new)
- `lib/aggregate/plan/calculators/rate-sensitivity.ts` (new)
- `components/plan/household-surplus-bar.tsx` (new — reused in U4 and U5)
- `components/plan/back-to-scenarios.tsx` (new — reused in U4, U5, U6)
- `__tests__/lib/plan-rate-sensitivity.test.ts` (new)

**Approach:**

Install shadcn Slider: `pnpm dlx shadcn@latest add slider`. Add integer-step tick marks (−3% to 0% to +3%) as clickable labels below the slider track — rendered as a flex row of 7 labels; tapping a label sets the slider value.

Calc engine (`lib/plan/calculators/rate-sensitivity.ts`) — pure function:

```
computeRateSensitivity(loans, delta, baseline, householdSurplusMonthlyCents)
  → {
       perLoan: Array<{ loanId, lender, nickname, balance, baseRate, newRate,
                        todayRepayment, deltaRepayment, change }>
       excludedCount: number  // loans with no rate recorded
       totalTodayRepayments: number
       totalDeltaRepayments: number
       totalChange: number    // negative = more expensive
       portfolioCashflowToday: number | null   // from baseline
       portfolioCashflowAtDelta: number | null
     }
```

Variable loan types: `rateType === 'variable'` OR `loanType === 'line_of_credit'`.
Fixed-rate loans (`rateType === 'fixed'`): excluded.
Loans with no `interestRate`: excluded; counted in `excludedCount`.

Monthly repayment per loan:
- IO loans (`loanType === 'interest_only'`): `interestOnlyPayment(rate + delta, balance)`
- P&I loans: `pmt(rate + delta, remainingTermMonths, balance)` — remaining term estimated as `loanTermYears * 12` (full term; balance-based amortisation is out of scope per PRD)
- Line of credit: treat as IO

Portfolio cashflow (if `baseline` is not null):
- `cashflowAtDelta = baseline.rentMonthlyCents - baseline.expensesMonthlyCents - totalDeltaRepayments`
- If `baseline` is null: `cashflowAtDelta = null`; headline shows only repayment change

Household surplus bar (`components/plan/household-surplus-bar.tsx`):
- Props: `surplusCents`, `consumedCents`, `label` (e.g. "Rate move would consume")
- Shows: filled bar segment proportional to consumed/surplus; remaining buffer label
- When `surplusCents` is null: renders inline prompt "Set up your Household to see how much of your monthly surplus a rate move would use."

**Patterns to follow:** `docs/visual-designs/rate-sensitivity.html` + `rate-sensitivity.css` (slider tick layout, loan table, surplus bar), `lib/household/compute.ts` (frequency-to-monthly math style), `lib/aggregate/plan/calculators/` (pure function style with no DB imports)

**Test scenarios:**
- Returns empty `perLoan` when no variable loans (covers AE: "Rate Sensitivity disabled" precondition when there are no variable loans)
- IO loan at 6.35% with $500,000 balance: today repayment = round(0.0635/12 × 500000) = $2,646; at +0.5% = round(0.0685/12 × 500000) = $2,854; delta = +$208
- P&I loan: PMT formula round-trip: PMT(0.065, 300, 600000) within $1 of expected
- Line-of-credit loan included in variable set
- Fixed-rate loan excluded
- Loan with no `interestRate` → excluded; `excludedCount` incremented
- Two variable loans: total today repayments = sum of individual repayments
- `portfolioCashflowAtDelta` = rent − expenses − totalDeltaRepayments when baseline is not null
- `portfolioCashflowAtDelta` = null when baseline is null

**Verification:** Dev server shows slider with tick marks; dragging slider or clicking ticks updates all outputs in real time; per-loan table shows new rate and delta; household bar reflects change; footnote appears when any loans are excluded.

---

### U4. IO Rollover calculator

**Goal:** Show when each IO loan flips to P&I and the payment shock at each rollover event.

**Requirements:** Hidden if no IO loans with ioEndDate; P&I rate editable per loan (default IO rate − 0.30%); timeline with event pins; per-loan rollover table; stepped cashflow chart; household surplus bar; verdict headline. (see origin: `docs/brainstorms/plan-page-requirements.md` §"Scenario 2")

**Dependencies:** U1, U2, U3 (for `household-surplus-bar`, `back-to-scenarios`)

**Files:**
- `app/(app)/plan/interest-only/page.tsx` (new)
- `lib/aggregate/plan/calculators/io-rollover.ts` (new)
- `__tests__/lib/plan-io-rollover.test.ts` (new)

**Approach:**

Calc engine (`lib/plan/calculators/io-rollover.ts`) — pure function:

```
computeIoRollover(loans, editableRates, householdSurplusMonthlyCents)
  → {
       rows: Array<{
         loanId, lender, nickname, balance, ioRate, pAndIRate,
         ioEndDate, loanTermYears, remainingPandIYears,
         ioMonthlyRepayment, pAndIMonthlyRepayment, delta,
         termUnknown: boolean
       }>
       totalAdditionalMonthlyCents: number    // sum of all deltas
       totalAdditionalAnnualCents: number
       fullyRolledPortfolioImpact: number | null  // for surplus bar
     }
```

PMT function: `pmt(annualRatePct, termMonths, balanceCents)` → monthly payment in cents. Remaining P&I term = `loanTermYears - ioYears` where `ioYears = years between startDate and ioEndDate`. When `loanTermYears` is null: `termUnknown = true`; skip the P&I repayment computation for that row; display "term unknown".

IO monthly repayment = `(ioRate / 100 / 12) × balance`.

`editableRates` is a `Record<loanId, number>` initialized to `ioRate − 0.30` for each loan; user updates are applied per-loan.

**Timeline component** (within the page):
- Horizontal axis: first day of current year to latest `ioEndDate` + 1 year
- "Today" marker as a vertical line
- One event pin per IO loan at its `ioEndDate` — alternating heights when > 4 loans

**Stepped cashflow chart** (Recharts `LineChart` with `type="stepAfter"`):
- Y-axis: portfolio net cashflow (from `portfolioBaseline.rentMonthlyCents - expensesMonthlyCents - loanRepaymentsMonthlyCents`; starts at current cashflow)
- Cashflow steps down at each rollover event (ordered by `ioEndDate` ascending)
- "Today" vertical reference line; "surplus limit" horizontal reference at household surplus level (if set)
- One dot per rollover event with value label (suppressed when > 4 loans)
- Stats below: Today / Fully rolled / Surplus headroom

Surplus bar: after the table, showing total additional monthly servicing vs household surplus.

**Patterns to follow:** `docs/visual-designs/interest-only.html`, `interest-only.css`, dashboard `ComposedChart` pattern in `app/(app)/dashboard/page.tsx`

**Test scenarios:**
- Returns `rows: []` when no IO loans have an `ioEndDate`
- IO loan at 5.50%, balance $400,000: IO monthly = round(0.055/12 × 400000) = $1,833
- P&I rate defaults to ioRate − 0.30% = 5.20%; PMT(5.20, 240, 400000) computes correctly  
- Editable rate override: passing `editableRates[loanId] = 5.50` applies 5.50% for P&I
- Loan with `loanTermYears = null` → `termUnknown = true`, P&I repayment omitted
- Loan without `ioEndDate` → excluded from rows
- `totalAdditionalMonthlyCents` = sum of deltas across all rows with known terms
- Two loans ordered ascending by `ioEndDate` in the rows array

**Verification:** Page renders timeline with event pins; table shows editable P&I rate cells that update the delta on change; stepped chart shows cashflow dropping at each rollover; verdict headline shows total additional monthly + annualised amount.

---

### U5. Model a Purchase calculator

**Goal:** Model the cashflow and portfolio impact of a hypothetical property purchase.

**Requirements:** Purchase price, rent, deposit source (equity/cash/both), LMI when LVR > 80%, purchase costs (collapsible), new loan terms, running costs (collapsible), portfolio impact tiles. (see origin: `docs/brainstorms/plan-page-requirements.md` §"Scenario 3")

**Dependencies:** U1, U2, U3 (shared components)

**Files:**
- `app/(app)/plan/model-purchase/page.tsx` (new)
- `lib/aggregate/plan/calculators/model-purchase.ts` (new)
- `__tests__/lib/plan-model-purchase.test.ts` (new)

**Approach:**

The page has a two-column layout:
- **Left (inputs):** property details, deposit source, deposit & LMI, purchase costs (collapsible), new loan, running costs (collapsible)
- **Right (outputs):** funding stack, monthly cashflow, portfolio impact tiles, household surplus bar

Calc engine (`lib/plan/calculators/model-purchase.ts`) — pure function:

```
computeModelPurchase(inputs, portfolioContext)
  → {
       fundingStack: { depositCents, eachPurchaseCost, cashRequired, newLoanCents, lvrPct }
       monthlyCashflow: { rentMonthlyCents, loanRepaymentCents, runningCostsMonthlyCents, netCents }
       gearing: 'positive' | 'neutral' | 'negative'
       portfolioImpact: {
         before: { totalValueCents, totalDebtCents, blendedLvr, netCashflowMonthlyCents }
         after:  { totalValueCents, totalDebtCents, blendedLvr, netCashflowMonthlyCents }
       }
       equitySourcesAfterLvr: Array<{ propertyId, lvrBefore, lvrAfter }>
       showLmi: boolean    // LVR > 80%
     }
```

Key formulas:
- Monthly rent = `weeklyRent × 52 / 12`
- New loan repayment: PMT (P&I) or IO formula as per loan type
- Usable equity per property: `(valuation × lvrSlider%) - sum(latestBalance for loans on that property)`; property without valuation: excluded (note shown)
- LVR = `newLoan / purchasePrice`; if > 0.80: surface LMI input inline
- `lmiAmountCents` is added to `newLoanCents` (capitalised, per PRD)
- Running costs are annualised ÷ 12; property management fee = `feePercent × annualRent`
- Blended LVR after = `(totalDebt + newLoan) / (totalValue + purchasePrice)`

Collapsible sections: "One-off costs" and "Annual holding costs" use disclosure pattern (HTML `<details>` or controlled state). Collapsed state shows item count + running total.

Portfolio impact tiles: 6 tiles in a before/after grid. When equity is drawn from multiple properties, additional tiles for each equity source property LVR.

**Patterns to follow:** `docs/visual-designs/model-purchase.html`, `model-purchase.css`; deposit amount/percentage linkage (changing one updates the other — keep both in state as derived from a single `depositCents` source of truth)

**Test scenarios:**
- Monthly rent = weeklyRent × 52 / 12, rounded to cents
- Net cashflow = rent − loanRepayment − runningCosts; negative → `gearing: 'negative'`
- LVR = 75%: `showLmi = false`; LVR = 82%: `showLmi = true`
- LMI capitalised onto loan: `newLoanCents` includes `lmiAmountCents`
- Usable equity at 80% LVR: `(valuation × 0.80) − outstanding loans`; property without valuation → excluded
- Portfolio blended LVR after: `(existingDebt + newLoan) / (existingValue + purchasePrice)`
- Net portfolio cashflow after = existing + new property net
- Annual running costs ÷ 12 = monthly running costs (rounding verified)
- PM fee = `feePercent / 100 × weeklyRent × 52` (annual); ÷ 12 for monthly
- Vacancy allowance = `vacancyPercent / 100 × weeklyRent × 52 / 12` (reduces effective rent)

**Verification:** Two-column layout renders; all input fields update outputs live; collapsible sections show count + total when collapsed; funding stack sums correctly; 6 portfolio tiles show before/after columns; household surplus bar shows (or inline prompt if no household data).

---

### U6. Hold vs Reinvest calculator

**Goal:** Compare equity trajectory of holding a property vs selling and reinvesting in a higher-growth market.

**Requirements:** 3-step form (sale, reinvest costs, comparison params); sale summary ledger; reinvest summary ledger; friction banner + break-even; equity trajectory line chart; comparison tiles. (see origin: `docs/brainstorms/plan-page-requirements.md` §"Scenario 4")

**Dependencies:** U1, U2, U3 (shared components)

**Files:**
- `app/(app)/plan/hold-reinvest/page.tsx` (new)
- `lib/aggregate/plan/calculators/hold-reinvest.ts` (new)
- `__tests__/lib/plan-hold-reinvest.test.ts` (new)

**Approach:**

3-step form layout (Step 1: Sale, Step 2: Reinvestment costs, Step 3: Comparison parameters). Steps are all visible simultaneously (scrollable), not a wizard.

Calc engine (`lib/plan/calculators/hold-reinvest.ts`) — pure function:

```
computeHoldReinvest(inputs, propertyLoans, latestValuation)
  → {
       saleSummary: { grossProceeds, loanPayouts, netAfterLoans, netAfterCgt }
       reinvestSummary: { purchasePrice, netDeposit, newLoan, lvr, effectiveNewLoan }
       showLmi: boolean
       frictionCents: number    // gap: effectiveNewLoan − outstanding_loans
       frictionPct: number      // frictionCents / purchasePrice
       trajectories: {
         holdEquityByYear: number[]   // index 0 = year 0, length = horizon + 1
         reinvestEquityByYear: number[]
       }
       breakEvenYear: number | null   // null = never within horizon
       blocked: boolean               // net_deposit ≤ 0
       blockedReason: string | null
     }
```

Key formulas (per PRD):
```
hold_equity_yrN    = V × (1 + g_hold)^N − outstanding_loans
reinvest_equity_yrN = V × (1 + g_reinvest)^N − effective_new_loan
```
where `V = salePrice` (purchase_price = sale_price, fixed per PRD).

Sale summary: `grossProceeds = salePrice − agentCommission − marketing − legalSelling − otherCosts`. Loan payouts = `sum(latestBalance)` for loans secured against this property. If a loan has no balance recorded: show "balance unknown" with a link to the loan detail page; exclude from computation.

LMI surfaces when `newLoan / purchasePrice > 0.80`. LMI added to `effectiveNewLoan`.

Blocked state: when `netDeposit ≤ 0` — display the block message from PRD; chart and tiles are hidden.

**Equity trajectory chart** (Recharts `ComposedChart`):
- X-axis: Year 0 to horizon (5/10/15/20)
- Y-axis: equity in dollars
- Two `Line` series (hold, reinvest)
- Shaded area between them: `Area` with custom fill — deficit (reinvest < hold) in one colour, lead (reinvest > hold) in another
- Year-0 bracket annotation: `↕ $X switching cost`
- Crossover year marked with a `ReferenceLine` if it occurs within horizon
- If `g_reinvest ≤ g_hold`: note "At this growth rate, reinvesting never catches up"

Assumptions block: displayed below the chart, non-collapsible. Lists the 6 assumptions from the PRD verbatim.

Time horizon segmented control: 4 options (5yr / 10yr / 15yr / 20yr). Updates chart and comparison tiles live.

Comparison tiles: 5 rows × 2 columns (Hold / Reinvest). Final row: break-even.

**Patterns to follow:** `docs/visual-designs/hold-reinvest.html`, `hold-reinvest.css`; dashboard `ComposedChart` usage for multi-series charts

**Test scenarios:**
- Sale proceeds: `salePrice $850k − commission $18.7k (2.2%) = $831.3k gross`
- Net deposit with loan payout: `$831.3k − $500k loan = $331.3k net cash after loans`
- CGT deducted: `$331.3k − $40k CGT = $291.3k net after CGT`
- Buying costs reduce net deposit: `$291.3k − $20k stamp duty − $3k legal = $268.3k net deposit`
- New loan = `$850k − $268.3k = $581.7k`; LVR = `68.4%` → `showLmi = false`
- LVR > 80% → `showLmi = true`
- Hold equity at year 5: `$850k × (1.05)^5 − $500k` ≈ correct
- Reinvest equity at year 5: `$850k × (1.07)^5 − $581.7k` ≈ correct
- Break-even year: first N where reinvest > hold
- Blocked when net deposit ≤ 0 (sale price insufficient to cover loans + costs)
- `frictionCents = effectiveNewLoan − outstandingLoans` equals sum of all costs (selling + buying + CGT + LMI)
- If `g_reinvest ≤ g_hold`: `breakEvenYear = null`

**Verification:** 3-step form rendered; property dropdown populates from plan context; sale price pre-filled from latest valuation; sale and reinvest summaries update live; friction banner shows; equity trajectory chart renders with both curves; comparison tiles show correct year-N values; assumptions block is always visible.

---

## System-Wide Impact

- **New route group**: `app/(app)/plan/` gains 4 sub-routes; all inherit the `app/(app)/layout.tsx` shell (sidebar, auth)
- **New API route**: `app/api/plan/context/route.ts` — read-only, no mutations
- **`lib/reporting/` renamed to `lib/aggregate/`** (PR 0): all existing callers updated; no behaviour change
- **New files in `lib/aggregate/plan/`**: `context.ts` + 4 calculator files; no changes to existing `lib/aggregate/` repositories or services
- **No schema changes**: all data is read from existing tables
- **No migrations**: nothing to run

---

## Deferred Implementation Notes

- The trailing 3-month period for `portfolioBaseline` boundary dates (exactly what "3 full months ago" means: last 3 completed calendar months vs trailing 90 days) — resolve during implementation, document in a brief inline comment
- Whether "active" properties exclude `endDate < today` or `endDate IS NULL` — verify intent in `fetchPropertiesActiveInRange` vs the requirement; the existing `computePortfolioLVR` uses `l.endDate > today` as the active filter, suggesting endDate on or past today = active
- Exact Recharts props for the IO Rollover stepped chart Y-axis domain (should it start from current cashflow or from 0?) — determine during implementation based on design fidelity
- IO remaining P&I term estimation: the plan uses `loanTermYears` as total term and derives IO years from `startDate` → `ioEndDate`. If `startDate` is null for a loan, remaining term cannot be derived — show "term unknown" in this case too

---

## PR Sequence

| PR | Units | What ships |
|----|-------|-----------|
| 0 | chore | Rename `lib/reporting/` → `lib/aggregate/`; update all import paths; no behaviour change |
| 1 | U1 + U2 | `GET /api/plan/context` + updated landing card grid |
| 2 | U3 | Rate Sensitivity calculator |
| 3 | U4 | IO Rollover calculator |
| 4 | U5 | Model a Purchase calculator |
| 5 | U6 | Hold vs Reinvest calculator |

PR 0 is a prerequisite for all others — it establishes the `lib/aggregate/` namespace before any plan code lands. PRs 2–5 all depend on PR 1 (plan context API). PRs 2–5 are independent of each other once PR 1 merges.
