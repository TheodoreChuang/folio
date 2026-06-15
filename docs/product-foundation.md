# Folio

**Command centre for residential property investors**

> This document defines the product, user, and design principles for Folio.  
> It should be read before making product, UX, or design decisions.

---

# 1. Product Vision

Folio is a **centralised decision layer** for residential property investors.

It consolidates fragmented financial data, surfaces what matters, and provides
clarity on portfolio performance—without requiring perfect inputs or complex setup.

The goal is not to replace every tool (email, property managers, accountants),
but to become the **system of clarity and control** investors rely on.

> A place where an investor can answer:
>
> - “Am I okay?”
> - “What needs attention?”
> - “What should I do next?”

---

# 2. Target User

**Primary user:**
Residential property investors with **2–10 properties** who likely:

- Use spreadsheets to track performance
- Rely on email + property managers for operations
- Care about cashflow, leverage, and long-term growth

**Characteristics:**

- Analytical, but not necessarily technical
- Comfortable with numbers, but frustrated by fragmentation
- Time-constrained and mentally overloaded

**Not the target (for now):**

- First-time investors (too early)
- Large-scale / commercial investors (too complex)
- Fully passive investors (low engagement)

---

# 3. Core Problems

### 1. Fragmented Information

- Financials in spreadsheets
- Documents in folders
- Communication in email
- No single source of truth

---

### 2. Unclear Portfolio Health

- Hard to quickly answer:
  - Am I positively or negatively geared?
  - Is performance improving or declining?
- Requires manual aggregation

---

### 3. Poor Property Comparability

- No consistent way to evaluate:
  - Yield
  - Cashflow
  - Expense ratios
- Difficult to identify underperformers

---

### 4. Hidden Financial Drift

- Expenses creep up unnoticed
- Rent inconsistencies go unchecked
- Small issues compound over time

---

### 5. Cognitive Overhead

- Investors mentally track:
  - Tasks
  - Follow-ups
  - Lease events
- No structured system for visibility

---

# 4. Product Principles

### 1. Clarity over Completeness

Start useful with partial data.  
Avoid requiring perfect inputs.

---

### 2. Decision-Oriented, Not Data-Oriented

Every screen answers a question.  
No raw data dumps without purpose.

---

### 3. Surface What Matters

Highlight:

- Changes
- Outliers
- Risks

Not just totals.

---

### 4. Progressive Depth

- High-level overview first
- Drill-down when needed

---

### 5. Investor-Controlled

- No forced integrations
- No opaque calculations
- Transparent assumptions

---

### 6. Calm and Trustworthy

- No hype
- No noise
- No unnecessary complexity

---

# 5. Brand Direction

## Core Theme

> **Calm control over complex assets**

---

## Tone

- Rational
- Measured
- Analytical
- Quietly confident

**Avoid:**

- Hype-driven fintech language
- Trading/gambling energy
- Over-promising automation

---

## Voice Examples

**Do:**

- “Net cashflow is down 8% this month”
- “Property 3 has the highest expense ratio”

**Don’t:**

- “Your portfolio is crushing it 🚀”
- “Maximise your wealth now!”

---

# 6. What Sets Folio Apart

- Built for **real investor workflows**, not idealised ones
- Accepts **messy, incomplete data**
- Focuses on **decisions, not bookkeeping**
- Bridges **financial insight + operational awareness**

---

# 7. Design System

All designs live in `docs/visual-designs/`. Each screen has its own HTML file.
Shared styles are in `folio.css`. Visual designs are the source of truth for UI decisions.

---

# 8. Scope Discipline (Important)

Folio is **not trying to be:**

- Accounting software
- Property management software
- A fully automated aggregator

It is:

> The layer that makes sense of everything else
