# Requirements: Plan Page

**Date:** 2026-05-31  
**Updated:** 2026-06-02 (synced back from design iteration)  
**Status:** Design complete → ready for implementation  
**Route:** `/plan`

---

## Purpose

The Plan page helps active investors in their accumulation phase model the financial impact of portfolio decisions. It answers "what happens if I buy the next property?" and "what happens if I sell?" alongside passive exposure calculators ("what if rates rise?", "when do my IO loans roll over?").

All calculators are read-only. Nothing is written to the database. No scenario is persisted — these are always one-time what-if explorations.

---

## Page Layout

**Card grid → own pages.** The Plan landing shows a 2×2 grid of scenario cards. Each card has a teaser question and a short description. Clicking a card navigates to a dedicated calculator page (`/plan/rate-sensitivity`, `/plan/interest-only`, `/plan/model-purchase`, `/plan/hold-reinvest`). Each calculator page has a "← All scenarios" back link.

Cards are **enabled or disabled** based on minimal live data loaded on page entry. Disabled cards are visible but not interactive — they show what the app can do and prompt the user to add the relevant data.

| Card | Disabled when |
|------|--------------|
| Rate Sensitivity | User has no variable loans |
| IO Rollover | User has no IO loans |
| Model a Purchase | Never — works without any existing data |
| Hold vs Sell & Reinvest | User has no properties |

The live data needed for this logic is minimal: count of variable loans, count of IO loans, count of properties. No financial values required on the landing.

**Excluded:** Extra repayments (low value for Australian investors who use offset accounts).

---

## Data the page loads

**Landing (card grid):** Three counts only — variable loan count, IO loan count, property count. Used purely for enable/disable logic.

**Calculator (on page load):** Full portfolio context loaded when the user opens a specific calculator:
- All properties with their latest valuation
- All installment loans with rate, type, IO end date, term, current balance (latest from `installment_loan_balances`)
- Household surplus: derived from `personal_budget_items` (sum of monthly income minus expenses; null if no items recorded)

---

## Scenario 1: Rate Sensitivity

**Purpose:** Move all variable loan rates by a fixed delta. See total portfolio cashflow impact.

### Inputs
| Input | Type | Notes |
|-------|------|-------|
| Rate delta | Slider −3% to +3%, step 0.25% | Default: 0% (today) |

Integer-step tick marks (−3%, −2%, −1%, Today, +1%, +2%, +3%) are clickable — tapping a tick jumps the slider to that value. The slider thumb shows the current value as a floating tag.

### Logic
- Applies to variable-rate loans only (`rateType = 'variable'`)
- Each loan keeps its own base rate; the delta is added on top (e.g. CBA at 6.35% + 0.5% → 6.85%)
- Line-of-credit loans are treated as variable
- Fixed-rate loans: excluded from computation
- Loans with no rate recorded: excluded from computation; a footnote shows "N loans excluded — no rate recorded"

### Outputs
- **Headline:** Monthly portfolio cashflow at the selected delta (rent + income − repayments − expenses)
- **Delta vs today** (+/−$X / mo)
- **Context line:** When at today's rate, shows total repayments across all variable loans. When at a non-zero delta, shows the total repayment change.
- **Household surplus bar:** Shown if household data exists — bar of surplus consumed, with remaining buffer amount. If household not set up, shows an inline prompt: "Set up your Household to see how much of your monthly surplus a rate move would use."
- **Per-loan impact table:** Loan name + lender + balance + current rate + loan type, today's repayment, repayment at delta (with new rate as sub-line), Δ/mo. Total row at the bottom.

---

## Scenario 2: IO Rollover Schedule

**Purpose:** Show when each IO loan flips to P&I and the payment shock at each event.

### Visibility
Hidden entirely if the user has no interest-only loans with an IO end date.

### Inputs
P&I rate is editable **per loan** directly in the rollover table. Pre-filled with each loan's IO rate minus a default discount of **0.30%** (P&I rates are typically lower than IO). No global delta input.

### Logic
- P&I monthly repayment = PMT formula using: outstanding balance at IO end date (estimated from latest balance), P&I rate (per-loan editable, defaulting to IO rate − 0.30%), remaining P&I term years (loan term years − IO period years)
- If `loanTermYears` is null: show "term unknown" for that row — do not guess
- If `ioEndDate` is null: exclude from timeline — do not show

