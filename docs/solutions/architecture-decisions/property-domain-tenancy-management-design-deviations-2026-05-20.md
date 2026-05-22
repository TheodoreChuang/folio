---
title: "Property domain: tenancy and management agent design deviations from visual spec"
date: 2026-05-20
category: docs/solutions/architecture-decisions
module: lib/property
problem_type: architecture_decision
component: property-detail
resolution_type: intentional_deviation
severity: low
related_components:
  - property_tenancies
  - property_management_agents
tags:
  - property
  - tenancy
  - management-agent
  - design-deviation
  - date-range
  - crud
---

# Property domain: tenancy and management agent design deviations from visual spec

Three decisions made during the property domain uplift (Phase 1–4, May 2026) that
diverge from `docs/visual-designs/property.html`. Sync these back into the design
files before the next design pass on the Management tab.

---

## 1. Removed: "Renew lease" action

**Design shows:** A "Renew lease" button that pre-fills a new lease form from the current lease.

**What shipped:** Plain "Add lease" only.

**Why:** The tenancy model supports multiple concurrent active leases (sharehouses, granny
flats), making "the current lease" ambiguous when more than one exists. "Add lease" achieves
the same outcome without implying a single-active-lease constraint.

**Design update needed:** Replace the "Renew lease" button with "Add lease". No pre-fill
behaviour required.

---

## 2. Removed: `is_current` flag — replaced with date-range derivation

**Design and original plan used:** An `is_current` boolean on both `property_tenancies` and
`property_management_agents` to identify the active record.

**What shipped:** Date-range derivation only.

| State | Condition |
|-------|-----------|
| Active | `deleted_at IS NULL AND (end_date IS NULL OR end_date >= today)` |
| Expired | `deleted_at IS NULL AND end_date < today` |

**Why:** An `is_current` flag requires programmatic maintenance (promotion on delete, swap on
renewal) that introduces correctness bugs and is redundant once end dates are editable. Date
ranges carry the same information without the invariant overhead.

**Design update needed:**
- The "Periodic" lease label (fixed-term leases that roll over) should instead display as a
  **"Vacated / action needed"** warning when `leaseEnd < today`. The UI should prompt the
  investor to: add a new fixed-term lease, add a new periodic lease (no end date), or confirm
  the property is vacant.
- Same pattern for management agreements: expired `effectiveTo` shows a warning rather than
  silently implying the last agreement is still active.

---

## 3. Symmetric CRUD for management agreements — no auto-end operation

**Original plan specified:** A `setCurrentManagementAgent` operation that atomically
deactivated the existing agent and inserted a new one.

**What shipped:** Plain add / update / delete — the same API shape as tenancies.

**Why:** The atomic swap assumed a single-active-agent invariant. With date-range derivation
(decision 2 above) there is no invariant to enforce. If an investor switches agents, they
update the outgoing agent's `effectiveTo` and add the incoming agent with `effectiveFrom`.
This is consistent, predictable, and mirrors how tenancies work.
