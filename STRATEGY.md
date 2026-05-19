# Folio — Strategy

## Product

**What it is:** A private portfolio dashboard for Australian property investors.
Upload PM statements and loan documents; get a single source of truth on net cashflow,
LVR, equity, and portfolio health — without a spreadsheet.

**Who it's for:** Individual investors managing 1–5 properties, typically with an
investment trust or company structure. They receive monthly PM statements and deal
with multiple lenders. They want clarity, not a full accounting product.

**What it is not:** An accounting tool, a lender integration, a public service,
or a spreadsheet replacement for complex structures.

## Current state (as of 2026-05-19)

### Implemented pages
| Page | State |
|------|-------|
| Landing | Done — hero + 3-feature callout |
| Login | Done — passwordless OTP flow |
| Dashboard | Done — metrics tiles, 12-month cashflow chart, statement alerts |
| Properties | Done — table view, entity ownership, statement status |
| Loans | Done — table of borrowings, lender, balance, property security |
| Entities | Done — cards with rename/delete/archive, property+loan stats |
| Upload | Done — PDF ingestion, AI extraction, property/loan matching, mortgage entry |

### Designed but not yet implemented
| Screen | Design file location |
|--------|---------------------|
| Property Detail | docs/designs/folio.html — screen 03 |
| Loan Detail | docs/designs/folio.html — loan detail section |
| Household | docs/designs/folio.html — screen 04 |
| Plan / Scenario modeling | docs/designs/folio.html — Plan screen |
| Settings | docs/designs/folio.html — Settings screen |
| Add Property form | docs/designs/folio.html — screen 06 |
| Add Loan form | docs/designs/folio.html — screen 07 |
| Sidebar (collapsible property/loan sections) | docs/designs/folio.html — nav |
| Dashboard Prompts strip | docs/designs/folio.html — "Needs your attention" cards |

### Design system
All designs live in `docs/designs/`. The canonical design reference is `folio.html`
(main app) + `folio.css` (styles). Landing and login each have dedicated files.
Visual designs are the source of truth for UI decisions.

## Key tracks

### Track 1 — Core portfolio views (current focus)
Implement Property Detail, Loan Detail, and the dashboard Prompts strip.
These are the highest-leverage screens for the core user flow.

### Track 2 — Household context
Income sources, living expenses, personal surplus. Backend partially exists;
UI not started.

### Track 3 — Plan / Scenario modeling
Rate sensitivity, extra repayments, projection charts. Backend not started.

## Engineering principles
- Full-stack TDD on backend (route → service → repository, test-first)
- No frontend unit tests — Playwright e2e for critical paths
- Logic lives in backend services; frontend renders computed values
- Branch + PR per feature; never commit to main
- See CLAUDE.md for conventions and commands

## Workflow
Uses compound engineering loop:
1. `/ce-brainstorm` — clarify requirements from design
2. `/ce-plan` — implementation plan (approved before coding)
3. Implement (branch, TDD backend, build frontend)
4. `pnpm pr:create` — screenshots embedded in PR
5. `/ce-code-review` — multi-agent review
6. `/ce-compound` — capture learnings