### Outputs
- **Verdict headline:** Total additional monthly servicing once all loans roll to P&I, plus annualised figure. Household surplus bar showing how much of the surplus is consumed once fully rolled, with remaining headroom (or breach amount).
- **Timeline:** Dynamic horizontal axis from start of current year to latest IO end + 1 year, with a "Today" marker and an event pin per IO loan (loan name, end date). Pins alternate heights when dense (>4 loans).
- **Per-loan rollover table:** Loan name + balance + rate + P&I term, IO end date, per-loan editable P&I rate, IO monthly repayment, after-P&I monthly repayment, Δ/mo
- **Stepped cashflow chart:** SVG chart on the same time axis as the timeline. Net portfolio cashflow steps down at each rollover event. Shows a "surplus limit" reference line. Dots at each rollover with value labels (suppressed at >4 loans). Stats below: Today / Fully rolled / Surplus headroom.
- **Footer footnote:** "Assumes constant IO rates · IO loans are not refinanced"

---

## Scenario 3: Model a Purchase

**Purpose:** Model the cashflow and portfolio impact of buying a hypothetical fourth (or nth) property.

### Inputs

#### Property
| Input | Type | Notes |
|-------|------|-------|
| Purchase price | Currency | Required |
| Estimated weekly rent | Currency | Required |

#### Deposit source
Segmented control: **Equity** / **Cash** / **Both**

**If Equity or Both:**
- Property list shows all properties with their computed usable equity
- Usable equity per property = latest valuation × (editable LVR %, defaulting to 80%) − sum of outstanding loans on that property
- If no valuation exists for a property: shown with "No valuation recorded" and excluded from equity calculation
- User can select one or more properties as equity sources
- For each selected property: enter dollar amount to draw (editable; pre-filled with full usable equity at 80%)

**If Cash or Both:**
- Deposit is entered as an amount or percentage of purchase price; the remainder becomes the loan. No separate "cash amount" field.

#### Deposit & LMI
The deposit section shows amount and % inputs (linked — changing one updates the other), plus the resulting loan amount and LVR. If the deposit is under 20% (LVR > 80%), an LMI input surfaces inline: "LMI — deposit under 20% — capitalised onto the loan." LMI is not a purchase cost; it is added to the loan amount.

#### Purchase costs (all optional, default $0)
Collapsible "One-off costs" subsection. Individual line items:
- Stamp duty
- Legal & conveyancing
- Building & pest
- Depreciation schedule (cost of obtaining QS report)
- Registration & transfer fees
- Buyer's agent fee
- Upfront maintenance (known repairs or make-ready costs — roof, AC, blinds etc.)

Total costs auto-sum as line items are filled in.

#### New loan
| Input | Type | Default |
|-------|------|---------|
| Interest rate | % | — |
| Loan type | Select: IO / P&I | — |
| IO term (if IO) | Years | — |
| Loan term | Years | 30 |

#### Running costs (annual, all optional — annualised then ÷ 12 for monthly cashflow)
Collapsible "Annual holding costs" subsection. Individual line items:
- Council rates — $/yr
- Water & sewerage — $/yr
- Building insurance — $/yr
- Landlord insurance — $/yr
- Strata / body corporate — $/yr
- Land tax — $/yr
- Repairs & maintenance — $/yr
- Accounting & admin — $/yr
- Property management fee — % of annual rent (auto-converts to $)
- Vacancy allowance — % of annual rent

### Logic
- Monthly cashflow on new property = (weekly rent × 52 ÷ 12) − monthly loan repayment − (total annual running costs ÷ 12)
- Gearing classification: positive / neutral / negatively geared, based on net cashflow sign
- Portfolio impact: previous values read from portfolio context (total value, total debt, blended LVR, portfolio net cashflow)
- After purchase: add new property value (purchase price) and new loan; portfolio cashflow adds the new property's net cashflow
- Equity source property LVR after: (existing loans + equity drawn) ÷ valuation for each affected property

### Outputs

#### Funding stack
| Line | Value |
|------|-------|
| Deposit (X% of price) | $X |
| [Each purchase cost line with a value] | $X |
| **Cash required** | **$X** |

Funding source chips appear below the stack: "Equity $X" and/or "Cash $X" depending on the selected source. When equity is drawn from multiple properties, the chips show the combined equity draw total (per-property breakdown is in the inputs column).

#### Monthly cashflow on this property
- Headline: e.g. −$520 / mo
- Classification: "negatively geared" / "positively geared" / "neutral"
- Breakdown: Rent $X − Loan repayment $X − Running costs $X = Net $X

#### Portfolio impact tiles (6)
| Tile | Before | After |
|------|--------|-------|
| Total value | $X | $Y |
| Total debt | $X | $Y |
| Blended LVR | X% | Y% |
| Net cashflow / mo | $X | $Y |
| Cash needed | — | $X (deposit + costs) |
| LVR per equity source property (one tile per source) | X% | Y% |

#### Household surplus bar
- Bar showing portfolio servicing consumed vs total surplus, with remaining buffer amount.
- If household data is not set up: show an inline prompt "Set up your Household to see how much of your monthly surplus this purchase would use. → Add household income"

