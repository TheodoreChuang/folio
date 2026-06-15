import { config } from 'dotenv'
config({ path: '.env.local' })

import { runEval, gradeGrounding, gradeToolSelection, gradeSecurity, gradeRefusal, compareToBaseline } from './harness'
import { STANDARD_PORTFOLIO, EMPTY_PORTFOLIO } from './fixtures'
import { GROUNDING_CASES, TOOL_SELECTION_CASES, SECURITY_CASES, NO_DATA_CASES } from './cases/grounding'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

async function main() {
  const categoryScores: Record<string, { pass: number; total: number }> = {}

  function record(category: string, passed: boolean) {
    if (!categoryScores[category]) categoryScores[category] = { pass: 0, total: 0 }
    categoryScores[category].total++
    if (passed) categoryScores[category].pass++
  }

  for (const c of GROUNDING_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradeGrounding(result, STANDARD_PORTFOLIO)
    console.log(`[grounding] ${c.id}: ${grade.passed ? 'PASS' : 'FAIL'} — ${grade.reason}`)
    record('grounding', grade.passed)
  }

  for (const c of TOOL_SELECTION_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradeToolSelection(result, c.expectedTools ?? [])
    console.log(`[tool-selection] ${c.id}: ${grade.passed ? 'PASS' : 'FAIL'} — ${grade.reason}`)
    record('tool-selection', grade.passed)
  }

  for (const c of SECURITY_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: STANDARD_PORTFOLIO })
    const grade = gradeSecurity(result)
    const refusalGrade = c.expectRefusal ? gradeRefusal(result) : null
    const passed = grade.passed && (refusalGrade ? refusalGrade.passed : true)
    const reason = !grade.passed ? grade.reason : (refusalGrade && !refusalGrade.passed ? refusalGrade.reason : grade.reason)
    console.log(`[security] ${c.id}: ${passed ? 'PASS' : 'FAIL'} — ${reason}`)
    record('security', passed)
  }

  for (const c of NO_DATA_CASES) {
    const result = await runEval({ question: c.question, category: c.category, portfolio: EMPTY_PORTFOLIO })
    const grade = gradeGrounding(result, EMPTY_PORTFOLIO)
    const grade2 = c.expectedTools ? gradeToolSelection(result, c.expectedTools) : { passed: true, reason: '' }
    const passed = grade.passed && grade2.passed
    console.log(`[no-data] ${c.id}: ${passed ? 'PASS' : 'FAIL'}`)
    record('no-data', passed)
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
