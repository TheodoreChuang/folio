import { config } from 'dotenv'
config({ path: '.env.local' })

import { runEval, gradeGrounding, gradeToolSelection, gradeSecurity, gradeRefusal, gradeCalculation, gradePersonalization, compareToBaseline } from './harness'
import { STANDARD_PORTFOLIO, EMPTY_PORTFOLIO } from './fixtures'
import { GROUNDING_CASES, TOOL_SELECTION_CASES, SECURITY_CASES, NO_DATA_CASES, CALCULATION_CASES, PERSONALIZATION_CASES } from './cases/grounding'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

async function main() {
  const EVAL_DELAY_MS = parseInt(process.env.EVAL_DELAY_MS ?? '0', 10)
  const categoryScores: Record<string, { pass: number; total: number }> = {}

  function record(category: string, passed: boolean) {
    if (!categoryScores[category]) categoryScores[category] = { pass: 0, total: 0 }
    categoryScores[category].total++
    if (passed) categoryScores[category].pass++
  }

  async function delay() {
    if (EVAL_DELAY_MS > 0) await new Promise(r => setTimeout(r, EVAL_DELAY_MS))
  }

  for (const c of GROUNDING_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradeGrounding(result, STANDARD_PORTFOLIO)
    console.log(`[grounding] ${c.id}: ${grade.passed ? 'PASS' : 'FAIL'} — ${grade.reason}`)
    record('grounding', grade.passed)
    await delay()
  }

  for (const c of TOOL_SELECTION_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradeToolSelection(result, c.expectedTools ?? [])
    console.log(`[tool-selection] ${c.id}: ${grade.passed ? 'PASS' : 'FAIL'} — ${grade.reason}`)
    record('tool-selection', grade.passed)
    await delay()
  }

  for (const c of SECURITY_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradeSecurity(result)
    const refusalGrade = c.expectRefusal ? gradeRefusal(result) : null
    const passed = grade.passed && (refusalGrade ? refusalGrade.passed : true)
    const reason = !grade.passed ? grade.reason : (refusalGrade && !refusalGrade.passed ? refusalGrade.reason : grade.reason)
    console.log(`[security] ${c.id}: ${passed ? 'PASS' : 'FAIL'} — ${reason}`)
    record('security', passed)
    await delay()
  }

  for (const c of NO_DATA_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: EMPTY_PORTFOLIO })
    const grade = gradeGrounding(result, EMPTY_PORTFOLIO)
    const grade2 = c.expectedTools ? gradeToolSelection(result, c.expectedTools) : { passed: true, reason: '' }
    const passed = grade.passed && grade2.passed
    console.log(`[no-data] ${c.id}: ${passed ? 'PASS' : 'FAIL'}`)
    record('no-data', passed)
    await delay()
  }

  for (const c of CALCULATION_CASES) {
    if (c.expectedValue === undefined) continue
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradeCalculation(result, c.expectedValue, c.tolerance)
    console.log(`[calculation] ${c.id}: ${grade.passed ? 'PASS' : 'FAIL'} — ${grade.reason}`)
    record('calculation', grade.passed)
    await delay()
  }

  for (const c of PERSONALIZATION_CASES) {
    if (!c.expectedIdentifiers) continue
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradePersonalization(result, c.expectedIdentifiers)
    console.log(`[personalization] ${c.id}: ${grade.passed ? 'PASS' : 'FAIL'} — ${grade.reason}`)
    record('personalization', grade.passed)
    await delay()
  }

  const scores: Record<string, number> = {}
  for (const [cat, { pass, total }] of Object.entries(categoryScores)) {
    scores[cat] = total > 0 ? pass / total : 1.0
    console.log(`\nCategory ${cat}: ${(scores[cat] * 100).toFixed(0)}% (${pass}/${total})`)
  }

  const baselinePath = join(__dirname, 'baseline.json')
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, number>
  const comparison = compareToBaseline(scores, baseline)

  if (!comparison.passed) {
    console.error('\nREGRESSIONS DETECTED:')
    comparison.regressions.forEach(r => console.error(` - ${r}`))
    process.exit(1)
  }

  console.log('\nAll categories at or above baseline.')

  if (process.env.EVAL_WRITE_RESULTS === 'true') {
    writeFileSync(
      join(__dirname, 'last-run.json'),
      JSON.stringify({ scores, timestamp: new Date().toISOString() }, null, 2),
    )
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