---

## Scenario 4: Hold vs Sell and Reinvest

**Purpose:** Compare the equity trajectory of holding a property against selling and reinvesting proceeds in a higher-growth market. Accounts for the transaction friction of selling and buying, so the investor can see when (if ever) the reinvestment overcomes the initial capital drag.

The sale proceeds calculation (Step 1) covers the "what do I walk away with?" question as a natural by-product of the comparison setup.

### Inputs

#### Step 1 — Sale
Dropdown of all properties. Pre-populated with name, suburb, latest valuation.

Sale price input pre-filled with latest valuation (editable). Shows delta vs valuation: "+$X vs latest valuation" or "−$X vs latest valuation".

**Selling costs (all optional, default $0)**
| Input | Type | Default |
|-------|------|---------|
| Agent commission | % of sale price | 2.2% |
| Marketing | $ | — |
| Legal fees (selling) | $ | — |
| Other selling costs | $ | — |

**CGT estimate**
- One optional currency field: "Estimated capital gains tax (optional)"
- Help text: "CGT can be substantial. Enter your estimate to see cash after tax. CGT depends on ownership history, depreciation claimed, and your marginal rate."
- If left blank: comparison proceeds without CGT; a note says "CGT excluded — enter an estimate for a more accurate comparison"

#### Step 2 — Reinvestment costs
New purchase price is **fixed to the sale price** — this creates an equal-value baseline so the comparison isolates growth rate vs friction, not asset scale. Not independently editable.

Collapsible "Buying costs" subsection (all optional, default $0):
| Input | Type |
|-------|------|
| Stamp duty | $ |
| Legal fees (buying) | $ |
| Buyer's Agent Fee | $ |
| Building & Pest inspection | $ |
| Registration & Transfer fees | $ |
| Depreciation schedule | $ |
| Upfront maintenance | $ |

"Upfront maintenance" covers known repairs or make-ready costs (e.g. roof, AC, blinds) — costs the market expects or the property requires before it is rentable. Does not increase starting property value in the model.

LMI is not a line item here — it is calculated from the resulting LVR and shown as a conditional input (see Logic).

#### Step 3 — Comparison parameters
| Input | Type | Notes |
|-------|------|-------|
| Expected annual growth — hold | % input | Growth rate assumed for the current property if held |
| Expected annual growth — reinvest | % input | Growth rate assumed for the new market |
| Time horizon | Segmented control: 5yr / 10yr / 15yr / 20yr | |

### Logic

**Sale proceeds**
- Gross proceeds = sale price − agent commission − marketing − legal (selling) − other selling costs
- Loans paid out at settlement = all installment loans secured against this property; uses latest balance from `installment_loan_balances`; if no balance recorded, shows "balance unknown — enter manually" inline
- Net cash after loans = gross proceeds − sum of loan payouts
- Net cash after CGT = net cash after loans − CGT estimate (if entered)

**Reinvestment structure**
All net proceeds are committed to the new purchase. No cash injection from outside the sale.

```
purchase_price     = sale_price  (fixed equal baseline)
net_deposit        = sale_price − selling_costs − loan_payouts − CGT − buying_costs
new_loan           = purchase_price − net_deposit
LVR                = new_loan / purchase_price
```

If LVR > 80%: an LMI input field is surfaced — "LMI likely applies at [X]% LVR — enter your lender's estimate." LMI is treated as an additional upfront cost that increases the new loan:

```
effective_new_loan = new_loan + LMI
```

