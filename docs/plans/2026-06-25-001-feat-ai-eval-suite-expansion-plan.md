---
title: "feat: Expand AI eval suite — calculation and personalization graders"
type: feat
date: 2026-06-25
origin: docs/brainstorms/2026-06-25-ai-eval-strategy-requirements.md
---

# feat: Expand AI eval suite — calculation and personalization graders

Formalise the v1 assistant eval suite before v2b (conversational memory). A single PR closes
the two remaining quality gaps — calculation accuracy and personalization depth — expands the
case library from 9 to ~21 cases, wires up `pnpm eval` for local running, and updates the
developer docs. After this PR, every future change to the assistant surface has automated
quality gates in CI.

---

## Requirements

**Graders**

- R1. `gradeCalculation(result, expectedValue, tolerance?)` extracts numbers from the answer and passes when `expectedValue` appears within `tolerance` (default `0.01`) relative tolerance.
- R2. `gradePersonalization(result, expectedIdentifiers)` passes when at least one identifier from `expectedIdentifiers` appears in the answer (case-insensitive).

**Type changes**

- R3. `EvalCase` gains three optional fields: `expectedValue?: number`, `tolerance?: number`, `expectedIdentifiers?: string[]`.
- R4. The `category` union in `EvalCase` gains `'calculation'` and `'personalization'`.

**Case library**

- R5. Case count expands from 9 to ~21: 5 grounding, 4 tool-selection, 4 security, 2 no-data, 3 calculation, 3 personalization.
- R6. Each calculation case sets `expectedValue` (precomputed from `STANDARD_PORTFOLIO` fixture); each personalization case sets `expectedIdentifiers` drawn from fixture nicknames and lender names.

**Runner**

- R7. `run.ts` dispatches `gradeCalculation` for `category: 'calculation'` cases and `gradePersonalization` for `category: 'personalization'` cases.
- R8. `run.ts` reads an optional `EVAL_DELAY_MS` env var (default `0`) and inserts that delay between sequential case executions when non-zero.

**Infrastructure**

- R9. `package.json` gains `"eval": "tsx evals/assistant/run.ts"`.
- R10. `evals/assistant/baseline.json` gains `"calculation"` and `"personalization"` entries, set to the pass rates from the first successful run.

**Docs**

- R11. `docs/testing-strategy.md` gains a subsection under "Testing the Assistant" covering: local run command, when to run, how to add a case (ID convention, field shapes, failure-first process), and baseline update flow.

**Unit tests**

- R12. `__tests__/lib/assistant-eval-harness.test.ts` gains `describe` blocks for `gradeCalculation` and `gradePersonalization`.

---

## Key Technical Decisions

- **Tolerance comparison**: `gradeCalculation` reuses the relative-tolerance check from `gradeGrounding` — `Math.abs(v - n) / (Math.abs(v) + 1) < tolerance`. This handles cent-to-dollar conversions uniformly and avoids introducing a new numeric comparison contract.

- **Grader signatures are pure and narrow**: `gradeCalculation(result, expectedValue, tolerance = 0.01)` and `gradePersonalization(result, expectedIdentifiers)` receive only what they need — consistent with existing grader signatures, not the full `EvalCase` object.

- **Case file stays unified**: All cases remain in `evals/assistant/cases/grounding.ts`. At ~20 cases across 6 categories, per-category file splitting adds no discoverability benefit and makes `run.ts` imports more fragile.

- **run.ts dispatch stays explicit**: Each category loop is written out separately (matching the existing pattern for the four current categories). No generic dispatch abstraction — the pattern is clear at 6 loops and a loop-per-category is easy to grep.

- **EVAL_DELAY_MS is opt-in**: Default `0` means no behavior change unless set. Do not add a default delay; add it only if 429s appear in practice.

- **expectedValue uniqueness**: Precomputed values for calculation cases must not coincide with raw fixture fields — if the value is already in the fixture, `gradeGrounding` already covers it and a dedicated calculation case adds nothing. Verify each `expectedValue` is only reachable via the intended derivation (see calculation grader test scenarios below).

---

## Scope Boundaries

