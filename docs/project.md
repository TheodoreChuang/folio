# Folio — Project

## Product

**What it is:** A private portfolio dashboard for Australian property investors.
Upload PM statements and loan documents; get a single source of truth on net cashflow,
LVR, equity, and portfolio health — without a spreadsheet.

**Who it's for:** Individual investors managing 1–5 properties, typically with an
investment trust or company structure. They receive monthly PM statements and deal
with multiple lenders. They want clarity, not a full accounting product.

**What it is not:** An accounting tool, a lender integration, a public service,
or a spreadsheet replacement for complex structures.

See `docs/product-foundation.md` for full product vision, user profile, and brand principles.

## Current state (as of 2026-05-20)

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
| Screen | Design file |
|--------|-------------|
| Property Detail | `docs/visual-designs/property.html` |
| Loan Detail | `docs/visual-designs/loan.html` |
| Household | `docs/visual-designs/household.html` |
| Plan / Scenario modeling | `docs/visual-designs/plan.html` |
| Settings | `docs/visual-designs/settings.html` |
| Add Property form | `docs/visual-designs/add-property.html` |
| Add Loan form | `docs/visual-designs/add-loan.html` |
| Sidebar (collapsible property/loan sections) | `docs/visual-designs/folio.html` (nav) |
| Dashboard Prompts strip | `docs/visual-designs/dashboard.html` |

### Design system
All designs live in `docs/visual-designs/`. Each screen has its own HTML file.
Shared styles are in `folio.css`. Visual designs are the source of truth for UI decisions.

## Task tracking

GitHub Issues + milestones. One milestone per screen/feature (e.g. "Property Detail").
Issues within the milestone describe individual PRs with acceptance criteria.
`docs/plans/` holds the active implementation spec — created during `/ce-plan`,
deleted when the PR merges.