If net_deposit ≤ 0 (proceeds don't cover the loans + costs): the reinvest track is blocked — show "Selling at this price would not free enough equity to reinvest. Adjust sale price or reduce costs."

**Equity trajectories**

Both tracks use the same property value (V = sale_price = purchase_price) and grow from year 0 with loans held static.

```
hold_equity_yr0       = V − outstanding_loans
hold_equity_yrN       = V × (1 + g_hold)^N − outstanding_loans

reinvest_equity_yr0   = V − effective_new_loan
reinvest_equity_yrN   = V × (1 + g_reinvest)^N − effective_new_loan
```

Year-0 equity gap (the friction hurdle the reinvestment must overcome):
```
gap = hold_equity_yr0 − reinvest_equity_yr0
    = effective_new_loan − outstanding_loans
    = selling_costs + buying_costs + CGT + LMI
```

Break-even year = smallest N where reinvest_equity_yrN > hold_equity_yrN; "Beyond [horizon]" if it doesn't occur within the selected horizon.

### Modeling assumptions

These are displayed permanently below the chart — not collapsible. They are load-bearing for the projections and must be visible.

| Assumption | Detail |
|------------|--------|
| Purchase price = sale price | New property assumed to be the same value as the one sold. Isolates growth rate vs friction — does not model scaling up or down. |
| All net proceeds go to deposit | No outside cash injected. Deposit = sale proceeds minus all costs. |
| Interest-only loans | Principal repayments, offset balances and debt recycling are excluded. |
| Growth applies to full property value | Growth rates are applied to the property value, not the equity — reflecting how leveraged returns actually work. |
| No rental income or expenses | Pure capital-growth comparison. Cashflow differences are out of scope. |
| CGT and stamp duty are your estimates | Accuracy of the projection depends on the quality of your inputs. Speak to your accountant regarding CGT. |

### Outputs

#### Sale summary (compact)
| Line | Value |
|------|-------|
| Sale price | $X |
| Agent commission | −$X |
| Marketing | −$X (if entered) |
| Legal fees (selling) | −$X (if entered) |
| Other costs | −$X (if entered) |
| Loan payout — [lender · loan name] (one row per loan) | −$X |
| **Net cash after loans** | **$X** |
| Estimated CGT | −$X (if entered) |
| **Net cash after CGT** | **$X** (only shown if CGT entered) |

#### Reinvestment summary (compact)
| Line | Value |
|------|-------|
| Purchase price | $X (= sale price) |
| Stamp duty | −$X (if entered) |
| Legal fees (buying) | −$X (if entered) |
| Building & Pest | −$X (if entered) |
| Registration & Transfer | −$X (if entered) |
| **Net deposit** | **$X** |
| New loan | $X |
| LVR | X% |
| LMI | −$X (if LVR > 80% and entered) |
| **Effective new loan** | **$X** |

#### Friction banner
Prominent block: switching cost amount + "X% of property value" + "This is the equity gap the reinvestment must recover before it outperforms holding." + break-even verdict ("Yr N" or "Never within N yrs").

#### Cashflow note
A note below the friction banner: "Reinvesting also requires servicing a larger loan, which will lower your monthly cashflow. This comparison measures equity growth only — it doesn't model the higher repayments."

#### Equity trajectory chart
Line chart with shaded bands. Two curves from year 0 to the selected horizon:
- **Hold** — starts at hold_equity_yr0, grows at g_hold applied to full property value
- **Reinvest** — starts at reinvest_equity_yr0 (lower by the friction amount), grows at g_reinvest
- Year-0 gap annotated with a bracket: "↕ $X switching cost"
- Shaded deficit band before crossover; shaded lead band after crossover
- If the curves cross within the horizon, the crossover year is marked with a pin
- If g_reinvest ≤ g_hold, the curves never cross — a note states this clearly

#### Comparison tiles
| Metric | Hold | Reinvest |
|--------|------|----------|
| Equity today | $X | $X (after friction) |
| Equity at [N] years | $X | $X |
| Est. market value at [N] years | $X | $X |
| Gain over horizon | +$X | +$X |
| Break-even | — | Year N (or "Beyond [N] yrs") |

---

## Empty / Sparse States

| Condition | Behaviour |
|-----------|-----------|
| No loans at all | Rate Sensitivity and IO Rollover cards disabled (visible, locked, show reason); Purchase and Sale calculators still functional |
| No properties | Rate Sensitivity still works; IO Rollover disabled; Purchase calculator works (portfolio impact shows $0 baseline); Hold vs Reinvest card disabled |
| No valuations | Equity calculation in Model a Purchase excludes unvalued properties with a note |
| No household budget items | Suppress household surplus context everywhere; show inline prompt only in Model a Purchase |
| Loan balance not recorded | Show "balance unknown" with a link to the loan detail page |

---

## Out of Scope

- **CGT computation** — user enters their own estimate; full calculation deferred
- **Extra repayments calculator** — excluded; investors typically use offset accounts
- **Scenario saving / persistence** — all scenarios are ephemeral
- **Stamp duty computation** — user enters manually; state-specific calculation deferred
- **Tax-related outputs** — known gap, not addressed in this page
- **Lender integration or rate lookup** — user enters rates manually
- **Settlement period** — removed; timing affects tax year (out of scope) but not financial proceeds
- **Cashflow / yield comparison in Hold vs Reinvest** — pure capital growth only; adding yield inputs deferred
- **Specific target property modeling** — reinvestment uses an abstract growth rate, not a full purchase flow

---

## Design decisions (resolved)

- Each calculator is a separate page, not a drill-in takeover. Cards on the landing navigate directly.
- Model a Purchase has two collapsible subsections: "One-off costs" and "Annual holding costs" — collapsed by default, showing item count + total when populated.
- The two card categories ("If conditions change" / "If you change the portfolio") are surfaced as eyebrow labels on each card.
- Portfolio impact tiles on Model a Purchase: when equity is drawn from multiple properties, additional tile rows appear for each affected source property's LVR change.
