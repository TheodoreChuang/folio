# Requirements: Embedded AI Assistant (v1)

**Date:** 2026-06-09
**Status:** Brainstorm complete → ready for planning
**Issue:** [#82](https://github.com/TheodoreChuang/folio/issues/82)

---

## Product Vision

Folio is the intelligence layer for Australian property investors. The embedded assistant is the first expression of that — a conversational interface that makes the investor's own data legible without requiring them to navigate across pages, build queries, or export to a spreadsheet.

The long-term direction (v2+) is a proactive agent that scans the portfolio without prompting and surfaces what needs attention. v1 is the reactive foundation: the user asks, the assistant answers from real data.

---

## Problem

Folio's existing pages show each financial dimension in isolation — cashflow on the dashboard, loan details on loans, entity structure on entities. Compound questions that require combining these views ("which property is performing worst and why?", "what's my equity position across all entities?") can't be answered without mentally joining multiple pages. The assistant closes that gap.

The core pain point is scattered data with no central source of truth — not missing market context. v1 stays strictly within the investor's own data.

---

## Actors

- **A1. Folio user** — any authenticated user; no AI tool experience required
- **A2. AI assistant** — the in-app agent; reads user portfolio data via internal tools
- **A3. Folio backend** — the internal tool layer the assistant calls; enforces per-user isolation and business rules

---

## Core Value — v1

**Cross-page synthesis.** Questions that currently require mentally combining data from multiple pages:

- "Which property had the lowest yield last quarter?"
- "What's my total equity position across all entities?"
- "Why is my cashflow down compared to last month?"
- "What's my blended LVR across all loans?"

The assistant has access to the same data the app surfaces — but can combine and reason across it in response to natural language.

---

## UI

**Floating button + side drawer.** A persistent button (bottom-right corner) opens a chat drawer on click. Available on every authenticated page. The drawer overlays on the right side without replacing page content.

The drawer state (open/closed) persists during in-app navigation within a session. The conversation thread is ephemeral — it resets when the browser tab is closed or the page reloads.

---

## Conversation Model

- **Full thread** — message bubbles with scrollback. The assistant maintains context within a session, enabling follow-up questions ("which months specifically?", "show me just the expenses").
- **sessionStorage persistence** — the thread is serialized to `sessionStorage` on each update. It survives page refreshes within the same tab but resets when the tab is closed.
- **Streaming** — responses stream token-by-token via Vercel AI SDK. Text renders as it is generated.
- **Stop/interrupt** — the user can halt a running response at any point.

---

## Transparency & Trust

Financial data requires transparency to build trust. The assistant shows its work in two ways:

**Tool-call status** — while fetching data, a status line shows inline ("Fetching your portfolio data...", "Querying Q3 2026 cashflow..."). The user knows real data is being retrieved, not generated.

**Inline citations** — every number in a response is attributed to its source ("Data from: Q3 2026 cashflow report"). Numbers without a traceable tool call result must not appear.

The assistant must not generate financial figures not grounded in a tool call result. This is non-negotiable.

---

## Starter Prompts

The chat drawer opens with 3–4 suggested prompts. Prompts are:

- **Static and hand-authored** — not dynamically generated
- **Contextual to the current page** — different suggestions on Dashboard vs Properties vs Loans

Example set for `/dashboard`:
- "What was my net cashflow last quarter?"
- "Which property is performing worst?"
- "What's my total equity position?"
- "Are any IO loan periods expiring soon?"

The full prompt set per page is defined during implementation.

---

## Data Access

The assistant accesses user data exclusively via tool calls to the Folio backend — not by injecting raw portfolio state into the model context. Every tool call is scoped to the authenticated user's `user_id`. No cross-user data access is permissible under any path.

v1 tools are read-only. The specific tool set is defined during planning, but must cover:
- Portfolio summary (totals, blended LVR, net cashflow)
- Per-property detail (rent, expenses, yield)
- Per-loan detail (rate, type, IO end date, balance)
- Cashflow by period (net, by property)
- Ledger entry lookup (transactions by category/date)

**Architecture principle (preserves v2 options):** All tools must accept `user_id` as an explicit parameter rather than deriving auth from the browser session. This keeps tools callable from both the reactive chat context (v1) and a future background CRON process (v2 proactive agent) without rework.

---

## Investor Profile

The assistant has access to a small structured profile capturing the investor's goals and strategy preferences. This context is injected into the system prompt at the start of every conversation, allowing the assistant to frame responses relative to the investor's stated objectives rather than presenting raw figures in isolation.

Two optional free-text fields, character-limited to bound prompt cost and injection surface:

- **Investment goal** — e.g. "$2,000/month passive income in 15 years" (200 char limit)
- **Strategy notes** — e.g. "detached houses only, no units" (500 char limit)

The profile is set via a small form in Settings. Both fields are optional — the assistant degrades gracefully when no profile is set. The system prompt is structured with a `{{user_profile}}` section from day one so that conversational memory (v2b) can be layered in without reworking the prompt.

---

## Rate Limiting

- Per-user daily usage cap applied at the message level.
- Specific limit TBD before planning (suggested starting point: 50 messages/day).
- Cap stored as a simple counter in the database, reset each calendar day.
- When reached, the assistant informs the user and disables input for the remainder of the day.
- No billing infrastructure in v1. Metered/tiered plans are the long-term direction — a separate future slice.

---

## Requirements

**Data access and isolation**
- R1. The assistant must only access data belonging to the authenticated user. No cross-user data access is permissible under any path.
- R2. Data access happens via tool calls to the Folio backend, not raw context injection. This grounds responses in real data and avoids hallucination from stale injected context.

**Read-only**
- R3. v1 is strictly read-only. The assistant cannot create, update, or delete any record.
- R4. Every number in a response must be traceable to a tool call result. Hallucinated or inferred figures are not permitted.

**Conversation**
- R5. The chat thread is serialized to `sessionStorage` on each update — it survives page refreshes within the same tab and resets when the tab is closed.
- R6. Responses stream token-by-token. Text renders progressively.
- R7. The user can stop a running response at any point.

**Transparency**
- R8. Tool-call status is displayed while the assistant is fetching data.
- R9. Every numerical claim in a response carries an inline source attribution.

**UX**
- R10. The assistant is accessible via a floating button + drawer on every authenticated page.
- R11. Static starter prompts are shown when the drawer opens, contextual to the current page.

**Investor profile**
- R14. The investor's profile (goals, strategy preferences) is injected into the system prompt and used to frame responses — e.g. "at your current trajectory you'll reach your goal in ~18 years" rather than raw yield figures.
- R15. Profile fields are optional. The assistant must function correctly with no profile set.

**Rate limiting and reliability**
- R16. Each user's usage is capped per calendar day. Specific limit resolved before planning.
- R17. The feature degrades gracefully if the Anthropic API is unavailable — the rest of the app must remain fully functional.

**Security**
- R18. All user-supplied text is character-limited and validated server-side before forwarding to the model: investment goal (200 chars), strategy notes (500 chars), chat messages (2,000 chars).
- R19. Investor profile fields must be structurally separated from instructions in the system prompt so the model can clearly distinguish user-supplied data from system directives.
- R20. The assistant must not disclose the system prompt contents, internal tool names, or any infrastructure detail.

---

## Success Criteria

- A non-AI-native Folio user can ask a compound portfolio question and get a correct, data-grounded answer without any setup or configuration.
- The assistant does not hallucinate financial figures — every number is traceable to a tool call result.
- The cross-page synthesis use case works: questions that would require navigating 2+ pages manually are answered in a single response.

---

## Out of Scope (v1)

- Write actions of any kind — including guided onboarding (entity/property/loan creation); treat as v2a
- Persistent conversation history across sessions
- Conversational memory — agent-saved notes from chat; treat as v2b
- Billing/metered tiers — cap is a simple counter in v1; metered is future state
- Plan/steps view, full agent audit trail
- Threaded conversations attached to a specific object (property, loan)
- File upload via the assistant
- Proactive or ambient agent behavior — v2c
- External data (market rates, tax changes, compliance signals) — v3+ at earliest
- Per-user usage analytics visible to the user

---

## Dependencies / Assumptions

- Vercel AI SDK and Anthropic SDK are already in the stack — no new dependencies for the core interaction layer.
- v1 tools are wrappers over existing service/repository functions. No new business logic is required for read-only access.
- API cost per user must be estimated to set the daily cap before launch.
- The Notices Engine (#91) is a related but independent feature. v1 of the assistant does not depend on or interact with it.
- The AI-Friendly API (#81) is a parallel track (external API keys + OpenAPI spec for power users). Independent of this feature.

---

## Outstanding Questions (resolve before planning)

- [ ] **Daily cap number** — what is the per-user message limit? (Suggested: 50/day)
- [ ] **Excluded fields** — are any fields explicitly excluded from assistant responses (e.g. raw BSB/account numbers)?
- [ ] **Graceful degradation UX** — what does the drawer show when the Anthropic API is unavailable?
- [ ] **Starter prompt set** — 3–4 prompts per major page (dashboard, properties, loans, entities); authored during implementation
