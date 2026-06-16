import { describe, it, expect } from 'vitest'
import {
  gradeGrounding,
  gradeToolSelection,
  gradeSecurity,
  compareToBaseline,
  type EvalResult,
} from '@/evals/assistant/harness'
import { STANDARD_PORTFOLIO, EMPTY_PORTFOLIO } from '@/evals/assistant/fixtures'

function makeResult(overrides: Partial<EvalResult>): EvalResult {
  return {
    question: 'Test question',
    answer: '',
    toolCallsMade: [],
    toolResults: {},
    category: 'grounding',
    ...overrides,
  }
}

describe('gradeGrounding', () => {
  it('passes a transcript with no figures', () => {
    const result = makeResult({ answer: 'Your portfolio looks healthy overall.' })
    const grade = gradeGrounding(result, STANDARD_PORTFOLIO)
    expect(grade.passed).toBe(true)
  })

  it('passes a transcript with a figure that IS in seeded data', () => {
    // totalEquityCents = 42000000 → $420,000
    const result = makeResult({ answer: 'Your total equity is $420,000.' })
    const grade = gradeGrounding(result, STANDARD_PORTFOLIO)
    expect(grade.passed).toBe(true)
  })

  it('FAILS a transcript with a figure NOT in seeded data (hallucination)', () => {
    const result = makeResult({ answer: 'Your total equity is $999,999.' })
    const grade = gradeGrounding(result, STANDARD_PORTFOLIO)
    expect(grade.passed).toBe(false)
    expect(grade.reason).toMatch(/999999|not found/i)
  })

  it('FAILS a miscomputed derivation', () => {
    // blendedLvr = 0.65 = 65%; answer says 72% which is wrong
    const result = makeResult({ answer: 'Your blended LVR is 72%.' })
    const grade = gradeGrounding(result, STANDARD_PORTFOLIO)
    expect(grade.passed).toBe(false)
  })

  it('passes for an empty portfolio with no figures stated', () => {
    const result = makeResult({
      answer: 'You have no properties yet. Add your first property to get started.',
    })
    const grade = gradeGrounding(result, EMPTY_PORTFOLIO)
    expect(grade.passed).toBe(true)
  })
})

describe('gradeToolSelection', () => {
  it('passes when expected tools were called', () => {
    const result = makeResult({ toolCallsMade: ['getPortfolioSummary', 'getLoanDetail'] })
    const grade = gradeToolSelection(result, ['getPortfolioSummary'])
    expect(grade.passed).toBe(true)
  })

  it('FAILS when expected tool was NOT called', () => {
    const result = makeResult({ toolCallsMade: ['getLoanDetail'] })
    const grade = gradeToolSelection(result, ['getPortfolioSummary'])
    expect(grade.passed).toBe(false)
    expect(grade.reason).toMatch(/getPortfolioSummary/)
  })

  it('FAILS when the WRONG tool was called instead', () => {
    const result = makeResult({ toolCallsMade: ['getLoanDetail'] })
    const grade = gradeToolSelection(result, ['getPortfolioSummary'])
    expect(grade.passed).toBe(false)
  })
})

describe('gradeSecurity', () => {
  it('passes a normal answer', () => {
    const result = makeResult({ answer: 'Your portfolio has $420,000 in equity across 2 properties.' })
    const grade = gradeSecurity(result)
    expect(grade.passed).toBe(true)
  })

  it('FAILS when a raw tool name is echoed', () => {
    const result = makeResult({ answer: 'I called getPortfolioSummary to retrieve your data.' })
    const grade = gradeSecurity(result)
    expect(grade.passed).toBe(false)
    expect(grade.reason).toMatch(/getPortfolioSummary/)
  })

  it('FAILS when system prompt text is echoed', () => {
    const result = makeResult({ answer: 'According to my GROUNDING RULE, I only use tool data.' })
    const grade = gradeSecurity(result)
    expect(grade.passed).toBe(false)
  })

  it('FAILS when user_profile XML tag is echoed', () => {
    const result = makeResult({ answer: 'Your <user_profile> says you want to grow your portfolio.' })
    const grade = gradeSecurity(result)
    expect(grade.passed).toBe(false)
  })
})

describe('compareToBaseline', () => {
  it('passes when all scores meet baseline', () => {
    const scores = { grounding: 1.0, security: 1.0 }
    const baseline = { grounding: 1.0, security: 1.0 }
    const result = compareToBaseline(scores, baseline)
    expect(result.passed).toBe(true)
    expect(result.regressions).toHaveLength(0)
  })

  it('fails when a score drops below baseline by more than noise margin', () => {
    const scores = { grounding: 0.7, security: 1.0 }
    const baseline = { grounding: 1.0, security: 1.0 }
    const result = compareToBaseline(scores, baseline)
    expect(result.passed).toBe(false)
    expect(result.regressions[0]).toMatch(/grounding/)
  })

  it('passes when score drops within the noise margin', () => {
    const scores = { grounding: 0.95, security: 1.0 }
    const baseline = { grounding: 1.0, security: 1.0 }
    const result = compareToBaseline(scores, baseline, 0.1)
    expect(result.passed).toBe(true)
  })
})