**Deferred for later**
- `EVAL_WRITE_RESULTS=true` baseline-write automation — currently writes `last-run.json`; updating `baseline.json` remains a manual step after reviewing scores, per the brainstorm's intent.
- v2b conversational memory (separate PR, architectural notes in issue #82).
- v2a guided onboarding writes (separate issue).

**Outside this product's identity**
- Tone / financial-advice boundary detection grader — excluded by brainstorm; built-in model guardrails provide sufficient coverage.
- LLM-judge grader — deferred pending evidence that deterministic graders prove insufficient.

---

## Implementation Units

### U1. Extend `EvalCase` type and add new graders to harness

**Goal:** `EvalCase` carries the new fields; `gradeCalculation` and `gradePersonalization` are exported from `harness.ts` and ready for cases and runner.

**Requirements:** R1, R2, R3, R4

**Dependencies:** none

**Files:**
- `evals/assistant/cases/grounding.ts` — extend `EvalCase` type
- `evals/assistant/harness.ts` — add `gradeCalculation`, `gradePersonalization`

**Approach:**
- Add three optional fields to `EvalCase`; extend the `category` union.
- `gradeCalculation`: extract numeric tokens from `result.answer` using the same regex as `gradeGrounding` (`/\$?[\d,]+(?:\.\d+)?%?/g`), parse to floats, then check whether any token is within `tolerance` of `expectedValue` using relative tolerance. Return `{ passed: false, reason: ... }` if no token matches.
- `gradePersonalization`: iterate `expectedIdentifiers`, return `passed: true` on first case-insensitive substring hit. If none match, return `passed: false` with the identifier list in the reason.

**Test scenarios:** Covered by U2.

**Verification:** TypeScript compiles with no errors; existing grader exports are unchanged.

---

### U2. Unit tests for new graders

**Goal:** Deterministic test coverage for `gradeCalculation` and `gradePersonalization`, consistent with the existing `describe` blocks in the harness test file.

**Requirements:** R12

**Dependencies:** U1

**Files:**
- `__tests__/lib/assistant-eval-harness.test.ts`

**Approach:** Add two `describe` blocks using the existing `makeResult` helper.

**Patterns to follow:** Existing `describe` blocks in `__tests__/lib/assistant-eval-harness.test.ts`.

**Test scenarios:**

`gradeCalculation`:
- Passes when the answer contains exactly `expectedValue` (e.g., answer: "Average yield is 2.45%", expectedValue: 2.45).
- Passes when the answer contains a value within 1% tolerance (e.g., answer states 2.44%, expectedValue 2.45).
- Fails when the answer contains a number but it differs by more than 1% from `expectedValue`.
- Fails when the answer contains no numbers (expected value is never stated).
- Passes when `tolerance` is explicitly overridden and the answer is within the wider band.

`gradePersonalization`:
- Passes when the first identifier in `expectedIdentifiers` appears in the answer.
- Passes when a later identifier (not the first) appears in the answer.
- Passes with a case-insensitive match (identifier "Acacia", answer contains "acacia").
- Fails when none of the identifiers appear in the answer.
- Fails for a generic answer that mentions neither property nor lender by name.

**Verification:** `pnpm test` passes; both new `describe` blocks run and all cases pass.

---

### U3. Expand case library

**Goal:** Case library has ~20 cases across all 6 categories, with correct field usage for each new category.

**Requirements:** R5, R6

**Dependencies:** U1

**Files:**
- `evals/assistant/cases/grounding.ts`

**Approach:** Add `CALCULATION_CASES` and `PERSONALIZATION_CASES` arrays; extend the existing four arrays with the additional cases below.

**Precomputed values from `STANDARD_PORTFOLIO`:**
- Average net yield: `(2.8 + 2.1) / 2 = 2.45` — reachable only via cross-property averaging, not a raw fixture field.
- Net cashflow after mortgage: `netAfterMortgageCents / 100 = 800` — this IS a raw fixture field (`netAfterMortgageCents`), so `gradeGrounding` already covers it. Use it as a calculation case to verify arithmetic framing triggers the right tool path; confirm the test is still meaningful.
- Equity above 70% LVR: `totalValueCents * 0.70 / 100 - totalDebtCents / 100 = 840000 - 780000 = 60000` — reachable only via derived computation, not a raw field. Use this as the primary uniqueness-verified calculation case.

**Target distribution:**

| Category | Current | Target | New cases |
|---|---|---|---|
| grounding | 3 | 5 | +2 |
| tool-selection | 2 | 4 | +2 |
| security | 3 | 4 | +1 |
| no-data | 1 | 2 | +1 |
| calculation | 0 | 3 | +3 |
| personalization | 0 | 3 | +3 |

**Case IDs:** Continue the existing convention (`grounding-004`, `grounding-005`, `tool-003`, etc.). Calculation: `calc-001` through `calc-003`. Personalization: `personal-001` through `personal-003`.

**Test scenarios:**
- All new cases compile without TypeScript errors.
- Calculation cases have `expectedValue` set and `category: 'calculation'`.
- Personalization cases have `expectedIdentifiers` set and `category: 'personalization'`.
- No calculation `expectedValue` collides with a raw field in `STANDARD_PORTFOLIO` (verified by inspection against `gradeGrounding`'s `knownValues` set for cases where uniqueness matters).

**Verification:** `pnpm tsc --noEmit` passes; count of exported cases equals target distribution.

---

### U4. Update `run.ts` — new grader dispatch and `EVAL_DELAY_MS`

**Goal:** Runner executes all 6 categories, calls the correct grader for each, and supports optional inter-case delay.

**Requirements:** R7, R8

**Dependencies:** U1, U3

**Files:**
- `evals/assistant/run.ts`

**Approach:**
- Import `gradeCalculation`, `gradePersonalization` from `./harness`.
- Import `CALCULATION_CASES`, `PERSONALIZATION_CASES` from `./cases/grounding`.
- Add two loops following the exact pattern of existing category loops. Calculation loop calls `gradeCalculation(result, c.expectedValue!, c.tolerance)`. Personalization loop calls `gradePersonalization(result, c.expectedIdentifiers!)`.
- Read `EVAL_DELAY_MS = parseInt(process.env.EVAL_DELAY_MS ?? '0', 10)` at the top of `main()`. Insert `if (EVAL_DELAY_MS > 0) await new Promise(r => setTimeout(r, EVAL_DELAY_MS))` between each case run across all loops.

**Patterns to follow:** Existing category loops in `evals/assistant/run.ts`.

**Test scenarios:**
- Test expectation: none — runner is a script; its behavior is validated by running `pnpm eval` end-to-end (U5 verification). Deterministic grader logic is covered by U2.

**Verification:** `pnpm tsc --noEmit` passes; `pnpm eval` runs to completion with the new categories appearing in console output.

---

### U5. Add `pnpm eval` script and update `baseline.json`

**Goal:** `pnpm eval` works from the repo root; `baseline.json` covers all 6 categories.

**Requirements:** R9, R10

**Dependencies:** U4 (runner must be complete before first real run)

**Files:**
- `package.json`
- `evals/assistant/baseline.json`

**Approach:**
- Add `"eval": "tsx evals/assistant/run.ts"` to the `scripts` block in `package.json`.
- Run `EVAL_WRITE_RESULTS=true pnpm eval` (requires `AI_GATEWAY_API_KEY` in `.env.local`), review `evals/assistant/last-run.json`, then update `baseline.json` with the observed pass rates for `calculation` and `personalization`. Keep existing entries unchanged if scores held.
- If the first run shows a category below 1.0, investigate before committing — do not paper over a real failure with a low initial baseline.

**Test scenarios:**
- `pnpm eval` exits 0 when all categories meet baseline.
- `baseline.json` parses as valid JSON with all 6 category keys.

**Verification:** `pnpm eval` exits 0 in a clean environment with `AI_GATEWAY_API_KEY` set.

---

### U6. Update `docs/testing-strategy.md`

**Goal:** Developer docs reflect the expanded eval suite: how to run, when to run, how to add a case, and how to update the baseline.

**Requirements:** R11

**Dependencies:** U5

**Files:**
- `docs/testing-strategy.md`

**Approach:** Extend the existing "Testing the Assistant" section. Add a subsection with:
- **Local run:** `pnpm eval` (requires `AI_GATEWAY_API_KEY` in `.env.local`).
- **When to run:** before pushing any change to `lib/assistant/`, `lib/ai/`, or `lib/profile/`.
- **Adding a case:** describe the `EvalCase` fields, the ID convention (`<category>-NNN`), and the failure-first process (real failure → new case → fix).
- **Updating the baseline:** `EVAL_WRITE_RESULTS=true pnpm eval` writes `evals/assistant/last-run.json`; review scores; manually update `baseline.json`; commit alongside the prompt change.

**Patterns to follow:** Existing prose style in `docs/testing-strategy.md` — concise, no filler.

**Test scenarios:**
- Test expectation: none — docs change with no behavioral surface.

**Verification:** Content accurately reflects the shipped implementation; no stale references to the 8-case count or missing grader names.

---

## Risks & Dependencies

- **expectedValue uniqueness**: If a calculation `expectedValue` coincides with a raw fixture field, `gradeGrounding` already covers it and the case adds no signal. Verify at U3 by cross-checking against the `knownValues` set constructed in `gradeGrounding`.
- **Live model flakiness**: New cases run against the live model (haiku-4.5). The 0.1 noise margin in `compareToBaseline` absorbs single-case variance, but a systematic model change could drop scores. Deterministic unit tests (U2) cover grader logic independently of model output.
- **`AI_GATEWAY_API_KEY` prerequisite**: U5's baseline update step requires the key. CI already has it; local dev must have it in `.env.local`. Document this clearly in U6.
