# Household — Personal Financial Baseline
*Requirements document · May 2026*

## Problem

Folio's portfolio cashflow numbers are only part of an investor's picture. Without a personal income and expense baseline, questions like "what is my total monthly surplus?" or "can I afford to service another loan?" cannot be answered. The Dashboard and Plan pages need this data but have nowhere to pull it from.

## Goal

Give users a simple, low-friction way to maintain personal income and expense estimates. These are not actuals (no bank feed, no transaction tracking) — they are standing estimates the investor keeps roughly up to date. The screen derives personal surplus from them and makes that figure available to the rest of the product.

## Non-goals (V1)

- Portfolio cashflow on this screen — that integration lives on Dashboard (Portfolio pulse) and Plan
- Category taxonomy in the UI — category column exists in schema but is unused in V1
- Historical timeline analysis — `effective_from` is stored but no time-range query UI is built
- Bank feed ingestion or personal transaction tracking
- Budget vs actuals comparison

## Screen: `/household`

### Position summary table

A table with three columns: label, Monthly, Annual. Rows:

| Section | Row |
|---|---|
| **Income** | One row per income item (name + derived amounts) |
| | Total income subtotal |
| **Expenses** | One row per expense item (name + derived amounts) |
| | Total expenses subtotal |
| | **Personal surplus** = total income − total expenses |

Monthly and annual figures are always derived from the stored amount + frequency — never entered directly.

### Manage line items

Two collapsible sections below the summary: **Income sources** and **Living expenses**.

Each section shows:
- A list of items: name, derived monthly amount, Edit button
- A count + monthly total in the section header (e.g. "2 items · $12,500 / mo")
- An "+ Add" button at the bottom

**Inline add/edit:** clicking Edit or Add expands an inline form in the list (no modal, no drawer). Fields:
- Name (free text — user labels it anything they want)
- Amount (numeric)
- Frequency picker: Weekly / Fortnightly / Monthly / Annual
- Save + Cancel

**Delete:** accessible from the edit state. Soft delete (`deleted_at`).

### Null state

When no items exist, the summary table shows $0 across all rows and each collapsible section shows a prompt to add the first item.

## Frequency derivation

All amounts are stored as entered in the native frequency. Monthly equivalent is derived at read time:

| Frequency | Monthly factor |
|---|---|
| Weekly | × 52 ÷ 12 |
| Fortnightly | × 26 ÷ 12 |
| Monthly | × 1 |
| Annual | ÷ 12 |

Annual = monthly × 12 (always; not stored separately).

## Data model

Table: `personal_budget_items` (entity table — edit in place)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users; RLS boundary |
| `type` | enum `income \| expense` | |
| `name` | text | User-supplied label; no fixed taxonomy |
| `amount_cents` | integer | Stored in native frequency |
| `frequency` | enum `weekly \| fortnightly \| monthly \| annual` | |
| `effective_from` | date | Defaults to today; user can set a past date |
| `category` | text | Nullable; unused in V1; reserved for future bank-feed migration |
| `deleted_at` | timestamptz | Soft delete |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

RLS: standard user-scoped policy (users manage own rows).

## Extensibility notes

The schema includes two columns unused by V1 that keep future options open without a migration:

- **`category`** (nullable text) — if categorization is ever added (e.g. to support bank feed matching), items already have a field for it
- **`effective_from`** (date) — if historical analysis is ever wanted, the data to reconstruct past baselines is already stored

The combined personal surplus + portfolio cashflow view is not on this screen. It belongs on Dashboard (Portfolio pulse section) and the Plan page, both of which can consume the personal surplus figure derived here.
