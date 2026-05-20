# Requirements: Property Domain Uplift

**Date:** 2026-05-20
**Status:** Ready for planning

## Overview

Full uplift of all property-related screens to match the visual designs in
`docs/visual-designs/property.html` and `docs/visual-designs/add-property.html`.
The current implementation is functional but minimal — this brings it to design parity
while adding new features (Management tab, Insights tab, lifecycle actions).

---

## Scope

### In scope

| Area | Description |
|---|---|
| Schema additions | New fields on `properties`; two new tables |
| Add Property form | Multi-step redesign matching `add-property.html` |
| Property detail — Overview tab | 3-col layout; equity card; property-level alert prompt |
| Property detail — Metric strip | Net cashflow tile; LVR visual meter |
| Property detail — Management tab | New tab: tenancy + PM agent history with modals |
| Property detail — Insights tab | Rename Valuations → Insights; add cashflow chart + value-over-time chart |
| Property detail — Loans tab | Richer card with inline balance snapshot |
| Property detail — Lifecycle | Overflow menu: mark as sold + delete |
| Properties list | LVR column populated; sold properties shown differently |

### Out of scope

- **Transactions tab redesign** — existing implementation stays untouched; design TBD
- **PSMA address lookup** — plain text input throughout
- **Ownership share %** — co-ownership model deferred; entity assignment is sufficient for 1–5 property investors
- **Hard enforcement on sold properties** — no blocking of post-sale-date actions; soft informational UI only
- **Auto-cascades on sale** — no auto-closing of loans/leases; informational "what this changes" callout in the modal is the extent of it

### Design note

The visual designs need updating to reflect two decisions made during this brainstorm:
1. The cashflow chart was removed from the Overview tab.
2. The Valuations tab is renamed to "Insights" and gains the cashflow chart alongside the existing valuations content. The updated layout (charts section + valuation history + add form) should be reflected in `docs/visual-designs/property.html` before the Insights tab work is reviewed.

---

## Requirements by area

### 1. Schema additions

**On the `properties` table** (new columns, all nullable — existing rows get null):

| Column | Type | Purpose |
|---|---|---|
| `property_type` | enum (`house`, `unit`, `townhouse`, `land`) | Displayed on details card and add-property form |
| `purchase_price_cents` | integer | Used to show cost base and growth-since-purchase in Insights |
| `sale_date` | date | Set via "Mark as sold" modal; marks property as sold |
| `sale_price_cents` | integer | Captured in "Mark as sold" modal; for records |
| `settlement_date` | date | Optional; captured in "Mark as sold" modal |

**New `property_tenancies` table** (append-only, entity table pattern):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid FK | |
| `user_id` | uuid FK | RLS |
| `tenants` | text | Full names on the lease |
| `lease_type` | enum (`fixed_term`, `periodic`) | |
| `lease_start` | date | |
| `lease_end` | date | Null for periodic |
| `weekly_rent_cents` | integer | |
| `bond_cents` | integer | Nullable |
| `is_current` | boolean | True for the active tenancy |
| `created_at` / `deleted_at` | timestamps | Soft delete |

**New `property_management_agents` table** (append-only):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid FK | |
| `user_id` | uuid FK | RLS |
| `agency_name` | text | |
| `contact_name` | text | Nullable |
| `phone` | text | Nullable |
| `email` | text | Nullable |
| `fee_percent` | decimal(5,2) | Management fee incl. GST |
| `statement_cadence` | enum (`weekly`, `fortnightly`, `monthly`, `bi_monthly`) | |
| `effective_from` | date | |
| `effective_to` | date | Null = current agent |
| `is_current` | boolean | |
| `created_at` / `deleted_at` | timestamps | Soft delete |

---

### 2. Add Property form (`/properties/new`)

The form gains new sections while keeping the same single-page layout (no multi-page wizard).

**Sections:**

1. **Address** — plain text input + optional nickname + property type selector (House / Unit / Townhouse / Land)
2. **Acquisition** — purchase date (required), purchase price (optional), stamp duty (optional), legal costs (optional)
3. **Ownership** — entity picker (existing rich picker UI); no ownership share %
4. **Opening valuation** — current value, as-of date, source (same as today; optional)
5. **Lease & management** *(optional, collapsible)* — managing agent name, weekly rent, lease start/end, tenant name
6. **Linked loans** *(optional)* — show existing unlinked loans the user can attach; link to add-loan flow

**Behaviour:**
- Sections 5 and 6 are collapsed by default with a toggle to expand
- A sticky commit bar at the bottom summarises what will be created and has the primary "Add property" button
- On submit: create property, then if section 4 has a value create the opening valuation, then if section 5 has data create the first tenancy + PM agent record

---

### 3. Property detail — Metric strip

Replace the current 4-tile strip with:

| Tile | Value | Footer |
|---|---|---|
| Current value | `$XXX,XXX` | Trend vs prior valuation (e.g. `+3.4%`); "as of {date}" |
| Gross yield | `X.X%` | Weekly rent `$XXX / wk`; period label |
| Net cashflow · monthly | `−$XXX` or `+$XXX` | Trend vs prior month; "avg, 3 mo" |
| LVR | `XX%` | Visual meter with colour bands (0–60% green, 60–80% amber, 80%+ red); debt/value breakdown |

The net cashflow tile requires the same per-property cashflow data as the Insights tab (reuse the same API response).

---

### 4. Property detail — Overview tab

Replace the current edit form with a 2-column layout. Net cashflow is already visible in the metric strip directly above the tabs — a separate callout here would be redundant.

**Left column — Property details card** (inline editable field-list):
- Nickname, address, property type, purchase price, purchase date, entity (dropdown), managing agent (read-only label linking to Management tab), lease end date (read-only label linking to Management tab), sale date / sale price (read-only if set; shown as "Not sold" otherwise)
- Save changes button at the bottom of the card

**Right column — Equity position card**:
- Current value (with valuation source and date)
- Total debt (count of secured loans)
- Net equity (value − debt, shown as positive)
- LVR meter (same visual as metric strip tile)
- Staleness note with link to Insights tab if valuation is > 60 days old

**Property-level prompt** (above the 2-col grid when applicable):
- Show if the property has a missing PM statement for the current month
- Same "Action needed" style as the dashboard prompt
- CTA: "Upload statement" (links to upload flow pre-filtered to this property) and "Mark estimated"

---

### 5. Property detail — Management tab (new)

**Tenancy & lease card:**
- Current tenancy: tenants, lease type badge, lease start, lease end (with "in N weeks" badge if < 8 weeks away), weekly rent, bond
- "+ Add tenancy" button opens the Add tenancy modal
- Previous tenancies collapsible history (tenant name, type badge, date range, rent)

**Property management card:**
- Current agent: agency, contact, phone, email, management fee %, statement cadence
- "+ Change agent" button opens the Change agent modal
- Previous agents collapsible history (agency name, date range, fee %)

**Add tenancy modal:**
- Mode toggle: New tenants / Renew lease
- Fields: tenants (text), new lease starts, lease type, lease end, weekly rent, bond (optional)
- "What this changes" informational block (no enforced cascades)
- On save: set current tenancy `is_current = false`, insert new tenancy with `is_current = true`

**Change agent modal:**
- Mode toggle: Agency-managed / Self-managed
- Fields: effective from, agency name, contact, phone, email, management fee %, statement cadence
- "What this changes" informational block
- On save: set current agent `is_current = false`, insert new agent with `is_current = true`

---

### 6. Property detail — Insights tab (renamed from Valuations)

**Tab name:** "Insights" (was "Valuations")

**Tab order:** Last — `Overview | Management | Loans | Transactions | Insights`
Placed last intentionally: the cashflow chart section is stubbed pending updated designs, and this gives the design time to land before full implementation.

**Design note:** The visual design `docs/visual-designs/property.html` still shows a "Valuations" tab. This needs updating to show "Insights" with both charts in order. See the Design note in the Scope section above.

**Layout (top to bottom):**

**Cashflow section — stubbed:**
- Placeholder section ("Cashflow chart · coming soon") until the updated design is available
- The section heading and container should be present so filling it in later requires no structural changes
- Data endpoint (`GET /api/properties/[id]/cashflow?months=12`) is not built in this uplift

**Valuations section — fully implemented:**
- Summary metrics strip: current value (with growth vs prior), growth since purchase (% and $), last valuation staleness
- Value-over-time line chart (plotted from valuation history, purchase price as baseline)
- Valuation history table: date, source badge, value, delta vs prior ($ and %), ⋯ overflow → delete with inline confirm
- Add valuation form: date, value, source, reference (optional), notes (optional)

---

### 7. Property detail — Loans tab

Keep the existing structure; upgrade the loan card to show:
- Lender + account number (ending XXXX)
- Interest type badge (e.g. "Interest only · IO ends {date}")
- Offset balance (if present)
- Interest rate
- Monthly repayment
- Balance history (last 4 snapshots inline)
- "+ Add balance snapshot" button directly in the card

No change to the "loan record lives in the Loans section" footer note.

---

### 8. Lifecycle — Overflow menu

A `⋯` button in the page header (top-right, next to "Upload statement") opens a small menu:

**Mark as sold…**
- Opens a modal with fields: sale date (required), sale price (required), settlement date (optional), buyer (optional), notes (optional)
- "What this changes" informational block:
  - Property status changes to Sold
  - Dashboard totals will exclude this property
  - Active loans are noted (user prompted to close them separately — no auto-cascade)
- On confirm: sets `sale_date`, `sale_price_cents`, `settlement_date` on the property record
- Property list shows sold properties with a "Sold" badge and subdued styling

**Delete property…**
- Inline confirm in the menu (not a modal)
- Named target in the copy: "Delete 14 Elm Street?"
- On confirm: soft-delete the property; redirect to `/properties`
- If the property has ledger entries or linked loans, show a warning: "This property has N transactions and M loans. Deleting it will remove it from all reports."

---

## Success criteria

- [ ] All tabs on `/properties/[id]` match the visual designs (with the noted Insights tab exception)
- [ ] Management tab stores and retrieves tenancy + PM agent history correctly
- [ ] Insights tab shows both cashflow and valuation charts with real data
- [ ] "Mark as sold" sets sale fields; sold property is visually distinct in the properties list
- [ ] Add property form captures property type + purchase price and creates opening tenancy/agent records when provided
- [ ] Metric strip net cashflow tile shows real data
- [ ] All new tables have RLS policies
- [ ] `pnpm test` and `pnpm test:integration` pass
